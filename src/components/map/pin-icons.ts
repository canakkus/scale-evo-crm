import type { AcquisitionType } from "@prisma/client";
import { STATUS_STYLES } from "@/components/ui/status-badge";
import type { PinGroup } from "./map-types";

/**
 * Kanal doppelt kodiert (Form + Ring), damit die Karte nicht allein von der
 * Farbunterscheidung lebt.
 */
const CHANNEL_RING: Record<AcquisitionType, string> = {
  CALL: "var(--bg)", // ruhigster Ring — das ist die grosse Mehrheit der Leads
  WALK_IN: "var(--text)",
  DM: "var(--channel-dm-tx)",
  EMAIL: "#F59E0B",
};

const CHANNEL_CLASS: Record<AcquisitionType, string> = {
  CALL: "map-pin--call",
  WALK_IN: "map-pin--walkin",
  DM: "map-pin--dm",
  EMAIL: "map-pin--email",
};

/**
 * Fuellung kommt aus der `tx`-Variante der einen Status-Farbtabelle des
 * Projekts. Die `bg`-Varianten sind fast schwarz und auf dunklem Grund
 * unsichtbar.
 */
export function pinFillColor(group: PinGroup): string {
  const lead = group.leads[0];
  return (STATUS_STYLES[lead.status] ?? STATUS_STYLES.NEW).tx;
}

function pinOpacity(group: PinGroup): number {
  // Ungenauigkeit zeigt schon die gestrichelte Kontur — die Deckkraft kodiert
  // nur noch "lange kein Kontakt", sonst stapeln sich beide Abschwaechungen
  // bis zur Unsichtbarkeit.
  if (group.stale) return 0.7;
  return 1;
}

export function pinClassName(group: PinGroup): string {
  const lead = group.leads[0];
  return [
    "map-pin",
    CHANNEL_CLASS[lead.acquisitionType] ?? CHANNEL_CLASS.CALL,
    group.approximate ? "map-pin--approx" : "",
    group.stale ? "map-pin--stale" : "",
    group.leads.length > 1 ? "map-pin--stack" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Reines Markup, keine Nutzereingaben: Status/Kanal sind Enums, die Zahl ist
 * eine Laenge. Es gibt hier nichts zu escapen, was aus der DB kaeme.
 */
export function pinHtml(group: PinGroup): string {
  const opacity = pinOpacity(group);

  if (group.leads.length > 1) {
    return `<span class="map-pin__stack" style="opacity:${opacity}">${group.leads.length}</span>`;
  }

  const lead = group.leads[0];
  const fill = pinFillColor(group);
  const ring = CHANNEL_RING[lead.acquisitionType] ?? CHANNEL_RING.CALL;
  return `<span class="map-pin__dot" style="--pin-color:${fill};--pin-ring:${ring};opacity:${opacity}"></span>`;
}

/** Barrierefreier Kurztext fuer den Marker-Button. */
export function pinLabel(group: PinGroup): string {
  if (group.leads.length > 1) {
    return `${group.leads.length} Leads an einer Adresse`;
  }
  return group.leads[0].companyName;
}
