import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import { ensureDbUser } from "@/lib/outreach-user";
import { readSnapshotSafe } from "@/services/instagram/snapshot-cache";
import { hasSolidWebsite } from "@/services/instagram/enrichment";
import { scoreInstagramProfile } from "@/services/instagram/score";
import {
  deriveAnchors,
  generateOutreachVariants,
  type OutreachChannelKey,
  type OutreachToneKey,
} from "@/services/outreach-generator";

const CHANNELS: OutreachChannelKey[] = ["INSTAGRAM_DM", "PHONE"];
const TONES: OutreachToneKey[] = ["CASUAL_VIENNESE", "PROFESSIONAL_DU", "FORMAL_SIE"];

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const body = await request.json();
    const leadId = String(body.leadId ?? "").trim();
    if (!leadId) return NextResponse.json({ error: "leadId fehlt." }, { status: 400 });

    const channel: OutreachChannelKey = CHANNELS.includes(body.channel) ? body.channel : "INSTAGRAM_DM";
    const tone: OutreachToneKey = TONES.includes(body.tone) ? body.tone : "CASUAL_VIENNESE";
    const sequenceStep = Math.max(0, Math.min(2, Number(body.sequenceStep ?? 0) || 0));

    const dbUser = await ensureDbUser(user);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...(await leadScope(dbUser)) },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    // ------------------------------------------------------------------
    // NUR CACHE — NIEMALS EIN LIVE-ABRUF.
    // Diese Route feuert bei jedem Tonalitaets- und Kanalwechsel, bei jedem
    // "G" im Fokus-Modus und bei jedem Sequenzschritt. Ein Live-Abruf wuerde
    // hier fuer exakt dieselben Daten wieder und wieder einen kosten-
    // pflichtigen Apify-Run ausloesen. Angereichert wird ausschliesslich an
    // bewusst ausgeloesten Stellen (/api/leads/[id]/instagram und
    // /api/instagram/enrich).
    // ------------------------------------------------------------------
    const snapshot = lead.instagram ? await readSnapshotSafe(lead.instagram) : null;
    const profile = snapshot?.profile ?? null;

    const scored = profile
      ? scoreInstagramProfile(profile, {
          industry: lead.industry,
          city: lead.city,
          // Derselbe Helper wie im Vorfilter — sonst wertet der Score einen
          // Linktree als eigene Website und zieht 30 Punkte ab.
          hasSolidWebsite: hasSolidWebsite(lead.website),
        })
      : null;

    // Tags aus dem Snapshot haben Vorrang, aber nur wenn dort ueberhaupt etwas
    // steht. Ein Snapshot aus dem oeffentlichen Seitenabruf kennt meist weder
    // Bio noch Link-in-Bio — dann waeren die am Lead gepflegten Tags, also
    // genau die staerksten Aufhaenger, stillschweigend verworfen.
    const liveTags = scored?.tags ?? [];
    const storedTags = Array.isArray(lead.opportunityTags) ? (lead.opportunityTags as string[]) : [];
    const tags = liveTags.length > 0 ? liveTags : storedTags;

    const anchors = deriveAnchors({
      bio: profile?.bio ?? null,
      tags,
      daysSinceLastPost: profile?.daysSinceLastPost ?? null,
      latestPostCaption: profile?.latestPostCaption ?? null,
      city: lead.city,
      googleRating: lead.googleRating,
    });

    const requestedAnchor = body.anchorKey
      ? anchors.find((anchor) => anchor.key === String(body.anchorKey))
      : undefined;
    const anchor = requestedAnchor ?? anchors[0] ?? null;

    const result = await generateOutreachVariants({
      companyName: lead.companyName,
      industry: lead.industry,
      city: lead.city,
      handle: profile?.handle ?? lead.instagram,
      bio: profile?.bio ?? null,
      followerCount: profile?.followerCount ?? null,
      daysSinceLastPost: profile?.daysSinceLastPost ?? null,
      tags,
      anchor,
      channel,
      tone,
      sequenceStep,
    });

    const profileMeta = snapshot
      ? { source: snapshot.source, fetchedAt: snapshot.fetchedAt, ageDays: snapshot.ageDays, stale: snapshot.stale }
      : null;

    // Fehlt der Snapshot, ist der duenne Aufhaenger-Vorrat kein KI-Problem,
    // sondern eine fehlende Anreicherung. Das muss die UI sagen koennen.
    const needsEnrichment = Boolean(lead.instagram) && (!snapshot || snapshot.stale);

    if (!result.ok) {
      const reason =
        needsEnrichment && anchors.length === 0
          ? `${result.reason} Das Profil wurde noch nicht angereichert — Anreicherung starten.`
          : result.reason;
      return NextResponse.json(
        { ok: false, reason, anchors, profile, profileMeta, needsEnrichment, score: scored },
        { status: 200 },
      );
    }

    // Entwuerfe persistieren — Grundlage fuer Sequenzen und Lern-Loop.
    // Bewusst einzeln statt createMany: nur so bekommen wir die IDs zurueck,
    // und ohne die kann der Versand den Entwurf spaeter nicht als gesendet
    // markieren (der Lern-Loop bliebe dauerhaft leer).
    const drafts = await Promise.all(
      result.variants.map((variant) =>
        prisma.dmDraft.create({
          data: {
            leadId: lead.id,
            channel,
            tone,
            variantIndex: variant.index,
            sequenceStep,
            anchor: anchor?.label ?? null,
            bodyGenerated: variant.body,
            createdById: dbUser.id,
          },
          select: { id: true, variantIndex: true },
        }),
      ),
    );

    const variantsWithDraft = result.variants.map((variant) => ({
      ...variant,
      draftId: drafts.find((draft) => draft.variantIndex === variant.index)?.id ?? null,
    }));

    return NextResponse.json({
      ok: true,
      variants: variantsWithDraft,
      anchorUsed: result.anchorUsed,
      anchors,
      profile,
      profileMeta,
      needsEnrichment,
      score: scored,
    });
  } catch (error) {
    console.error("[POST /api/outreach/generate] Error:", error);
    return NextResponse.json({ error: "Generierung fehlgeschlagen." }, { status: 500 });
  }
}
