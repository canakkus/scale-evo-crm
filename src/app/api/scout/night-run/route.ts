import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNightScoutState, startNightScoutPipeline } from "@/services/scout/night-scout-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const state = getNightScoutState();

    const sessions = await prisma.scoutSession.findMany({
      where: {
        searchQuery: { startsWith: "Night Scout Funnel" },
      },
      include: {
        results: {
          take: 50,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ state, sessions });
  } catch (error) {
    console.error("[GET /api/scout/night-run] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Night Scout Sessions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const currentState = getNightScoutState();
    if (currentState.running) {
      return NextResponse.json(
        { error: "Ein Scout-Lauf ist bereits im Hintergrund aktiv.", state: currentState },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const districts = Array.isArray(body.districts) && body.districts.length > 0 ? body.districts : ["1010 Wien", "1070 Wien"];
    const category = body.category || "Gastronomie";
    const targetCount = Number(body.targetCount) || 30;
    const runs = Math.max(1, Math.min(5, Number(body.runs) || 1));

    const started = await startNightScoutPipeline(
      {
        districts,
        category,
        targetCount,
        runs,
      },
      user.id
    );

    if (!started) {
      return NextResponse.json(
        { error: "Scout konnte nicht gestartet werden.", state: getNightScoutState() },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      running: true,
      state: getNightScoutState(),
    });
  } catch (error) {
    console.error("[POST /api/scout/night-run] Error:", error);
    return NextResponse.json({ error: "Night Scout Start fehlgeschlagen." }, { status: 500 });
  }
}
