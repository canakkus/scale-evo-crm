import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id: leadId } = await params;
    const { type, note, callRecordingId } = await request.json();

    if (!note?.trim() || !type) {
      return NextResponse.json({ error: "Typ und Notiz sind erforderlich." }, { status: 400 });
    }

    // Ensure db User record exists
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          id: user.id,
          email: user.email ?? "unknown@scaleevo.at",
          displayName: user.email?.split("@")[0] ?? "User",
        },
      });
    }

    const [interaction] = await Promise.all([
      prisma.interaction.create({
        data: {
          leadId,
          type,
          note: note.trim(),
          createdById: dbUser.id,
          callRecordingId: callRecordingId || null,
        },
        include: { createdBy: { select: { displayName: true } } },
      }),
      // Update lead's lastContactAt timestamp
      prisma.lead.update({
        where: { id: leadId },
        data: { lastContactAt: new Date() },
      }),
    ]);

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads/[id]/interactions] Error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen der Interaktion." }, { status: 500 });
  }
}
