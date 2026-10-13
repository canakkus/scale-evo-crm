import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const resultIds = Array.isArray(body.resultIds) ? body.resultIds : [];

    if (resultIds.length === 0) {
      return NextResponse.json({ error: "Keine Ergebnis-IDs übergeben." }, { status: 400 });
    }

    const scoutResults = await prisma.scoutResult.findMany({
      where: {
        id: { in: resultIds },
        leadId: null, // nur noch nicht importierte
      },
    });

    let importedCount = 0;

    for (const res of scoutResults) {
      const raw = (res.rawData as any) || {};
      const bestSlot = raw.bestVisitTime?.recommendedWindow;
      const reasons = Array.isArray(raw.opportunityReasons) ? raw.opportunityReasons.join(", ") : "";

      const notes = [
        `[Night Scout Import - Walk-In]`,
        bestSlot ? `Beste Besuchszeit: ${bestSlot}` : null,
        reasons ? `Hebel: ${reasons}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const newLead = await prisma.lead.create({
        data: {
          companyName: res.companyName,
          address: res.address,
          city: res.city || "Wien",
          phone: res.phone,
          website: res.website,
          industry: res.industry || "Gastronomie",
          googleMapsUrl: res.googleMapsUrl,
          googleRating: res.googleRating,
          reviewCount: res.reviewCount,
          source: "Night Scout",
          acquisitionType: "WALK_IN",
          status: "NEW",
          priority: "HIGH",
          isFocus: true, // Direkt in den 2-Wochen-Fokus für schnelle Walk-Ins
          notes,
          createdById: user.id,
        },
      });

      // Markiere im ScoutResult
      await prisma.scoutResult.update({
        where: { id: res.id },
        data: {
          leadId: newLead.id,
          importedAt: new Date(),
        },
      });

      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedCount,
    });
  } catch (error) {
    console.error("[POST /api/scout/night-run/import] Error:", error);
    return NextResponse.json({ error: "Import fehlgeschlagen." }, { status: 500 });
  }
}
