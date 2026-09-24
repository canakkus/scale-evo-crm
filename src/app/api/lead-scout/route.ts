import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { RESTAURANT_CATEGORIES, SCOUT_LIMITS, type LeadScoutOptions } from "@/lib/lead-scout-types";
import { runLeadScout } from "@/services/lead-scout";

type TriFilter = "all" | "yes" | "no";

function triFilter(value: unknown): TriFilter {
  return value === "yes" || value === "no" ? value : "all";
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const category = String(body.category ?? "Barber").trim() || "Barber";
    const isRestaurantCategory = RESTAURANT_CATEGORIES.includes(category) || category === "Alle";
    const radius = Number(body.radiusKm);

    const options: LeadScoutOptions = {
      category,
      city: String(body.city ?? "Wien").trim() || "Wien",
      minRating: Math.min(5, Math.max(0, Number(body.minRating ?? 4.0) || 0)),
      minReviews: Math.max(0, Number(body.minReviews ?? 10) || 0),
      // runLeadScout klemmt zusaetzlich — das hier ist nur die fruehe Plausibilisierung.
      maxResults: Math.min(SCOUT_LIMITS.maxResults, Math.max(1, Number(body.maxResults ?? 10) || 10)),
      source: body.source === "places" || body.source === "treatwell" ? body.source : isRestaurantCategory ? "places" : "treatwell",
      sortBy: body.sortBy === "distance" ? "distance" : "rating",
      baseLat: optionalNumber(body.baseLat),
      baseLng: optionalNumber(body.baseLng),
      radiusKm: radius === 3 || radius === 5 ? radius : null,
      hasWebsiteFilter: triFilter(body.hasWebsiteFilter),
      hasTreatwellFilter: triFilter(body.hasTreatwellFilter),
      hasPhoneFilter: triFilter(body.hasPhoneFilter),
      hasInstagramFilter: triFilter(body.hasInstagramFilter),
      hideChains: body.hideChains === true,
      onlyNew: body.onlyNew === true,
    };

    const response = await runLeadScout(options, user.id);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[POST /api/lead-scout] Error:", error);
    return NextResponse.json({ error: "Lead-Scout fehlgeschlagen." }, { status: 500 });
  }
}
