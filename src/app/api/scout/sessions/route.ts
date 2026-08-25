import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (sessionId) {
      const session = await prisma.scoutSession.findUnique({
        where: { id: sessionId },
        include: {
          results: { orderBy: { createdAt: "desc" } },
        },
      });

      if (!session) {
        return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });
      }

      return NextResponse.json({ session });
    }

    const sessions = await prisma.scoutSession.findMany({
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
