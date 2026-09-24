/**
 * Gemeinsame Begriffe rund um die Verortung von Leads.
 *
 * Die Felder `latitude`/`longitude`/`geoSource`/`geoPrecision`/`geoAttemptedAt`/
 * `geoStatus` am Lead haben genau zwei Schreiber:
 *   1. POST /api/leads (gratis, aus einem Places-Treffer)
 *   2. scripts/backfill-lead-coordinates.ts (kostenpflichtig, Google Geocoding)
 * Alles andere liest nur.
 */

/** Woher die Koordinaten stammen. */
export type GeoSource = "places" | "geocode" | "manual";

/**
 * Google-`location_type`. APPROXIMATE heisst: nur Ort/PLZ getroffen, der Punkt
 * liegt auf der Stadtmitte. Solche Positionen duerfen in der UI NIE wie exakte
 * aussehen.
 */
export type GeoPrecision =
  | "ROOFTOP"
  | "RANGE_INTERPOLATED"
  | "GEOMETRIC_CENTER"
  | "APPROXIMATE";

/**
 * pending  — noch nie versucht
 * ok       — Koordinaten vorhanden
 * no_result— Adresse vorhanden, aber kein Treffer (nicht retry-faehig)
 * no_address— gar keine Adresse (nicht retry-faehig)
 * error    — Netz/429/Timeout — der EINZIGE retry-faehige Zustand
 */
export type GeoStatus = "pending" | "ok" | "no_result" | "no_address" | "error";

export const GEO_PRECISIONS: readonly GeoPrecision[] = [
  "ROOFTOP",
  "RANGE_INTERPOLATED",
  "GEOMETRIC_CENTER",
  "APPROXIMATE",
] as const;

export function isGeoPrecision(value: unknown): value is GeoPrecision {
  return typeof value === "string" && (GEO_PRECISIONS as readonly string[]).includes(value);
}

/**
 * Eine Position gilt als ungefaehr, wenn Google nur den Ort getroffen hat oder
 * die Genauigkeit unbekannt ist. Unbekannt bewusst als "ungefaehr" behandeln:
 * lieber ein ehrlich gestrichelter Pin als eine erfundene Hausnummer.
 */
export function isApproximate(precision: string | null | undefined): boolean {
  return precision !== "ROOFTOP" && precision !== "RANGE_INTERPOLATED";
}

/**
 * Akzeptiert nur ein vollstaendiges, plausibles Paar. Ein halbes Paar oder
 * (0,0) wird verworfen — Letzteres ist in der Praxis immer ein Parser-Unfall
 * und wuerde als Pin im Golf von Guinea landen.
 */
export function parseCoordinates(
  rawLat: unknown,
  rawLng: unknown,
): { latitude: number; longitude: number } | null {
  const latitude = toFiniteNumber(rawLat);
  const longitude = toFiniteNumber(rawLng);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Rundet auf 5 Nachkommastellen (~1 m) — der Schluessel, unter dem die Karte
 * Leads an derselben Adresse zu einem Stapel-Pin zusammenfasst.
 */
export function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}
