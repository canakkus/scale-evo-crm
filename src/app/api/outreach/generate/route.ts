import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { InstagramProfileProvider } from "@/services/instagram/profile-provider";
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
      where: { id: leadId, OR: [{ createdById: dbUser.id }, { assignedToId: dbUser.id }] },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    // Profil best-effort laden — schlaegt das fehl, arbeiten wir mit dem,
    // was am Lead schon bekannt ist, statt abzubrechen.
    const profile = lead.instagram
      ? await new InstagramProfileProvider().fetchProfile(lead.instagram)
      : null;

    const scored = profile
      ? scoreInstagramProfile(profile, {
          industry: lead.industry,
          city: lead.city,
          hasSolidWebsite: Boolean(lead.website),
        })
      : null;

    // Live-Tags haben Vorrang, aber nur wenn der Profilabruf ueberhaupt etwas
    // ergeben hat. Ausgeloggt liefert Instagram meist keine Bio- und Link-Daten,
    // und dann waeren die am Lead gepflegten Tags — also genau die staerksten
    // Aufhaenger — stillschweigend verworfen.
    const liveTags = scored?.tags ?? [];
    const storedTags = Array.isArray(lead.opportunityTags) ? (lead.opportunityTags as string[]) : [];
    const tags = liveTags.length > 0 ? liveTags : storedTags;

    const anchors = deriveAnchors({
      bio: profile?.bio ?? null,
      tags,
      daysSinceLastPost: profile?.daysSinceLastPost ?? null,
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

    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, anchors, profile, score: scored }, { status: 200 });
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
      score: scored,
    });
  } catch (error) {
    console.error("[POST /api/outreach/generate] Error:", error);
    return NextResponse.json({ error: "Generierung fehlgeschlagen." }, { status: 500 });
  }
}
