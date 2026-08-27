import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const { note, type } = await request.json();

    if (note === undefined && type === undefined) {
      return NextResponse.json({ error: "Keine Daten zum Aktualisieren." }, { status: 400 });
    }

    const existing = await prisma.interaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Interaktion nicht gefunden" }, { status: 404 });
    }

    const interaction = await prisma.interaction.update({
      where: { id },
      data: {
        ...(note !== undefined && { note: note.trim() }),
        ...(type !== undefined && { type }),
      },
      include: { createdBy: { select: { displayName: true } } },
    });

    return NextResponse.json({ interaction }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/interactions/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren der Interaktion." }, { status: 500 });
  }
}
