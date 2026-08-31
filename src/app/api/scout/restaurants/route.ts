import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { runRestaurantScout } from "@/services/restaurant-scout";

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const location = String(body.location ?? body.city ?? "Wien").trim() || "Wien";
    const cuisineType = body.cuisineType ? String(body.cuisineType).trim() : undefined;
    const radiusKm = body.radiusKm ? Number(body.radiusKm) : undefined;
    const maxResults = Math.min(30, Math.max(1, Number(body.maxResults ?? 10) || 10));
    const filterNoMenuOnly = Boolean(body.filterNoMenuOnly);

    const response = await runRestaurantScout(
      {
        location,
        cuisineType,
        radiusKm,
        maxResults,
        filterNoMenuOnly,
      },
      user.id
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[POST /api/scout/restaurants] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Restaurant-Scout fehlgeschlagen." },
      { status: 500 }
    );
  }
}
