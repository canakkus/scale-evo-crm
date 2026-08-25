import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { mapPlaceToSuggestion, type PlaceSuggestion, type RawPlace } from "@/lib/places";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ configured: false, suggestions: [] });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    if (!query || query.length < 3) {
      return NextResponse.json({ configured: true, suggestions: [] });
    }

    const region = process.env.GOOGLE_PLACES_REGION ?? "AT";
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: region,
        maxResultCount: 5,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[places] Google-Places-Fehler ${response.status}: ${body.slice(0, 500)}`);
      return NextResponse.json(
        { configured: true, suggestions: [], error: "Google-Places-Suche fehlgeschlagen." },
        { status: 502 }
      );
    }

    const payload: { places?: RawPlace[] } = await response.json();
    const suggestions: PlaceSuggestion[] = (payload.places ?? []).map(mapPlaceToSuggestion);
    return NextResponse.json({ configured: true, suggestions });
  } catch {
    return NextResponse.json(
      { configured: true, suggestions: [], error: "Fehler beim Abrufen der Orte." },
      { status: 500 }
    );
  }
}
