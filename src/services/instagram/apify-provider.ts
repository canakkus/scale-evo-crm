import { normalizeInstagramHandle, normalizeUrl } from "@/lib/utils";
import { sanitizeCaption } from "./caption";
import { daysSince, emptyProfile, type InstagramProfile } from "./types";

/**
 * ============================================================
 * APIFY — instagram-profile-scraper
 * ============================================================
 * Dritte Datenquelle, weil Metas `business_discovery` ohne
 * Advanced Access mit `(#10) Application does not have permission`
 * scheitert. Apify liefert genau die Felder, auf denen das Scoring
 * beruht — Bio, Link-in-Bio, Followerzahl, letzter Post.
 *
 * KOSTEN: ca. $1,60 pro 1.000 Profile. Jeder Aufruf kostet echtes
 * Geld. Deshalb gilt:
 *   - Vorfilter vor jedem Run (siehe enrichment.ts)
 *   - Sammel-Run statt Einzelabfragen (`usernames: string[]`)
 *   - Ergebnis wandert in den Snapshot-Cache (30 Tage)
 *   - KEIN automatischer Retry: ein 408 heisst NICHT, dass der Run
 *     abgebrochen wurde. Er laeuft serverseitig weiter und wird
 *     abgerechnet — ein Retry zahlt schlicht doppelt.
 *
 * Rangfolge: Sobald Meta Advanced Access gewaehrt, bekommt die
 * Graph API automatisch wieder Vorrang. Am Code ist dafuer nichts
 * zu aendern (siehe resolve-provider.ts).
 * ============================================================
 */

const DEFAULT_ACTOR = "apify~instagram-profile-scraper";
const API_BASE = "https://api.apify.com/v2/acts";

/**
 * Deutlich unter dem serverseitigen Limit von 300s, damit ein
 * haengender Run keinen Next.js-Request blockiert.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

/** Mehr Handles pro Run erhoehen nur das Risiko, in den 408 zu laufen. */
export const APIFY_MAX_BATCH = 25;

/**
 * Obergrenze fuer bezahlte Profilabrufe pro rollender Stunde, ueber ALLE
 * Laeufe hinweg. Kein Sicherheitsmechanismus, sondern eine Handbremse gegen
 * Versehen — ein versehentlich wiederholter Klick auf "Profile prüfen" oder
 * ein `force`-Aufruf in einer Schleife soll nicht unbemerkt Geld verbrennen.
 * Bei ~$1,60/1.000 Profilen deckelt der Standardwert den Schaden auf wenige
 * Cent pro Stunde. Ueber APIFY_HOURLY_LIMIT anpassbar.
 */
export function getHourlyFetchLimit(): number {
  const raw = Number(process.env.APIFY_HOURLY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 150;
}

export type ApifyConfig = {
  token: string;
  actor: string;
  timeoutMs: number;
};

/** Liest die Konfiguration; null, wenn kein Token gesetzt ist. */
export function getApifyConfig(): ApifyConfig | null {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return null;

  const actor = process.env.APIFY_INSTAGRAM_ACTOR?.trim() || DEFAULT_ACTOR;
  const timeout = Number(process.env.APIFY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return {
    token,
    // Apify akzeptiert sowohl "user/actor" als auch "user~actor" — im Pfad
    // muss die Tilde stehen, sonst zerlegt der Slash die URL.
    actor: actor.replace("/", "~"),
    timeoutMs: Number.isFinite(timeout) && timeout > 5_000 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Zustand des letzten Laufs. `unauthorized` und `no-credits` sind
 * bewusst eigene, sichtbare Zustaende: eine abgelaufene Kreditkarte
 * wuerde sonst lautlos wochenlang "unbekannt" produzieren, und
 * niemand verstuende, warum alle Scores flach sind.
 */
export type ApifyStatus = "ok" | "not-configured" | "unauthorized" | "no-credits" | "timeout" | "error";

export type ApifyRunResult = {
  status: ApifyStatus;
  /** Klartext fuer die UI. null, wenn alles glatt lief. */
  note: string | null;
  /** Profile je normalisiertem Handle. Fehlt ein Handle, kam nichts zurueck. */
  profiles: Map<string, InstagramProfile>;
  /** Roh-Items je Handle — wandern unveraendert in den Snapshot. */
  raw: Map<string, unknown>;
};

const STATUS_NOTES: Record<Exclude<ApifyStatus, "ok">, string> = {
  "not-configured": "Apify nicht konfiguriert (APIFY_TOKEN fehlt).",
  unauthorized: "Apify-Token abgelehnt — bitte APIFY_TOKEN prüfen. Es wird ohne Bio-Daten weitergearbeitet.",
  "no-credits": "Apify-Guthaben aufgebraucht — es wird ohne Bio-Daten weitergearbeitet.",
  timeout:
    "Apify hat nicht rechtzeitig geantwortet. Der Run läuft dort weiter und wird abgerechnet — " +
    "kein automatischer Neuversuch. Bitte mit weniger Profilen erneut starten.",
  error: "Apify nicht erreichbar — es wird ohne Bio-Daten weitergearbeitet.",
};

/** true, wenn der Zustand ein sichtbarer Ausfall ist (nicht bloss "nicht eingerichtet"). */
export function isApifyOutage(status: ApifyStatus): boolean {
  return status === "unauthorized" || status === "no-credits" || status === "timeout" || status === "error";
}

type ApifyItem = Record<string, unknown>;

/**
 * Alle Schluessel, unter denen der Actor den Link-in-Bio ausliefert.
 * Wird an ZWEI Stellen gebraucht und muss deshalb dieselbe Liste sein:
 * zum Auslesen (`pickExternalUrl`) und zur Schema-Pruefung (`hasLinkField`).
 */
const LINK_KEYS = ["externalUrl", "external_url", "externalUrls", "website", "bioLink"] as const;

/**
 * DER entscheidende Guard. Der Actor liefert fuer Profile ohne Link
 * `externalUrl: null` — der Schluessel ist also da, nur der Wert leer.
 * Genau daran laesst sich "geprueft, es gibt keinen" von "das Feld existiert
 * nicht mehr" unterscheiden.
 *
 * Wird hier auf `.some()` ueber den ganzen Batch ausgewichen, legitimiert ein
 * vollstaendiger Datensatz alle kaputten daneben. Deshalb ausdruecklich
 * PRO ITEM.
 */
function hasLinkField(item: ApifyItem): boolean {
  return LINK_KEYS.some((key) => key in item);
}

export class InstagramApifyProvider {
  constructor(private readonly config: ApifyConfig) {}

  /** Einzelprofil — bestehende Signatur, intern ein Batch mit einem Eintrag. */
  async fetchProfile(input: string): Promise<InstagramProfile> {
    const handle = normalizeInstagramHandle(input);
    if (!handle) return emptyProfile(String(input ?? "").slice(0, 40), "Kein gültiges Instagram-Handle.");

    const result = await this.fetchProfiles([handle]);
    return (
      result.profiles.get(handle) ??
      emptyProfile(handle, result.note ?? "Apify lieferte keine Profildaten.")
    );
  }

  /**
   * Sammel-Run: mehrere Handles in EINEM Actor-Run. Deduplizierung
   * passiert hier, damit doppelte Leads nicht doppelt bezahlt werden.
   */
  async fetchProfiles(inputs: string[]): Promise<ApifyRunResult> {
    const handles = dedupeHandles(inputs);
    if (handles.length === 0) {
      return { status: "ok", note: null, profiles: new Map(), raw: new Map() };
    }

    const url = `${API_BASE}/${this.config.actor}/run-sync-get-dataset-items`;

    let items: ApifyItem[];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usernames: handles }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
        cache: "no-store",
      });

      if (!response.ok) {
        return this.failure(statusFromHttp(response.status), handles);
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        return this.failure("error", handles, "Apify lieferte kein Dataset-Array — Schnittstelle geändert?");
      }
      items = payload.filter((item): item is ApifyItem => isRecord(item));
    } catch (error) {
      // AbortSignal.timeout() wirft TimeoutError, ein abgebrochener Socket AbortError.
      const name = error instanceof Error ? error.name : "";
      const timedOut = name === "TimeoutError" || name === "AbortError";
      return this.failure(timedOut ? "timeout" : "error", handles);
    }

    return this.map(handles, items);
  }

  private failure(status: ApifyStatus, handles: string[], override?: string): ApifyRunResult {
    const note = override ?? (status === "ok" ? null : STATUS_NOTES[status]);
    const profiles = new Map<string, InstagramProfile>();
    // Jeder Fehlerfall liefert ein incomplete-Profil mit sprechender Note,
    // statt zu werfen — der Scout darf nicht abstuerzen, weil Apify streikt.
    for (const handle of handles) profiles.set(handle, emptyProfile(handle, note ?? "Apify-Fehler."));
    return { status, note, profiles, raw: new Map() };
  }

  /**
   * Mapping mit dem Schutz gegen FALSCHE (statt nur fehlende) Daten.
   *
   * `externalUrlKnown` wird PRO ITEM entschieden und haengt an der
   * Schluessel-Praesenz des Link-Felds (`hasLinkField`). Benennt Apify das
   * Feld um — `externalUrls[]` kam historisch genau so dazu —, faellt das
   * betroffene Item auf "unbekannt" zurueck, statt jedem Lead faelschlich
   * "Kein Link in Bio +25" und den Tag NO_WEBSITE zu verpassen.
   *
   * Der Batch-Blick dient nur noch der Run-Note fuer die Oberflaeche, nie
   * der Bewertung eines einzelnen Datensatzes.
   */
  private map(handles: string[], items: ApifyItem[]): ApifyRunResult {
    const itemsWithLinkField = items.filter(hasLinkField).length;

    const profiles = new Map<string, InstagramProfile>();
    const raw = new Map<string, unknown>();

    for (const item of items) {
      const username = normalizeInstagramHandle(pickString(item, ["username", "userName", "ownerUsername"]));
      if (!username) continue;

      const requested = handles.find((handle) => handle === username) ?? null;
      const key = requested ?? username;

      raw.set(key, item);
      profiles.set(key, mapItem(key, item, { matchesRequest: requested !== null }));
    }

    for (const handle of handles) {
      if (profiles.has(handle)) continue;
      profiles.set(
        handle,
        emptyProfile(handle, "Apify lieferte für dieses Profil keinen Datensatz (gelöscht, umbenannt oder gesperrt?)."),
      );
    }

    // Kein einziges Item mit Link-Feld bei vorhandenen Daten: das ist keine
    // Eigenheit einzelner Profile mehr, sondern eine Formataenderung.
    const note =
      items.length > 0 && itemsWithLinkField === 0
        ? "Apify-Antwort enthält kein Link-in-Bio-Feld — Datenformat vermutlich geändert. " +
          "Scoring läuft ohne dieses Signal weiter."
        : null;

    return { status: "ok", note, profiles, raw };
  }
}

/** Normalisiert, verwirft Ungueltiges und dedupliziert — in dieser Reihenfolge. */
export function dedupeHandles(inputs: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const input of inputs) {
    const handle = normalizeInstagramHandle(input);
    if (handle) seen.add(handle);
  }
  return [...seen];
}

function statusFromHttp(code: number): ApifyStatus {
  if (code === 401 || code === 403) return "unauthorized";
  if (code === 402) return "no-credits";
  if (code === 408) return "timeout";
  return "error";
}

function mapItem(
  handle: string,
  item: ApifyItem,
  flags: { matchesRequest: boolean },
): InstagramProfile {
  const bio = pickString(item, ["biography", "bio"]);
  const externalUrl = pickExternalUrl(item);
  const followerCount = pickNumber(item, ["followersCount", "followers_count", "followers"]);
  const followingCount = pickNumber(item, ["followsCount", "followingCount", "follows_count"]);
  const postCount = pickNumber(item, ["postsCount", "posts_count", "mediaCount"]);
  const isPrivate = pickBoolean(item, ["private", "isPrivate", "is_private"]);
  const isVerified = pickBoolean(item, ["verified", "isVerified", "is_verified"]);
  const isBusinessAccount = pickBoolean(item, ["isBusinessAccount", "businessAccount", "is_business_account"]);
  const displayName = pickString(item, ["fullName", "full_name", "name"]);

  const posts = readLatestPosts(item);
  const lastPostAt = posts[0]?.at ?? null;
  const latestPostCaption = sanitizeCaption(posts[0]?.caption ?? null);

  /**
   * Item-Guard, zwei Stufen:
   *
   * 1. `plausible` — das Handle passt und der Datensatz traegt echten Inhalt.
   *    `{ username, isPrivate: false }` allein reicht dafuer bewusst NICHT:
   *    ein Profil ohne jede Zahl und ohne Namen ist kein Datensatz.
   * 2. `linkFieldPresent` — nur damit darf `externalUrlKnown` gesetzt werden.
   *    Das ist die einzige Stelle, an der ein Formatwechsel bei Apify sonst
   *    aktiv FALSCHE Punkte erzeugen wuerde statt bloss fehlende.
   */
  const hasSecondaryField =
    followerCount !== null || postCount !== null || followingCount !== null || displayName !== null;

  const plausible = flags.matchesRequest && hasSecondaryField;
  const linkFieldPresent = hasLinkField(item);

  const note = !flags.matchesRequest
    ? "Apify lieferte ein anderes Handle als angefragt — Profil manuell prüfen."
    : !hasSecondaryField
      ? "Apify-Datensatz unvollständig — Profil manuell prüfen."
      : !linkFieldPresent
        ? "Apify-Datensatz ohne Link-in-Bio-Feld — Link-Status unbekannt, Profil manuell prüfen."
        : isPrivate === true
          ? "Privates Profil — Bio und Beiträge nicht auslesbar."
          : null;

  return {
    handle,
    url: `https://www.instagram.com/${handle}`,
    bio: plausible ? bio : null,
    displayName,
    followerCount,
    followingCount,
    postCount,
    externalUrl: plausible ? externalUrl : null,
    // Siehe oben: niemals allein aus "Wert ist null" ableiten.
    externalUrlKnown: plausible && linkFieldPresent,
    isBusinessAccount,
    isPrivate,
    isVerified,
    lastPostAt,
    daysSinceLastPost: daysSince(lastPostAt),
    latestPostCaption: plausible ? latestPostCaption : null,
    // Angepinnte Beitraege sind oft Monate alt und stehen vorne — sie sagen
    // nichts ueber den Rhythmus. Fuer lastPostAt/Aufhaenger zaehlen sie mit.
    postCadenceDays: cadenceDays(posts.filter((post) => !post.pinned).map((post) => post.at)),
    // Fehlt das Link-Feld, ist der Datensatz fuer unsere Zwecke unvollstaendig:
    // der Score wird als "ungefaehr" markiert und die kurze Snapshot-TTL greift.
    incomplete: !plausible || !linkFieldPresent,
    note,
  };
}

type ParsedPost = { at: string; caption: string | null; pinned: boolean };

/**
 * Liest `latestPosts[]` defensiv aus und sortiert nach Zeitstempel —
 * absteigend. Index 0 ist bei Apify NICHT verlaesslich der neueste Post:
 * angepinnte Beitraege (`isPinned: true`) stehen vorne, auch wenn sie
 * Monate alt sind (am 2026-09-11 an @mottoamfluss beobachtet).
 */
function readLatestPosts(item: ApifyItem): ParsedPost[] {
  const candidates = [item.latestPosts, item.posts, item.topPosts].find(Array.isArray) as unknown[] | undefined;
  if (!candidates) return [];

  return candidates
    .filter(isRecord)
    .map((post) => {
      const at = parseTimestamp(post.timestamp ?? post.takenAtTimestamp ?? post.taken_at_timestamp ?? post.createdAt);
      if (!at) return null;
      return { at, caption: pickString(post, ["caption", "text", "title"]), pinned: post.isPinned === true };
    })
    .filter((post): post is ParsedPost => post !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Akzeptiert ISO-Strings und Unix-Sekunden/Millisekunden. */
function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e8) {
      return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/** Durchschnittlicher Abstand zwischen den letzten Posts — grober Rhythmus. */
function cadenceDays(timestamps: string[]): number | null {
  const times = timestamps.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (times.length < 3) return null;
  const span = Math.max(...times) - Math.min(...times);
  if (span <= 0) return null;
  return Math.round(span / 86_400_000 / (times.length - 1));
}

function pickExternalUrl(item: ApifyItem): string | null {
  const direct = pickString(item, LINK_KEYS.filter((key) => key !== "externalUrls"));
  if (direct) return safeNormalizeUrl(direct);

  const list = item.externalUrls;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (typeof entry === "string") {
        const url = safeNormalizeUrl(entry);
        if (url) return url;
      } else if (isRecord(entry)) {
        const url = safeNormalizeUrl(pickString(entry, ["url", "link", "lynx_url"]));
        if (url) return url;
      }
    }
  }
  return null;
}

function safeNormalizeUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    return normalizeUrl(value.trim());
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

function pickBoolean(item: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}
