import { calculateDistanceKm, DEFAULT_VIENNA_COORDS, type Coordinates } from "@/lib/distance";
import type { LocationMode } from "@/lib/location-context";

/**
 * Entscheidet, ob der Umkreis-Modus fuer die eingegebene Stadt greifen darf.
 *
 * Places ignoriert `locationBias`, sobald der Suchtext einen Ort enthaelt —
 * im Umkreis-Modus steht die Stadt deshalb gar nicht im Text. Liegt der
 * Standort in einer anderen Stadt als der gesuchten, wuerden also Betriebe
 * rund um den Standort statt in der Stadt geliefert. Dann: stadtweit.
 *
 * Ohne Reverse-Geocoding (kostet) ist die Stadt des Standorts nur so
 * belegbar:
 *  - fixe Adresse enthaelt den Stadtnamen, oder
 *  - gesucht wird Wien und der Standort liegt <= 25 km vom Stephansplatz.
 * Live-GPS ausserhalb Wiens ist damit bewusst NICHT belegbar -> stadtweit.
 */
const VIENNA_NAMES = new Set(["wien", "vienna"]);
const VIENNA_MAX_KM = 25;

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type RadiusAvailability = {
  /** Live-GPS oder fixe Adresse aktiv. Der Standard-Standort zaehlt nicht. */
  hasLocation: boolean;
  /** Standort liegt nachweislich in der gesuchten Stadt. */
  appliesToCity: boolean;
};

export function radiusAvailability(input: {
  mode: LocationMode;
  address: string | null;
  coords: Coordinates | null;
  city: string;
}): RadiusAvailability {
  const hasLocation = input.mode !== "default" && Boolean(input.coords);
  if (!hasLocation) return { hasLocation, appliesToCity: false };

  const city = fold(input.city.replace(/^\d{4}\s*/, ""));
  if (!city) return { hasLocation, appliesToCity: false };

  if (input.mode === "fixed" && input.address && fold(input.address).includes(city)) {
    return { hasLocation, appliesToCity: true };
  }
  if (VIENNA_NAMES.has(city)) {
    const distance = calculateDistanceKm(input.coords, DEFAULT_VIENNA_COORDS);
    return { hasLocation, appliesToCity: distance !== null && distance <= VIENNA_MAX_KM };
  }
  return { hasLocation, appliesToCity: false };
}
