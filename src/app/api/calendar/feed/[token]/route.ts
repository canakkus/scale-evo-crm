import { NextResponse } from "next/server";
import { appBaseUrl, buildColdCallCalendar, isCalendarFeedToken, type FeedCall } from "@/lib/calendar-feed";
import { feedWindow } from "@/lib/planned-call";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isCalendarFeedToken(token)) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  try {
    const owner = await prisma.user.findUnique({
      where: { calendarFeedToken: token },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

    const { from, to } = feedWindow(new Date());
    const rows = await prisma.plannedCall.findMany({
      where: { userId: owner.id, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      include: { lead: { select: { id: true, companyName: true, phone: true } } },
    });

    const calls: FeedCall[] = rows.map((row) => ({
      id: row.id,
      startsAt: row.startsAt,
      durationMinutes: row.durationMinutes,
      reminderMinutes: row.reminderMinutes,
      type: row.type,
      status: row.status,
      note: row.note,
      sequence: row.sequence,
      updatedAt: row.updatedAt,
      lead: row.lead,
    }));

    const body = buildColdCallCalendar(calls, appBaseUrl(request));
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="scaleevo-cold-calls.ics"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[GET /api/calendar/feed] Error:", error);
    return NextResponse.json({ error: "Kalender konnte nicht erzeugt werden." }, { status: 500 });
  }
}
