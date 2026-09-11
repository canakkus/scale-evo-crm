import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { normalizeInstagramHandle, instagramProfileUrl } from "@/lib/utils";
import { searchInstagramProfiles } from "@/services/web-search";
import { enrichInstagramProfile, hasSolidWebsite, SKIP_LABELS } from "@/services/instagram/enrichment";
import { readSnapshot } from "@/services/instagram/snapshot-cache";
import { scoreInstagramProfile } from "@/services/instagram/score";

/**
 * Setzt das Instagram-Handle eines Leads — entweder manuell uebergeben
 * oder per Suchmaschine aufgeloest — und bewertet das Profil.
 *
 * Das ist eine BEWUSST ausgeloeste Anreicherung und darf deshalb einen
 * kostenpflichtigen Abruf verursachen. Der Vorfilter in `enrichment.ts`
 * greift trotzdem: ein frischer Snapshot wird wiederverwendet, statt
 * dasselbe Profil erneut zu bezahlen. `force: true` im Body umgeht ihn.
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

    const { result, skipped, apify } = await enrichInstagramProfile(
      {
        leadId: lead.id,
        handle,
        // Ein manuell bestaetigtes bzw. eindeutig aufgeloestes Handle.
        handleConfidence: "high",
        website: lead.website,
      },
      { force: Boolean(body.force) },
    );

    // Uebersprungen (z. B. eigene Website vorhanden) — dann zumindest einen
    // vorhandenen Snapshot nutzen, statt dafuer zu bezahlen.
    const enriched = result ?? (await readSnapshotAsResult(handle));
    const skippedReason = skipped ? SKIP_LABELS[skipped] : null;

    // Gar keine Profildaten: Handle trotzdem setzen, damit der Lead im
    // DM-Trichter auftaucht — nur ohne Neubewertung, weil die Grundlage fehlt.
    if (!enriched) {
      const updated = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          instagram: instagramProfileUrl(handle),
          preferredContactMethod: lead.preferredContactMethod ?? "INSTAGRAM_DM",
        },
        select: { id: true, instagram: true, score: true, scoreReasons: true, opportunityTags: true },
      });
      return NextResponse.json({
        ok: true,
        lead: updated,
        profile: null,
        profileMeta: null,
        score: null,
        apify,
        skippedReason,
      });
    }

    const scored = scoreInstagramProfile(enriched.profile, {
      industry: lead.industry,
      city: lead.city,
      // Derselbe Helper wie im Vorfilter — sonst wertet der Score einen
      // Linktree als eigene Website und zieht 30 Punkte ab.
      hasSolidWebsite: hasSolidWebsite(lead.website),
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

    return NextResponse.json({
      ok: true,
      lead: updated,
      profile: enriched.profile,
      profileMeta: {
        source: enriched.source,
        fetchedAt: enriched.fetchedAt,
        ageDays: enriched.ageDays,
        fromCache: enriched.fromCache,
      },
      score: scored,
      apify,
      skippedReason,
    });
  } catch (error) {
    console.error("[POST /api/leads/[id]/instagram] Error:", error);
    return NextResponse.json({ error: "Instagram-Zuordnung fehlgeschlagen." }, { status: 500 });
  }
}

/** Vorhandenen Snapshot in dieselbe Form bringen wie ein frischer Abruf. */
async function readSnapshotAsResult(handle: string) {
  const snapshot = await readSnapshot(handle);
  if (!snapshot) return null;
  return {
    profile: snapshot.profile,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
    ageDays: snapshot.ageDays,
    fromCache: true,
  };
}
