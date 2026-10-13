import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runNightScoutPipeline } from "@/services/scout/night-scout-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

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

    return NextResponse.json({ sessions });
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

    const body = await request.json().catch(() => ({}));
    const districts = Array.isArray(body.districts) && body.districts.length > 0 ? body.districts : ["1010 Wien", "1070 Wien"];
    const category = body.category || "Gastronomie";
    const targetCount = Number(body.targetCount) || 30;

    const result = await runNightScoutPipeline(
      {
        districts,
        category,
        targetCount,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      stats: result.stats,
      leads: result.leads,
    });
  } catch (error) {
    console.error("[POST /api/scout/night-run] Error:", error);
    return NextResponse.json({ error: "Night Scout Lauf fehlgeschlagen." }, { status: 500 });
  }
}
