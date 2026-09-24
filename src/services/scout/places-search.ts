import type { RawPlace } from "@/lib/places";
import type { ScoutCategorySearch } from "@/lib/scout-categories";

/**
 * ============================================================
 * GOOGLE PLACES TEXT SEARCH (NEW) — LISTENABRUFE MIT BUDGET
 * ============================================================
 * Parameter gegen die offizielle Doku geprueft (2026-09-11,
 * developers.google.com/maps/documentation/places/web-service/text-search):
 *  - `pageSize` (1–20). `maxResultCount` ist deprecated.
 *  - Folgeseiten ueber `pageToken` = `nextPageToken` der Vorseite;
 *    alle anderen Parameter muessen identisch bleiben, sonst
 *    INVALID_ARGUMENT. `nextPageToken` kommt NUR, wenn es in der
 *    FieldMask steht.
 *  - `includedType` (genau ein Typ aus Table A) + `strictTypeFiltering`.
 *  - `locationBias.circle` { center{latitude,longitude}, radius (m, 0–50000) }.
 *    Achtung: Der Bias wird IGNORIERT, wenn der textQuery einen expliziten
 *    Ort enthaelt — im Umkreis-Modus steht die Stadt deshalb NICHT im Text.
 *  - `rankPreference`: RELEVANCE | DISTANCE.
 *
 * Kosten: abgerechnet wird pro Anfrage, nicht pro Treffer — deshalb
 * immer `pageSize: 20`. `businessStatus`/`primaryType` (Pro-SKU) und
 * `nextPageToken` (ID-only) sind neben den bestehenden Enterprise-Feldern
 * kostenneutral.
 *
 * Kein automatischer Retry: ein 429 heisst Kontingent erschoepft, ein
 * zweiter Versuch waere nur ein weiterer abgelehnter (oder bezahlter) Call.
 * ============================================================
 */

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const LIST_FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.location",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const PAGE_SIZE = 20;
const REQUEST_TIMEOUT_MS = 12_000;

export type PlacesArea =
  | { mode: "city"; city: string }
  | { mode: "radius"; city: string; lat: number; lng: number; radiusKm: number };

export type PlacesPage =
  | { ok: true; places: RawPlace[]; nextPageToken: string | null }
  | { ok: false; reason: string };

/** Zaehlt JEDEN Listenaufruf — auch fehlgeschlagene, denn abgesetzt ist abgesetzt. */
export class PlacesCallBudget {
  used = 0;
  constructor(readonly max: number) {}
  get remaining() {
    return Math.max(0, this.max - this.used);
  }
  take(): boolean {
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }
}

export function isPlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function buildBody(search: ScoutCategorySearch, area: PlacesArea, pageToken?: string) {
  const body: Record<string, unknown> = {
    textQuery: area.mode === "radius" ? search.query : `${search.query} in ${area.city}`,
    languageCode: "de",
    regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
    pageSize: PAGE_SIZE,
  };
  if (search.includedType) {
    body.includedType = search.includedType;
    body.strictTypeFiltering = search.strict;
  }
  if (area.mode === "radius") {
    body.locationBias = {
      circle: { center: { latitude: area.lat, longitude: area.lng }, radius: Math.min(50_000, area.radiusKm * 1000) },
    };
    body.rankPreference = "DISTANCE";
  }
  if (pageToken) body.pageToken = pageToken;
  return body;
}

/**
 * Ein Listenaufruf. Wirft nie — jeder Fehler kommt als `{ ok: false, reason }`
 * zurueck, damit der Aufrufer mit Teilergebnissen weiterarbeiten kann.
 * Der Budget-Zaehler wird VOR dem Request belastet.
 */
export async function fetchPlacesPage(
  search: ScoutCategorySearch,
  area: PlacesArea,
  budget: PlacesCallBudget,
  pageToken?: string,
): Promise<PlacesPage> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, reason: "Google-Places-API-Key fehlt." };
  if (!budget.take()) return { ok: false, reason: "Places-Budget für diese Suche aufgebraucht." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": LIST_FIELD_MASK,
      },
      body: JSON.stringify(buildBody(search, area, pageToken)),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const detail = payload?.error?.message ? ` — ${payload.error.message.slice(0, 160)}` : "";
      const reason =
        response.status === 429
          ? "Google Places: Kontingent erschöpft (HTTP 429)."
          : `Google Places lehnte die Suche „${search.query}" ab (HTTP ${response.status})${detail}.`;
      return { ok: false, reason };
    }

    const payload: { places?: RawPlace[]; nextPageToken?: string } = await response.json();
    return { ok: true, places: payload.places ?? [], nextPageToken: payload.nextPageToken || null };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? `Google Places hat bei „${search.query}" nicht rechtzeitig geantwortet.`
        : `Google Places nicht erreichbar („${search.query}").`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Link fuer "Quelle öffnen" — reiner Maps-Link, kein API-Aufruf. */
export function mapsSearchUrl(searches: ScoutCategorySearch[], area: PlacesArea): string {
  const terms = searches.map((search) => search.query).join(", ");
  const query = area.mode === "radius" ? terms : `${terms} in ${area.city}`;
  const base = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  return area.mode === "radius" ? `${base}/@${area.lat},${area.lng},14z` : base;
}
