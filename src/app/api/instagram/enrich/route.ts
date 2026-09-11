import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { normalizeInstagramHandle } from "@/lib/utils";
import { APIFY_MAX_BATCH, getHourlyFetchLimit } from "@/services/instagram/apify-provider";
import {
  enrichInstagramProfiles,
  hasSolidWebsite,
  planEnrichment,
  SKIP_LABELS,
  type EnrichmentCandidate,
} from "@/services/instagram/enrichment";
import { countRecentRichFetches } from "@/services/instagram/snapshot-cache";
import { scoreInstagramProfile } from "@/services/instagram/score";
import { describeActiveSource } from "@/services/instagram/resolve-provider";

/**
 * ============================================================
 * SAMMEL-ANREICHERUNG   POST /api/instagram/enrich
 * ============================================================
 * Der einzige Weg, mehrere Profile auf einmal anzureichern.
 * Bewusst eine Nutzeraktion — kein Cron, kein Worker.
 *
 * Body:
 *   leadIds : string[]            Pflicht
 *   preview : boolean             true = nur planen, nichts abrufen,
 *                                 nichts bezahlen ("43 Profile werden geprüft")
 *   force   : boolean             NUR die TTL umgehen ("bereits geprüft").
 *                                 Die inhaltlichen Vorfilter bleiben aktiv —
 *                                 siehe planEnrichment().
 *
 * Ein Aufruf loest hoechstens EINEN Actor-Run aus. Mehr als
 * APIFY_MAX_BATCH Profile werden abgelehnt statt stillschweigend
 * zerlegt — bei einem Timeout laeuft der Run weiter und wird
 * abgerechnet, also entscheidet darueber der Nutzer.
 *
 * Zusaetzlich greift eine Stundenbremse ueber alle Laeufe hinweg
 * (getHourlyFetchLimit). `force` kommt ungeprueft aus dem Request-Body,
 * also braucht es eine Grenze, die auch ein versehentlich wiederholter
 * Aufruf nicht ueberschreiten kann.
 * ============================================================
 */
export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body.leadIds)
      ? [...new Set((body.leadIds as unknown[]).map((id) => String(id ?? "").trim()).filter(Boolean))]
      : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds fehlen." }, { status: 400 });
    }

    const preview = Boolean(body.preview);
    const force = Boolean(body.force);
    const dbUser = await ensureDbUser(user);

    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        OR: [{ createdById: dbUser.id }, { assignedToId: dbUser.id }],
      },
      select: { id: true, companyName: true, instagram: true, website: true, industry: true, city: true },
    });

    const candidates: EnrichmentCandidate[] = leads.map((lead) => ({
      leadId: lead.id,
      handle: lead.instagram,
      // Ein am Lead gespeichertes Handle wurde bereits bestaetigt.
      handleConfidence: "high",
      website: lead.website,
    }));

    const plan = await planEnrichment(candidates, { force });

    if (preview) {
      // maxBatch gehoert in die Vorschau, nicht erst in die Ablehnung:
      // Sonst bestaetigt der Nutzer "43 Profile werden geprüft" und bekommt
      // danach einen 400er zu sehen, den man vorher schon wusste.
      return NextResponse.json({
        ok: true,
        preview: true,
        willFetch: plan.fetch.length,
        maxBatch: APIFY_MAX_BATCH,
        skipped: summarizeSkips(plan.skipped),
        source: describeActiveSource(),
      });
    }

    if (plan.fetch.length > APIFY_MAX_BATCH) {
      return NextResponse.json(
        {
          ok: false,
          willFetch: plan.fetch.length,
          maxBatch: APIFY_MAX_BATCH,
          reason:
            `${plan.fetch.length} Profile auf einmal sind zu viele. Ein Abruf über ${APIFY_MAX_BATCH} Profile ` +
            "läuft in die Zeitgrenze — und ein abgebrochener Lauf wird trotzdem abgerechnet. " +
            "Bitte in kleineren Blöcken starten.",
        },
        { status: 400 },
      );
    }

    // Stundenbremse. Bewusst NACH der Batch-Pruefung und VOR dem Abruf.
    const hourlyLimit = getHourlyFetchLimit();
    const recentFetches = await countRecentRichFetches(1);
    if (recentFetches + plan.fetch.length > hourlyLimit) {
      return NextResponse.json(
        {
          ok: false,
          willFetch: plan.fetch.length,
          recentFetches,
          hourlyLimit,
          reason:
            `In der letzten Stunde wurden bereits ${recentFetches} Profile abgerufen. ` +
            `Mit diesen ${plan.fetch.length} wäre das Stundenlimit von ${hourlyLimit} überschritten. ` +
            "Kurz warten oder APIFY_HOURLY_LIMIT anheben.",
        },
        { status: 429 },
      );
    }

    const outcome = await enrichInstagramProfiles(candidates, { force });

    // Scores schreiben. Bewusst sequenziell: es sind hoechstens
    // APIFY_MAX_BATCH Leads, und so bleibt der Pool ruhig.
    const updated: Array<{ leadId: string; score: number; source: string; tags: string[] }> = [];

    for (const lead of leads) {
      const handle = normalizeInstagramHandle(lead.instagram);
      const enriched = handle ? outcome.profiles.get(handle) : undefined;
      if (!enriched) continue;

      const scored = scoreInstagramProfile(enriched.profile, {
        industry: lead.industry,
        city: lead.city,
        // Derselbe Helper wie im Vorfilter. Mit Boolean(lead.website) wuerde
        // ein Linktree als eigene Website zaehlen — der Lead bekaeme
        // OWN_WEBSITE -30 statt LINKTREE_ONLY +20 und waere ~50 Punkte zu kalt.
        hasSolidWebsite: hasSolidWebsite(lead.website),
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          score: scored.score,
          scoreReasons: JSON.parse(JSON.stringify(scored.reasons)),
          opportunityTags: scored.tags,
        },
      });

      updated.push({ leadId: lead.id, score: scored.score, source: enriched.source, tags: scored.tags });
    }

    return NextResponse.json({
      ok: true,
      fetched: plan.fetch.length,
      updated,
      skipped: summarizeSkips(plan.skipped),
      apify: outcome.apify,
      source: describeActiveSource(),
    });
  } catch (error) {
    console.error("[POST /api/instagram/enrich] Error:", error);
    return NextResponse.json({ error: "Anreicherung fehlgeschlagen." }, { status: 500 });
  }
}

function summarizeSkips(skipped: Array<{ leadId?: string; handle: string | null; reason: keyof typeof SKIP_LABELS }>) {
  const counts = new Map<string, number>();
  for (const entry of skipped) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({
    reason,
    count,
    label: SKIP_LABELS[reason as keyof typeof SKIP_LABELS],
  }));
}
