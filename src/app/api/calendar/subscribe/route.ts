import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { appBaseUrl, calendarFeedUrls, isCalendarFeedToken } from "@/lib/calendar-feed";
import { ensureCalendarFeedToken, ensureDbUser, regenerateCalendarFeedToken } from "@/lib/calendar-subscription";

async function urlsFor(request: Request, token: string) {
  return calendarFeedUrls(appBaseUrl(request), token);
}

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    const dbUser = await ensureDbUser(user);
    const token = await ensureCalendarFeedToken(dbUser.id);
    return NextResponse.json(await urlsFor(request, token));
  } catch (error) {
    console.error("[GET /api/calendar/subscribe] Error:", error);
    return NextResponse.json({ error: "Kalenderabo konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    const dbUser = await ensureDbUser(user);
    const token = await regenerateCalendarFeedToken(dbUser.id);
    if (!isCalendarFeedToken(token)) {
      return NextResponse.json({ error: "Token konnte nicht erzeugt werden." }, { status: 500 });
    }
    return NextResponse.json(await urlsFor(request, token));
  } catch (error) {
    console.error("[POST /api/calendar/subscribe] Error:", error);
    return NextResponse.json({ error: "Kalenderabo konnte nicht erneuert werden." }, { status: 500 });
  }
}
