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
    const directLeads = Array.isArray(body.leads) ? body.leads : [];

    if (resultIds.length === 0 && directLeads.length === 0) {
      return NextResponse.json({ error: "Keine Datensätze zum Importieren übergeben." }, { status: 400 });
    }

    let importedCount = 0;

    // 1. Direct Leads Import (z. B. aus Lead Scout 4.0 Client-State)
    if (directLeads.length > 0) {
      for (const lead of directLeads) {
        if (!lead.companyName) continue;

        const bestSlot = lead.bestVisitTime?.recommendedWindow;
        const reasons = Array.isArray(lead.opportunityReasons) ? lead.opportunityReasons.join(", ") : "";

        const notes = [
          `[Scout 4.0 Walk-In]`,
          bestSlot ? `Beste Besuchszeit: ${bestSlot}` : null,
          reasons ? `Hebel: ${reasons}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        await prisma.lead.create({
          data: {
            companyName: lead.companyName,
            address: lead.address,
            city: lead.city || "Wien",
            phone: lead.phone,
            website: lead.website,
            industry: lead.industry || "Gastronomie",
            googleMapsUrl: lead.googleMapsUrl,
            googleRating: lead.googleRating,
            reviewCount: lead.reviewCount,
            source: "Night Scout 4.0",
            acquisitionType: "WALK_IN",
            status: "NEW",
            priority: "HIGH",
            isFocus: true,
            notes,
            createdById: user.id,
          },
        });
        importedCount++;
      }

      return NextResponse.json({
        success: true,
        importedCount,
      });
    }

    // 2. ScoutResult IDs Import
    const scoutResults = await prisma.scoutResult.findMany({
      where: {
        id: { in: resultIds },
        leadId: null, // nur noch nicht importierte
      },
    });

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
