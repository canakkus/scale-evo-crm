import { prisma } from "@/lib/prisma";
import { normalizeInstagramHandle } from "@/lib/utils";
import { daysSince, type InstagramProfile, type ProfileSource } from "./types";

/**
 * ============================================================
 * SNAPSHOT-CACHE
 * ============================================================
 * Jede Anreicherung schreibt hier rein, jeder Leser fragt zuerst
 * hier — das ist der eigentliche Kostenschutz gegen Apify.
 *
 * Der Cache haengt am normalisierten Handle, nicht am Lead. Zwei
 * Leads mit demselben Profil kosten damit genau einen Abruf.
 *
 * Gespeichert wird `lastPostAt` als absoluter Zeitpunkt;
 * `daysSinceLastPost` wird beim LESEN daraus berechnet. Andersherum
 * wuerde der Cache taeglich veralten und sich selbst entwerten.
 * ============================================================
 */

/** Ab wann ein Snapshot als veraltet gilt. */
export const SNAPSHOT_TTL_DAYS = 30;

/** Unvollstaendige Abrufe duerfen frueher erneut versucht werden. */
export const INCOMPLETE_TTL_DAYS = 3;

export type CachedProfile = {
  profile: InstagramProfile;
  source: ProfileSource;
  fetchedAt: Date;
  /** Alter in Tagen. */
  ageDays: number;
  /** true, wenn die TTL abgelaufen ist. */
  stale: boolean;
  /** Wann zuletzt eine vollwertige Quelle befragt wurde. null = noch nie. */
  richSourceAttemptedAt: Date | null;
};

function isProfileSource(value: string): value is ProfileSource {
  return value === "graph-api" || value === "apify" || value === "public-page";
}

/** Baut aus einer DB-Zeile ein Profil mit frisch berechnetem daysSinceLastPost. */
function hydrate(row: {
  handle: string;
  source: string;
  fetchedAt: Date;
  lastPostAt: Date | null;
  richSourceAttemptedAt: Date | null;
  profile: unknown;
}): CachedProfile | null {
  if (typeof row.profile !== "object" || row.profile === null) return null;

  const stored = row.profile as Partial<InstagramProfile>;
  const lastPostAt = row.lastPostAt ? row.lastPostAt.toISOString() : (stored.lastPostAt ?? null);
  const ageDays = daysSince(row.fetchedAt) ?? 0;
  const incomplete = stored.incomplete ?? true;

  const profile: InstagramProfile = {
    handle: stored.handle ?? row.handle,
    url: stored.url ?? `https://www.instagram.com/${row.handle}`,
    bio: stored.bio ?? null,
    displayName: stored.displayName ?? null,
    followerCount: stored.followerCount ?? null,
    followingCount: stored.followingCount ?? null,
    postCount: stored.postCount ?? null,
    externalUrl: stored.externalUrl ?? null,
    externalUrlKnown: stored.externalUrlKnown ?? false,
    isBusinessAccount: stored.isBusinessAccount ?? null,
    isPrivate: stored.isPrivate ?? null,
    isVerified: stored.isVerified ?? null,
    lastPostAt,
    // Bewusst neu berechnet statt uebernommen.
    daysSinceLastPost: daysSince(lastPostAt),
    latestPostCaption: stored.latestPostCaption ?? null,
    postCadenceDays: stored.postCadenceDays ?? null,
    incomplete,
    note: stored.note ?? null,
  };

  const ttl = incomplete ? INCOMPLETE_TTL_DAYS : SNAPSHOT_TTL_DAYS;

  return {
    profile,
    source: isProfileSource(row.source) ? row.source : "public-page",
    fetchedAt: row.fetchedAt,
    ageDays,
    stale: ageDays >= ttl,
    richSourceAttemptedAt: row.richSourceAttemptedAt,
  };
}

const SELECT = {
  handle: true,
  source: true,
  fetchedAt: true,
  lastPostAt: true,
  richSourceAttemptedAt: true,
  profile: true,
} as const;

/** Liest einen Snapshot. Gibt auch veraltete zurueck — `stale` sagt es an. */
export async function readSnapshot(handleOrUrl: string | null | undefined): Promise<CachedProfile | null> {
  const handle = normalizeInstagramHandle(handleOrUrl);
  if (!handle) return null;

  const row = await prisma.instagramProfileSnapshot.findUnique({ where: { handle }, select: SELECT });
  return row ? hydrate(row) : null;
}

/** Liest mehrere Snapshots auf einen Schlag. Key ist das normalisierte Handle. */
export async function readSnapshots(handles: string[]): Promise<Map<string, CachedProfile>> {
  const normalized = [...new Set(handles.map((value) => normalizeInstagramHandle(value)).filter(Boolean))] as string[];
  if (normalized.length === 0) return new Map();

  const rows = await prisma.instagramProfileSnapshot.findMany({
    where: { handle: { in: normalized } },
    select: SELECT,
  });

  const result = new Map<string, CachedProfile>();
  for (const row of rows) {
    const cached = hydrate(row);
    if (cached) result.set(row.handle, cached);
  }
  return result;
}

/**
 * Tolerante Varianten fuer die KOSTENLOSEN Lesepfade (Generator, Warteschlange).
 * Ist die Tabelle nicht erreichbar — typischerweise, weil nach dem Deploy der
 * `prisma db push` noch fehlt —, laufen diese Routen ohne Snapshot weiter,
 * statt mit einem 500er die ganze Outreach-Seite zu kippen.
 *
 * NICHT im bezahlten Pfad (`enrichment.ts`) verwenden: Dort muss ein
 * Cache-Ausfall den Abruf verhindern. Sonst wuerde Apify bezahlt, das
 * Speichern scheiterte still, und jeder weitere Klick zahlte erneut.
 */
export async function readSnapshotSafe(handleOrUrl: string | null | undefined): Promise<CachedProfile | null> {
  try {
    return await readSnapshot(handleOrUrl);
  } catch (error) {
    console.error("[instagram] Snapshot-Cache nicht lesbar, weiter ohne:", error);
    return null;
  }
}

export async function readSnapshotsSafe(handles: string[]): Promise<Map<string, CachedProfile>> {
  try {
    return await readSnapshots(handles);
  } catch (error) {
    console.error("[instagram] Snapshot-Cache nicht lesbar, weiter ohne:", error);
    return new Map();
  }
}

/**
 * Schreibt einen Snapshot. `daysSinceLastPost` wird bewusst entfernt,
 * damit im Cache kein relativer Wert liegt.
 */
export async function writeSnapshot(
  handleOrUrl: string,
  source: ProfileSource,
  profile: InstagramProfile,
  raw?: unknown,
  options: { richSourceAttempted?: boolean } = {},
): Promise<void> {
  const handle = normalizeInstagramHandle(handleOrUrl);
  if (!handle) return;

  const { daysSinceLastPost: _ignored, ...storable } = profile;
  void _ignored;

  const now = new Date();

  // Nur setzen, nie zuruecksetzen: ein spaeterer Public-Page-Fallback darf den
  // Merker nicht loeschen, sonst waere der Apify-Versuch wieder "nie passiert".
  const attempted = options.richSourceAttempted ? { richSourceAttemptedAt: now } : {};

  const data = {
    source,
    fetchedAt: now,
    lastPostAt: profile.lastPostAt ? new Date(profile.lastPostAt) : null,
    isPrivate: profile.isPrivate,
    incomplete: profile.incomplete,
    profile: JSON.parse(JSON.stringify(storable)) as object,
    raw: raw === undefined ? undefined : (JSON.parse(JSON.stringify(raw)) as object),
  };

  try {
    await prisma.instagramProfileSnapshot.upsert({
      where: { handle },
      create: { handle, ...data, ...attempted },
      update: { ...data, ...attempted },
    });
  } catch (error) {
    // Ein fehlgeschlagener Cache-Schreibvorgang darf die Anreicherung nicht kippen.
    console.error("[instagram] Snapshot konnte nicht gespeichert werden:", error);
  }
}

/**
 * Zaehlt, wie viele Handles im angegebenen Zeitfenster TATSAECHLICH bei einer
 * vollwertigen Quelle angefragt wurden. Grundlage fuer die Stundenbremse in
 * `/api/instagram/enrich`.
 *
 * Bewusst ueber die Tabelle statt ueber einen Zaehler im Prozess: Auf Vercel
 * ist jeder Request potenziell ein neuer Prozess, ein In-Memory-Limit waere
 * nach jedem Cold Start wieder bei null — und genau dann teuer.
 */
export async function countRecentRichFetches(withinHours: number): Promise<number> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  try {
    return await prisma.instagramProfileSnapshot.count({
      where: { richSourceAttemptedAt: { gte: since } },
    });
  } catch (error) {
    // Im Zweifel NICHT zahlen. Ist der Zaehler nicht lesbar, ist meist die
    // ganze Tabelle weg — dann koennte auch nichts gecacht werden, und jeder
    // Abruf waere beim naechsten Klick erneut faellig. Also blockieren.
    console.error("[instagram] Stundenbremse konnte nicht gelesen werden:", error);
    return Number.POSITIVE_INFINITY;
  }
}
