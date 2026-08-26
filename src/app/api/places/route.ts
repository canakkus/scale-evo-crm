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
    console.log(`[places] API key present: ${!!apiKey}, length: ${apiKey?.length ?? 0}`);
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
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[places] Google-Places-Fehler ${response.status}: ${body.slice(0, 500)}`);
      // Surface the real error so we can debug
      let detail = "Google-Places-Suche fehlgeschlagen.";
      try {
        const errJson = JSON.parse(body);
        if (errJson?.error?.message) detail = errJson.error.message;
      } catch { /* use default */ }
      return NextResponse.json(
        { configured: true, suggestions: [], error: detail },
        { status: 502 }
      );
    }

    const payload: { places?: RawPlace[] } = await response.json();
    const suggestions: PlaceSuggestion[] = (payload.places ?? []).map(mapPlaceToSuggestion);
    return NextResponse.json({ configured: true, suggestions });
  } catch (err: any) {
    console.error("[places] Catch-Block Error:", err?.message ?? err);
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json(
      { configured: true, suggestions: [], error: isTimeout ? "Google-Suche Timeout — bitte erneut versuchen." : `Fehler: ${err?.message ?? "Unbekannt"}` },
      { status: 500 }
    );
  }
}
