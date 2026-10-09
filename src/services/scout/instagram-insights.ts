import { prisma } from "@/lib/prisma";
import type { AcquisitionType } from "@prisma/client";
import { leadScopeForUserId } from "@/lib/workspace";
import { normalizeInstagramHandle } from "@/lib/utils";
import type { InstagramInsight, InstagramSnapshotView, ScoutResult } from "@/lib/lead-scout-types";
import { hasSolidWebsite } from "@/services/instagram/enrichment";
import { readSnapshotsSafe, type CachedProfile } from "@/services/instagram/snapshot-cache";
import { scoreInstagramProfile } from "@/services/instagram/score";

/**
 * ============================================================
 * INSTAGRAM-DATEN FUER DEN SCOUT — AUSSCHLIESSLICH LESEND
 * ============================================================
 * Liest den Snapshot-Cache und die eigenen Leads. Loest NIE einen
 * Abruf aus (kein fetchInstagramProfile, kein Apify, keine Graph API).
 * Bezahlt wird ausschliesslich ueber POST /api/instagram/enrich.
 *
 * Bewusst `readSnapshotsSafe`: Das hier ist ein Gratis-Lesepfad. Ist
 * der Cache nicht lesbar, zeigt der Scout "Noch nicht geprüft" statt
 * mit einem 500er einen bereits bezahlten Places-Lauf zu verwerfen.
 *
 * Score nur MIT Snapshot. Ohne Snapshot gibt es keinen Wert — auch
 * keine 0 —, weil fehlende Daten nie Punkte (oder Minuspunkte) erzeugen.
 * ============================================================
 */

export type InsightRequest = {
  key: string;
  handle: string | null;
  industry: string | null;
  city: string | null;
  website: string | null;
  /**
   * Keine Website bekannt UND die Websuche war nicht beantwortet. Dann weiss
   * niemand, ob OWN_WEBSITE (−30) greifen muesste — der Score ist hoechstens
   * ungefaehr ("~") und darf nicht wie ein exakter Wert aussehen.
   */
  websiteUnknown: boolean;
};

type LeadRef = { id: string; instagram: string | null; acquisitionType: AcquisitionType };

function toView(cached: CachedProfile): InstagramSnapshotView {
  const { profile } = cached;
  return {
    source: cached.source,
    fetchedAt: cached.fetchedAt.toISOString(),
    ageDays: cached.ageDays,
    stale: cached.stale,
    incomplete: profile.incomplete,
    followerCount: profile.followerCount,
    isBusinessAccount: profile.isBusinessAccount,
    isPrivate: profile.isPrivate,
    bio: profile.bio,
    externalUrl: profile.externalUrl,
    externalUrlKnown: profile.externalUrlKnown,
    lastPostAt: profile.lastPostAt,
    // hydrate() in snapshot-cache.ts rechnet das bei jedem Lesen frisch.
    daysSinceLastPost: profile.daysSinceLastPost,
  };
}

/** Leads mit Instagram je normalisiertem Handle. DM-Leads haben Vorrang. */
function indexLeadsByHandle(leads: LeadRef[]): Map<string, LeadRef> {
  const byHandle = new Map<string, LeadRef>();
  for (const lead of leads) {
    const handle = normalizeInstagramHandle(lead.instagram);
    if (!handle) continue;
    const existing = byHandle.get(handle);
    if (!existing || (existing.acquisitionType !== "DM" && lead.acquisitionType === "DM")) byHandle.set(handle, lead);
  }
  return byHandle;
}

export async function loadUserInstagramLeads(userId: string): Promise<LeadRef[]> {
  return prisma.lead.findMany({
    where: { ...(await leadScopeForUserId(userId)), instagram: { not: null } },
    select: { id: true, instagram: true, acquisitionType: true },
  });
}

/**
 * Baut die Gratis-Sicht fuer beliebige Handles. `leads` kann vorgeladen
 * uebergeben werden (runLeadScout hat die Leads fuer den Dublettencheck
 * ohnehin schon im Speicher).
 */
export async function buildInstagramInsights(
  items: InsightRequest[],
  userId: string,
  leads?: LeadRef[],
): Promise<Map<string, InstagramInsight>> {
  const normalized = items.map((item) => ({ ...item, handle: normalizeInstagramHandle(item.handle) }));
  const handles = normalized.map((item) => item.handle).filter((handle): handle is string => Boolean(handle));
  const result = new Map<string, InstagramInsight>();
  if (handles.length === 0) return result;

  const [snapshots, leadRefs] = await Promise.all([
    readSnapshotsSafe(handles),
    leads ? Promise.resolve(leads) : loadUserInstagramLeads(userId),
  ]);
  const leadsByHandle = indexLeadsByHandle(leadRefs);

  for (const item of normalized) {
    if (!item.handle) continue;
    const cached = snapshots.get(item.handle);
    const scored = cached
      ? scoreInstagramProfile(cached.profile, {
          // Echte Branche aus mapIndustry(), nie die Suchkategorie ("Alle"
          // wuerde sonst per bio.includes("alle") INDUSTRY_MATCH ausloesen).
          industry: item.industry,
          city: item.city,
          // Derselbe Helper wie Vorfilter und /api/instagram/enrich — sonst
          // zaehlte ein Linktree als eigene Website.
          hasSolidWebsite: hasSolidWebsite(item.website),
        })
      : null;
    const lead = leadsByHandle.get(item.handle);

    result.set(item.key, {
      handle: item.handle,
      snapshot: cached ? toView(cached) : null,
      score: scored
        ? { score: scored.score, approximate: scored.approximate || (item.websiteUnknown && !hasSolidWebsite(item.website)), reasons: scored.reasons }
        : null,
      crmLead: lead ? { id: lead.id, acquisitionType: lead.acquisitionType } : null,
    });
  }
  return result;
}

export function insightRequestFor(result: ScoutResult): InsightRequest {
  return {
    key: result.venue.key,
    handle: result.instagramProfile?.handle ?? null,
    industry: result.leadDraft.industry,
    city: result.leadDraft.city,
    website: result.website.url,
    websiteUnknown: !result.website.url && Boolean(result.website.searchFailed),
  };
}

/**
 * Haengt die frisch gelesenen Daten an. Scheitert das Lesen, bleiben die
 * Karten ohne Snapshot ("Noch nicht geprüft") — der Aufrufer bekommt einen
 * Hinweis statt eines Fehlers.
 */
export async function attachInstagramInsights(
  results: ScoutResult[],
  userId: string,
  leads?: LeadRef[],
): Promise<{ results: ScoutResult[]; notice: string | null }> {
  try {
    const insights = await buildInstagramInsights(results.map(insightRequestFor), userId, leads);
    return {
      results: results.map((result) => ({ ...result, instagramInsight: insights.get(result.venue.key) ?? null })),
      notice: null,
    };
  } catch (error) {
    console.error("[lead-scout] Instagram-Daten nicht lesbar, weiter ohne:", error);
    return {
      results: results.map((result) => ({ ...result, instagramInsight: null })),
      notice: "Instagram-Profildaten konnten nicht gelesen werden — Karten zeigen „Noch nicht geprüft“.",
    };
  }
}
