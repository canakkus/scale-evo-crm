import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const entries = await prisma.workJournalEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 30,
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[GET /api/journal] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Journals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Ensure db User exists
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { id: user.id, email: user.email ?? "user@scaleevo.at", displayName: "User" },
      });
    }

    const { notes } = await request.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entry = await prisma.workJournalEntry.upsert({
      where: {
        userId_date: {
          userId: dbUser.id,
          date: today,
        },
      },
      update: { notes: notes || null },
      create: {
        userId: dbUser.id,
        date: today,
        notes: notes || null,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/journal] Error:", error);
    return NextResponse.json({ error: "Fehler beim Speichern des Journal-Eintrags." }, { status: 500 });
  }
}
