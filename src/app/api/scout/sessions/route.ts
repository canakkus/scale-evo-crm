import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ScoutResult } from "@/lib/lead-scout-types";
import { attachInstagramInsights } from "@/services/scout/instagram-insights";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (sessionId) {
      // Nur eigene Sessions (Workspace-Isolation) — vorher war jede ID lesbar.
      const session = await prisma.scoutSession.findFirst({
        where: { id: sessionId, createdById: user.id },
        include: {
          results: { orderBy: { createdAt: "desc" } },
        },
      });

      if (!session) {
        return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });
      }

      // Instagram-Daten FRISCH aus dem Snapshot-Cache statt aus rawData —
      // sonst zeigte eine alte Session Werte von vor Wochen. Rein lesend.
      const stored = session.results
        .map((row) => row.rawData as ScoutResult | null)
        .filter((result): result is ScoutResult => Boolean(result?.venue?.key));
      const { results, notice } = await attachInstagramInsights(stored, user.id);

      return NextResponse.json({ session: { ...session, results: undefined }, results, notice });
    }

    const sessions = await prisma.scoutSession.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        searchQuery: true,
        city: true,
        filters: true,
        resultCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[GET /api/scout/sessions] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Scout-Sessions." }, { status: 500 });
  }
}
