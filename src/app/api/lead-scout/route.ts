import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { RESTAURANT_CATEGORIES } from "@/lib/lead-scout-types";
import { runLeadScout } from "@/services/lead-scout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const category = String(body.category ?? "Barber").trim() || "Barber";
    const isRestaurantCategory = RESTAURANT_CATEGORIES.includes(category);

    const options = {
      category,
      city: String(body.city ?? "Wien").trim() || "Wien",
      minRating: Math.min(5, Math.max(0, Number(body.minRating ?? 4.0) || 0)),
      minReviews: Math.max(0, Number(body.minReviews ?? 10) || 0),
      maxResults: Math.min(30, Math.max(1, Number(body.maxResults ?? 10) || 10)),
      source: String(body.source ?? (isRestaurantCategory ? "places" : "treatwell")).trim() as
        | "treatwell"
        | "places",
      sortBy: (body.sortBy === "distance" ? "distance" : "rating") as "rating" | "distance",
      baseLat: body.baseLat != null ? Number(body.baseLat) : null,
      baseLng: body.baseLng != null ? Number(body.baseLng) : null,
      hasWebsiteFilter: body.hasWebsiteFilter || "all",
      hasTreatwellFilter: body.hasTreatwellFilter || "all",
      hasPhoneFilter: body.hasPhoneFilter || "all",
      hasInstagramFilter: body.hasInstagramFilter || "all",
    };

    const response = await runLeadScout(options, user.id);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[POST /api/lead-scout] Error:", error);
    return NextResponse.json({ error: "Lead-Scout fehlgeschlagen." }, { status: 500 });
  }
}
