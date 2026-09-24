import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");

    // Ohne leadId: eigene Aufnahmen. Mit leadId: alle Aufnahmen dieses Leads,
    // sofern er im Arbeitsbereich liegt — sonst sieht der Partner die Calls
    // am geteilten Lead nicht.
    let where: any = { createdById: user.id };
    if (leadId) {
      if (!(await findAccessibleLead(user, leadId))) {
        return NextResponse.json({ recordings: [] });
      }
      where = { leadId };
    }

    const recordings = await prisma.callRecording.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { id: true, companyName: true, status: true, phone: true } },
        createdBy: { select: { displayName: true } },
        audioFile: { select: { id: true } },
      },
    });

    return NextResponse.json({ recordings });
  } catch (error) {
    console.error("[GET /api/cold-calls/recordings] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Call-Aufnahmen." }, { status: 500 });
  }
}
