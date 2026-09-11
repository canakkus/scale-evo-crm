import { normalizeInstagramHandle } from "@/lib/utils";
import {
  APIFY_HEALTHY,
  fetchInstagramProfiles,
  isApifyConfigured,
  isGraphApiConfigured,
  type ApifyHealth,
} from "./resolve-provider";
import { readSnapshots, writeSnapshot, SNAPSHOT_TTL_DAYS, type CachedProfile } from "./snapshot-cache";
import type { InstagramProfile, ProfileSource } from "./types";

/**
 * ============================================================
 * ANREICHERUNG MIT VORFILTER
 * ============================================================
 * Einziger Ort, an dem ein kostenpflichtiger Abruf ausgeloest
 * werden darf. Alle Leser (Generator, Warteschlange, Fokus-Modus)
 * gehen ueber den Snapshot-Cache.
 *
 * Der Vorfilter arbeitet ausschliesslich mit Daten, die bereits
 * gratis vorliegen — er kostet nichts und spart den Grossteil
 * der Abrufe:
 *   - belastbare eigene Website aus Google Places -> ueberspringen
 *     (der Score ist durch `ownWebsite -30` ohnehin entschieden)
 *   - Handle-Konfidenz low/medium -> NICHT auf Verdacht scrapen
 *   - Snapshot juenger als die TTL -> ueberspringen
 *   - `private: true` aus einem frueheren Snapshot -> dauerhaft
 *     ueberspringen, da kommt nichts mehr nach
 *
 * Bewusst NICHT gebaut: Queue-Worker, Cron, Credit-Budget pro
 * Nutzer. Over-Engineering fuer einen Ein-Mann-Betrieb.
 * ============================================================
 */

export type HandleConfidence = "high" | "medium" | "low";

export type EnrichmentCandidate = {
  /** Optional — nur zur Zuordnung in der Antwort. */
  leadId?: string;
  handle: string | null;
  /** Konfidenz aus `searchInstagramProfiles`. Fehlt sie, gilt der Wert als gesetzt. */
  handleConfidence?: HandleConfidence | null;
  /** Website des Leads, typischerweise aus Google Places. */
  website?: string | null;
};

export type SkipReason =
  | "no-handle"
  | "low-confidence"
  | "own-website"
  | "fresh-snapshot"
  | "private-profile";

export const SKIP_LABELS: Record<SkipReason, string> = {
  "no-handle": "Kein Instagram-Handle hinterlegt",
  "low-confidence": "Handle nicht eindeutig — erst zuordnen, dann anreichern",
  "own-website": "Eigene Website vorhanden — Bewertung steht bereits fest",
  "fresh-snapshot": `Bereits geprüft (jünger als ${SNAPSHOT_TTL_DAYS} Tage)`,
  "private-profile": "Privates Profil — liefert dauerhaft keine Daten",
};

export type EnrichmentPlan = {
  /** Handles, die tatsaechlich abgerufen werden. Bereits dedupliziert. */
  fetch: string[];
  /** Uebersprungene Kandidaten mit Begruendung. */
  skipped: Array<{ leadId?: string; handle: string | null; reason: SkipReason }>;
  /** Bereits vorhandene, frische Snapshots. */
  cached: Map<string, CachedProfile>;
};

/**
 * Hosts, die KEINE belastbare eigene Website sind. Ein Linktree oder
 * eine Facebook-Seite entwertet das "hat schon eine Website"-Argument
 * nicht — im Gegenteil, das ist genau unsere Zielgruppe.
 */
const NOT_A_REAL_WEBSITE =
  /(instagram\.com|facebook\.com|fb\.me|linktr\.ee|beacons\.ai|linkin\.bio|bio\.link|taplink|campsite\.bio|lieferando|wolt\.com|mjam|treatwell|google\.[a-z.]+\/maps|wa\.me|whatsapp\.com)/i;

/** true, wenn der Lead eine eigene, belastbare Website hat. */
export function hasSolidWebsite(website: string | null | undefined): boolean {
  const value = website?.trim();
  if (!value) return false;
  return !NOT_A_REAL_WEBSITE.test(value);
}

/**
 * Entscheidet ohne jeden Netzwerkaufruf, welche Handles abgerufen werden.
 * Kann gefahrlos fuer eine Vorschau ("43 Profile werden geprüft") genutzt
 * werden, weil dabei nichts kostet.
 *
 * `force` umgeht GENAU EINEN Filter: die TTL ("bereits geprüft"). Die
 * inhaltlichen Filter — kein Handle, unsicheres Handle, eigene Website,
 * privates Profil — bleiben bestehen, weil ein Abruf in diesen Faellen das
 * Ergebnis nicht aendern kann und nur Geld kostet.
 */
export async function planEnrichment(
  candidates: EnrichmentCandidate[],
  options: { force?: boolean } = {},
): Promise<EnrichmentPlan> {
  const skipped: EnrichmentPlan["skipped"] = [];
  const wanted: Array<{ leadId?: string; handle: string }> = [];
  const gated: Array<{ leadId?: string; handle: string; reason: SkipReason }> = [];

  for (const candidate of candidates) {
    const handle = normalizeInstagramHandle(candidate.handle);
    if (!handle) {
      skipped.push({ leadId: candidate.leadId, handle: null, reason: "no-handle" });
      continue;
    }
    if (candidate.handleConfidence === "low" || candidate.handleConfidence === "medium") {
      gated.push({ leadId: candidate.leadId, handle, reason: "low-confidence" });
      continue;
    }
    // Bewusst OHNE force-Ausnahme, wie "low-confidence" und "private-profile"
    // auch: Diese drei Filter sagen nicht "die Daten sind noch frisch genug",
    // sondern "ein Abruf kann das Ergebnis gar nicht mehr aendern". Eine
    // eigene Website bedeutet OWN_WEBSITE -30, egal was in der Bio steht.
    // `force` umgeht ausschliesslich die TTL — alles andere waere ein
    // Kosten-Bypass, der sich als Komfortfunktion tarnt.
    if (hasSolidWebsite(candidate.website)) {
      gated.push({ leadId: candidate.leadId, handle, reason: "own-website" });
      continue;
    }
    wanted.push({ leadId: candidate.leadId, handle });
  }

  // Snapshots fuer ALLE bekannten Handles lesen — auch fuer die gerade
  // aussortierten. Vorhandene Daten kosten nichts und sind besser als nichts.
  // Bewusst die WERFENDE Variante, nicht readSnapshotsSafe: Ist der Cache
  // nicht erreichbar, soll die Anreicherung scheitern, bevor Apify bezahlt
  // wird — ohne Cache waere jeder weitere Klick erneut kostenpflichtig.
  const cached = await readSnapshots([...wanted, ...gated].map((entry) => entry.handle));
  skipped.push(...gated);

  const fetch = new Set<string>();

  // Ein Snapshot aus dem oeffentlichen Abruf ohne bekannten Bio-Link darf
  // EINMAL nachgeholt werden, sobald eine vollwertige Quelle eingerichtet ist —
  // etwa direkt nachdem das Apify-Token eingetragen wurde. Das rettet die
  // Restlaufzeit der kurzen TTL (INCOMPLETE_TTL_DAYS, 3 Tage), nicht 30.
  //
  // `richSourceAttemptedAt` ist dabei die Bremse und nicht verhandelbar:
  // Liefert Apify fuer ein Handle nichts (geloescht, umbenannt, gesperrt) oder
  // faellt es wegen 402/Timeout aus, landet das Ergebnis als "public-page" mit
  // unbekanntem Link im Cache. Ohne den Merker waere so ein Handle dauerhaft
  // "upgradable" — TTL-frei und bei jedem Klick erneut kostenpflichtig.
  const richSourceAvailable = isGraphApiConfigured() || isApifyConfigured();
  const upgradable = (snapshot: CachedProfile) =>
    richSourceAvailable &&
    snapshot.richSourceAttemptedAt === null &&
    snapshot.source === "public-page" &&
    !snapshot.profile.externalUrlKnown;

  for (const entry of wanted) {
    const snapshot = cached.get(entry.handle);

    // Privatprofile liefern dauerhaft nichts — auch nach der TTL nicht.
    if (snapshot?.profile.isPrivate === true) {
      skipped.push({ leadId: entry.leadId, handle: entry.handle, reason: "private-profile" });
      continue;
    }
    if (!options.force && snapshot && !snapshot.stale && !upgradable(snapshot)) {
      skipped.push({ leadId: entry.leadId, handle: entry.handle, reason: "fresh-snapshot" });
      continue;
    }
    fetch.add(entry.handle);
  }

  return { fetch: [...fetch], skipped, cached };
}

export type EnrichedProfile = {
  profile: InstagramProfile;
  source: ProfileSource;
  fetchedAt: Date;
  ageDays: number;
  fromCache: boolean;
};

export type EnrichmentOutcome = {
  /** Profile je normalisiertem Handle — frisch abgerufene UND gecachte. */
  profiles: Map<string, EnrichedProfile>;
  plan: EnrichmentPlan;
  apify: ApifyHealth;
};

/**
 * Fuehrt den Vorfilter aus, holt genau die verbleibenden Handles in
 * EINEM Durchgang und schreibt jedes Ergebnis in den Snapshot-Cache.
 */
export async function enrichInstagramProfiles(
  candidates: EnrichmentCandidate[],
  options: { force?: boolean } = {},
): Promise<EnrichmentOutcome> {
  const plan = await planEnrichment(candidates, options);
  const profiles = new Map<string, EnrichedProfile>();

  for (const [handle, cached] of plan.cached) {
    if (plan.fetch.includes(handle)) continue;
    profiles.set(handle, {
      profile: cached.profile,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      ageDays: cached.ageDays,
      fromCache: true,
    });
  }

  if (plan.fetch.length === 0) {
    return { profiles, plan, apify: isApifyConfigured() ? APIFY_HEALTHY : { status: "not-configured", outage: false, note: null } };
  }

  const result = await fetchInstagramProfiles(plan.fetch);
  const now = new Date();

  for (const [handle, resolved] of result.profiles) {
    const { source, ...profile } = resolved;
    await writeSnapshot(handle, source, profile, result.raw.get(handle), {
      richSourceAttempted: result.richAttempted.has(handle),
    });
    profiles.set(handle, { profile, source, fetchedAt: now, ageDays: 0, fromCache: false });
  }

  return { profiles, plan, apify: result.apify };
}

/**
 * Einzelprofil mit Cache und Vorfilter — fuer die bewusst ausgeloeste
 * Anreicherung eines einzelnen Leads.
 */
export async function enrichInstagramProfile(
  candidate: EnrichmentCandidate,
  options: { force?: boolean } = {},
): Promise<{ result: EnrichedProfile | null; skipped: SkipReason | null; apify: ApifyHealth }> {
  const outcome = await enrichInstagramProfiles([candidate], options);
  const handle = normalizeInstagramHandle(candidate.handle);
  const result = handle ? (outcome.profiles.get(handle) ?? null) : null;
  const skipped = result ? null : (outcome.plan.skipped[0]?.reason ?? null);
  return { result, skipped, apify: outcome.apify };
}
