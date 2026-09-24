/**
 * Einheitlicher Bauplan fuer "Route"-/"In Maps oeffnen"-Links.
 *
 * Vorher existierte diese Funktion wortgleich zweimal (pipeline-board-component
 * und leads-table). Statt einen dritten Klon fuer die Karte anzulegen, liegt sie
 * jetzt hier; beide Altstellen importieren sie.
 */

export type MapsUrlTarget = {
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param options.preferCoordinates Nutzt lat/lng als Ziel, sobald vorhanden.
 *   Fuer die Karte richtig (dort ist die Koordinate die genauere Information),
 *   fuer Tabelle/Pipeline bewusst aus: dort ist der gespeicherte
 *   `googleMapsUrl`-Kurzlink das, was der Nutzer kennt.
 */
export function getMapsUrl(
  lead: MapsUrlTarget | null | undefined,
  options: { preferCoordinates?: boolean } = {},
): string | null {
  if (!lead) return null;

  const lat = finiteOrNull(lead.latitude);
  const lng = finiteOrNull(lead.longitude);
  const coordinateUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null;

  if (options.preferCoordinates && coordinateUrl) return coordinateUrl;

  if (lead.googleMapsUrl) return lead.googleMapsUrl;

  if (lead.address || lead.city) {
    const queryParts = [lead.companyName, lead.address, lead.city].filter(Boolean);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(", "))}`;
  }

  return coordinateUrl;
}
