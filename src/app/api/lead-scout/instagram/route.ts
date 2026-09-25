import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { ensureDbUser } from "@/lib/outreach-user";
import { SCOUT_LIMITS } from "@/lib/lead-scout-types";
import { buildInstagramInsights, type InsightRequest } from "@/services/scout/instagram-insights";

/**
 * ============================================================
 * SCOUT-KARTEN AUS DEM CACHE NEU LADEN   POST /api/lead-scout/instagram
 * ============================================================
 * AUSSCHLIESSLICH LESEND: Snapshot-Cache + eigene Leads. Diese Route
 * loest nie einen Profilabruf aus und kostet damit nichts — sie darf
 * nach jeder Auswahl und nach "Profile prüfen" gefeuert werden.
 * Bezahlt wird nur ueber POST /api/instagram/enrich.
 *
 * Body: { items: Array<{ key, handle, industry, city, website }> }
 * ============================================================
 */

const MAX_ITEMS = SCOUT_LIMITS.maxScoutedVenues;

function asString(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Höchstens ${MAX_ITEMS} Einträge pro Abfrage.` }, { status: 400 });
    }

    const items: InsightRequest[] = rawItems
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        key: asString(item.key, 500) ?? "",
        handle: asString(item.handle, 200),
        industry: asString(item.industry, 80),
        city: asString(item.city, 80),
        website: asString(item.website, 500),
        // Fehlt das Feld, gilt die Website als unbekannt — im Zweifel "~" statt exakter Score.
        websiteUnknown: item.websiteUnknown !== false,
      }))
      .filter((item) => item.key);

    const dbUser = await ensureDbUser(user);
    const insights = await buildInstagramInsights(items, dbUser.id);
    return NextResponse.json({ insights: Object.fromEntries(insights) });
  } catch (error) {
    console.error("[POST /api/lead-scout/instagram] Error:", error);
    return NextResponse.json({ error: "Profildaten konnten nicht geladen werden." }, { status: 500 });
  }
}
