import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { normalizeInstagramHandle, instagramProfileUrl } from "@/lib/utils";
import { searchInstagramProfiles } from "@/services/web-search";
import { fetchInstagramProfile } from "@/services/instagram/resolve-provider";
import { scoreInstagramProfile } from "@/services/instagram/score";

/**
 * Setzt das Instagram-Handle eines Leads — entweder manuell uebergeben
 * oder per Suchmaschine aufgeloest — und bewertet das Profil.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { id: leadId } = await params;
    const body = await request.json().catch(() => ({}));
    const dbUser = await ensureDbUser(user);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, OR: [{ createdById: dbUser.id }, { assignedToId: dbUser.id }] },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    let handle = normalizeInstagramHandle(body.handle);

    // Kein Handle uebergeben -> per Suchmaschine aufloesen.
    if (!handle) {
      const candidates = await searchInstagramProfiles(lead.companyName, lead.city ?? "Wien");
      const best = candidates[0];
      if (!best || best.confidence === "low") {
        return NextResponse.json({ ok: false, candidates, reason: "Kein eindeutiges Profil gefunden." });
      }
      if (best.confidence === "medium") {
        return NextResponse.json({ ok: false, candidates, reason: "Mehrere Kandidaten — bitte prüfen." });
      }
      handle = best.handle;
    }

    const profile = await fetchInstagramProfile(handle);
    const scored = scoreInstagramProfile(profile, {
      industry: lead.industry,
      city: lead.city,
      hasSolidWebsite: Boolean(lead.website),
    });

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        instagram: instagramProfileUrl(handle),
        score: scored.score,
        scoreReasons: JSON.parse(JSON.stringify(scored.reasons)),
        opportunityTags: scored.tags,
        preferredContactMethod: lead.preferredContactMethod ?? "INSTAGRAM_DM",
      },
      select: { id: true, instagram: true, score: true, scoreReasons: true, opportunityTags: true },
    });

    return NextResponse.json({ ok: true, lead: updated, profile, score: scored });
  } catch (error) {
    console.error("[POST /api/leads/[id]/instagram] Error:", error);
    return NextResponse.json({ error: "Instagram-Zuordnung fehlgeschlagen." }, { status: 500 });
  }
}
