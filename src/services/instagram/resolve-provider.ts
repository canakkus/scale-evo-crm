import { InstagramProfileProvider } from "./profile-provider";
import { InstagramGraphApiProvider, getGraphApiConfig } from "./graph-api-provider";
import {
  InstagramApifyProvider,
  getApifyConfig,
  isApifyOutage,
  type ApifyStatus,
} from "./apify-provider";
import { dedupeHandles } from "./apify-provider";
import { emptyProfile, type InstagramProfile, type ProfileSource, type ResolvedProfile } from "./types";
import { normalizeInstagramHandle } from "@/lib/utils";

export type { ProfileSource, ResolvedProfile } from "./types";

/** Sichtbarer Zustand der Apify-Anbindung, damit die UI ihn anzeigen kann. */
export type ApifyHealth = {
  status: ApifyStatus;
  /** true, wenn Apify ausgefallen ist (Token/Guthaben/Timeout) — NICHT bei "nicht eingerichtet". */
  outage: boolean;
  note: string | null;
};

const HEALTHY: ApifyHealth = { status: "ok", outage: false, note: null };
const NOT_CONFIGURED: ApifyHealth = { status: "not-configured", outage: false, note: null };

export type BatchResult = {
  profiles: Map<string, ResolvedProfile>;
  /** Roh-Items je Handle, soweit die Quelle welche geliefert hat. */
  raw: Map<string, unknown>;
  /**
   * Handles, fuer die eine vollwertige Quelle (Graph API / Apify) tatsaechlich
   * befragt wurde — auch wenn sie nichts geliefert hat. Der Aufrufer haelt das
   * im Snapshot fest, damit ein erfolgloser Versuch nicht endlos wiederholt
   * (und bei Apify endlos bezahlt) wird.
   */
  richAttempted: Set<string>;
  apify: ApifyHealth;
};

/**
 * ============================================================
 * QUELLENKETTE:  Graph API  ->  Apify  ->  oeffentlicher Abruf
 * ============================================================
 * 1. Instagram Graph API, sobald konfiguriert — offiziell, gratis
 *    und vollstaendig. Sobald Meta Advanced Access fuer
 *    `instagram_basic` gewaehrt, greift sie automatisch wieder
 *    zuerst; am Code ist dafuer nichts zu aendern.
 * 2. Apify als kostenpflichtiger Ersatz (~$1,60 / 1.000 Profile).
 *    Liefert dieselben Felder wie die Graph API. Wird NUR nach dem
 *    Vorfilter in `enrichment.ts` aufgerufen.
 * 3. Oeffentlicher Seitenabruf als letzter Rueckfall. Liefert im
 *    Wesentlichen nur die Reichweite; alles andere bleibt
 *    "unbekannt" — nicht "nicht vorhanden".
 *
 * Faellt Apify wegen Token oder Guthaben aus, wird trotzdem
 * weitergearbeitet — aber der Zustand wird nach oben gereicht und
 * sichtbar gemacht, statt still zu verschwinden.
 * ============================================================
 */
export async function fetchInstagramProfile(handleOrUrl: string): Promise<ResolvedProfile> {
  const result = await fetchInstagramProfiles([handleOrUrl]);
  const [profile] = [...result.profiles.values()];
  if (profile) return profile;

  const handle = normalizeInstagramHandle(handleOrUrl) ?? String(handleOrUrl ?? "").slice(0, 40);
  return { ...emptyProfile(handle, "Kein gültiges Instagram-Handle."), source: "public-page" };
}

/**
 * Sammelabruf. Die Graph API und der Seitenabruf laufen pro Handle,
 * Apify bekommt bewusst EINEN Run fuer alle offenen Handles — jeder
 * zusaetzliche Run kostet Geld.
 */
export async function fetchInstagramProfiles(inputs: string[]): Promise<BatchResult> {
  const handles = dedupeHandles(inputs);
  const profiles = new Map<string, ResolvedProfile>();
  const raw = new Map<string, unknown>();
  const richAttempted = new Set<string>();
  if (handles.length === 0) return { profiles, raw, richAttempted, apify: NOT_CONFIGURED };

  /** Hinweise aus frueheren Stufen, damit der aussagekraeftigere erhalten bleibt. */
  const carriedNotes = new Map<string, string>();
  const carryNote = (handle: string, note: string | null) => {
    if (note && !carriedNotes.has(handle)) carriedNotes.set(handle, note);
  };

  // ---- Stufe 1: Graph API ------------------------------------------------
  let open = handles;
  const graphConfig = getGraphApiConfig();

  if (graphConfig) {
    const provider = new InstagramGraphApiProvider(graphConfig);
    for (const handle of handles) richAttempted.add(handle);
    const results = await Promise.all(handles.map((handle) => provider.fetchProfile(handle)));

    open = [];
    results.forEach((profile, index) => {
      const handle = handles[index];
      if (!profile.incomplete) {
        profiles.set(handle, { ...profile, source: "graph-api" });
      } else {
        carryNote(handle, profile.note);
        open.push(handle);
      }
    });
  }

  // ---- Stufe 2: Apify ----------------------------------------------------
  let apify: ApifyHealth = NOT_CONFIGURED;
  const apifyConfig = getApifyConfig();

  if (open.length > 0 && apifyConfig) {
    for (const handle of open) richAttempted.add(handle);
    const run = await new InstagramApifyProvider(apifyConfig).fetchProfiles(open);
    apify = { status: run.status, outage: isApifyOutage(run.status), note: run.note };

    if (run.status === "ok") {
      const stillOpen: string[] = [];
      for (const handle of open) {
        const profile = run.profiles.get(handle);
        if (profile && !profile.incomplete) {
          profiles.set(handle, { ...profile, source: "apify" });
          const rawItem = run.raw.get(handle);
          if (rawItem !== undefined) raw.set(handle, rawItem);
        } else {
          carryNote(handle, profile?.note ?? null);
          stillOpen.push(handle);
        }
      }
      open = stillOpen;
    } else {
      // Kein automatischer Retry — ein 408 bedeutet nicht, dass der Run
      // gestoppt wurde. Er laeuft weiter und wird abgerechnet.
      for (const handle of open) carryNote(handle, run.note);
    }
  }

  // ---- Stufe 3: oeffentlicher Seitenabruf --------------------------------
  if (open.length > 0) {
    const provider = new InstagramProfileProvider();
    const results = await Promise.all(open.map((handle) => provider.fetchProfile(handle)));

    results.forEach((profile, index) => {
      const handle = open[index];
      profiles.set(handle, {
        ...profile,
        // Den aussagekraeftigeren Hinweis behalten, statt ihn zu ueberschreiben.
        note: profile.note ?? carriedNotes.get(handle) ?? null,
        source: "public-page",
      });
    });
  }

  return { profiles, raw, richAttempted, apify };
}

/** Fuer die Oberflaeche: ist die offizielle Anbindung aktiv? */
export function isGraphApiConfigured(): boolean {
  return getGraphApiConfig() !== null;
}

/** Fuer die Oberflaeche: ist Apify als Rueckfall eingerichtet? */
export function isApifyConfigured(): boolean {
  return getApifyConfig() !== null;
}

/**
 * Welche Quelle wuerde aktuell zuerst greifen? Rein informativ —
 * fuer `npm run instagram:check` und Statusanzeigen.
 */
export function describeActiveSource(): { primary: ProfileSource; chain: ProfileSource[] } {
  const chain: ProfileSource[] = [];
  if (isGraphApiConfigured()) chain.push("graph-api");
  if (isApifyConfigured()) chain.push("apify");
  chain.push("public-page");
  return { primary: chain[0], chain };
}

export type { InstagramProfile };
export { HEALTHY as APIFY_HEALTHY };
