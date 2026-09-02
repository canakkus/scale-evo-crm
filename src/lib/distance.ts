/**
 * Distance Calculation Utilities using the Haversine Formula.
 * Defaults to Vienna city center (Stephansplatz).
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

// Default base coordinates: Stephansplatz, 1010 Wien
export const DEFAULT_VIENNA_COORDS: Coordinates = {
  lat: 48.2082,
  lng: 16.3738,
};

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates distance from a target location to base coordinates (defaults to Vienna).
 */
export function calculateDistanceKm(
  target: {
    latitude?: number | null;
    longitude?: number | null;
    lat?: number | null;
    lng?: number | null;
  } | null | undefined,
  base: Coordinates = DEFAULT_VIENNA_COORDS
): number | null {
  if (!target) return null;
  const targetLat = target.latitude ?? target.lat;
  const targetLng = target.longitude ?? target.lng;

  if (
    targetLat == null ||
    targetLng == null ||
    isNaN(Number(targetLat)) ||
    isNaN(Number(targetLng))
  ) {
    return null;
  }

  const dist = haversineDistance(
    base.lat,
    base.lng,
    Number(targetLat),
    Number(targetLng)
  );

  return Math.round(dist * 10) / 10;
}

/**
 * Formats a distance in kilometers to a human-readable string (e.g. "800 m" or "1.4 km").
 */
export function formatDistance(distanceKm: number | null | undefined): string | null {
  if (distanceKm == null || isNaN(distanceKm) || distanceKm < 0) {
    return null;
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
