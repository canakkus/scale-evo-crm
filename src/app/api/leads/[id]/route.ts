import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignedTo: { select: { id: true, displayName: true, email: true } },
        interactions: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { displayName: true } } },
        },
        audits: { orderBy: { createdAt: "desc" }, take: 1 },
        tasks: { orderBy: { createdAt: "desc" } },
        callRecordings: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[GET /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Leads." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        ...(data.companyName !== undefined && { companyName: data.companyName.trim() }),
        ...(data.industry !== undefined && { industry: data.industry || null }),
        ...(data.address !== undefined && { address: data.address || null }),
        ...(data.city !== undefined && { city: data.city || null }),
        ...(data.webPresence !== undefined && { webPresence: data.webPresence }),
        ...(data.website !== undefined && { website: data.website || null }),
        ...(data.treatwellUrl !== undefined && { treatwellUrl: data.treatwellUrl || null }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.instagram !== undefined && { instagram: data.instagram || null }),
        ...(data.googleMapsUrl !== undefined && { googleMapsUrl: data.googleMapsUrl || null }),
        ...(data.googleRating !== undefined && {
          googleRating: data.googleRating != null ? parseFloat(data.googleRating) : null,
        }),
        ...(data.googleReviewCount !== undefined && {
          googleReviewCount: data.googleReviewCount != null ? parseInt(data.googleReviewCount, 10) : null,
        }),
        ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson || null }),
        ...(data.preferredContactMethod !== undefined && {
          preferredContactMethod: data.preferredContactMethod || null,
        }),
        ...(data.contactNote !== undefined && { contactNote: data.contactNote || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.richNotes !== undefined && { richNotes: data.richNotes }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.score !== undefined && { score: parseInt(data.score, 10) }),
        ...(data.lastContactAt !== undefined && {
          lastContactAt: data.lastContactAt ? new Date(data.lastContactAt) : null,
        }),
        ...(data.nextFollowUpAt !== undefined && {
          nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
        }),
      },
    });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error("[PATCH /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Leads." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Löschen des Leads." }, { status: 500 });
  }
}
