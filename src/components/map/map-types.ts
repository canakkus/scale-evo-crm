import type { AcquisitionType, LeadStatus } from "@prisma/client";
import { coordinateKey, isApproximate } from "@/lib/geo";

/** Antwortform von GET /api/leads/map. */
export type MapLead = {
  id: string;
  companyName: string;
  latitude: number | null;
  longitude: number | null;
  status: LeadStatus;
  acquisitionType: AcquisitionType;
  industry: string | null;
  phone: string | null;
  score: number;
  lastContactAt: string | null;
  city: string | null;
  address: string | null;
  geoPrecision: string | null;
  geoStatus: string;
};

/** Ein Lead mit gesicherter Position — nur solche landen auf der Karte. */
export type LocatedLead = MapLead & {
  latitude: number;
  longitude: number;
  /** Luftlinie zum aktuellen Standort. null, wenn nicht berechenbar. */
  distanceKm: number | null;
  /** Google kannte nur Ort/PLZ — der Punkt liegt auf der Stadtmitte. */
  approximate: boolean;
  /** Letzter Kontakt aelter als 30 Tage oder nie. */
  stale: boolean;
};

/**
 * Ein Pin auf der Karte. Mehrere Leads an identischer Koordinate (5 Nachkomma-
 * stellen) werden zu EINEM Stapel-Pin — ohne das taeuschen 30 uebereinander
 * liegende Punkte auf der Stadtmitte einen Datenbestand vor, den es nicht gibt.
 */
export type PinGroup = {
  key: string;
  latitude: number;
  longitude: number;
  leads: LocatedLead[];
  /** Sobald EIN Mitglied ungenau ist, wird der ganze Stapel gestrichelt gezeichnet. */
  approximate: boolean;
  /** Alle Mitglieder sind verrottet -> Pin wird blasser gezeichnet. */
  stale: boolean;
};

export const STALE_DAYS = 30;

export function daysSinceContact(lastContactAt: string | null): number | null {
  if (!lastContactAt) return null;
  const parsed = Date.parse(lastContactAt);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

export function isStale(lastContactAt: string | null): boolean {
  const days = daysSinceContact(lastContactAt);
  return days === null || days > STALE_DAYS;
}

/** Grund, warum ein Lead nicht auf der Karte auftaucht — als Nutzertext. */
export function missingLocationReason(lead: MapLead): string {
  if (lead.geoStatus === "no_address") return "keine Adresse";
  if (lead.geoStatus === "no_result") return "nicht gefunden";
  if (lead.geoStatus === "error") return "Abfrage fehlgeschlagen";
  if (!lead.address && !lead.city) return "keine Adresse";
  return "noch nicht geprüft";
}

export function toLocatedLead(
  lead: MapLead,
  distanceKm: number | null,
): LocatedLead | null {
  if (typeof lead.latitude !== "number" || typeof lead.longitude !== "number") return null;
  return {
    ...lead,
    latitude: lead.latitude,
    longitude: lead.longitude,
    distanceKm,
    approximate: isApproximate(lead.geoPrecision),
    stale: isStale(lead.lastContactAt),
  };
}

export function groupByCoordinate(leads: LocatedLead[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const lead of leads) {
    const key = coordinateKey(lead.latitude, lead.longitude);
    const existing = groups.get(key);
    if (existing) {
      existing.leads.push(lead);
      existing.approximate = existing.approximate || lead.approximate;
      existing.stale = existing.stale && lead.stale;
    } else {
      groups.set(key, {
        key,
        latitude: lead.latitude,
        longitude: lead.longitude,
        leads: [lead],
        approximate: lead.approximate,
        stale: lead.stale,
      });
    }
  }
  return [...groups.values()];
}

/** Sortierung der Seitenliste: naechster Lead zuerst, Unbekanntes ans Ende. */
export function byDistance(a: LocatedLead, b: LocatedLead): number {
  if (a.distanceKm === null && b.distanceKm === null) return a.companyName.localeCompare(b.companyName, "de");
  if (a.distanceKm === null) return 1;
  if (b.distanceKm === null) return -1;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.companyName.localeCompare(b.companyName, "de");
}
