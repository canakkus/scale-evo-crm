import type { AcquisitionType, PreferredContactMethod, WebPresence } from "@prisma/client";
import type { PlaceSuggestion } from "@/lib/places";
import type { AuditResult } from "@/services/audit/types";

export type ScoutStepStatus = "ok" | "warn" | "fail" | "skip";

export type ScoutDuplicateMatch = {
  id: string;
  companyName: string;
  address: string | null;
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

export const RESTAURANT_CATEGORIES = [
  "Restaurant",
  "Pizzeria",
  "Café & Bar",
  "Imbiss",
  "Gastronomie",
];

/**
 * Harte Obergrenzen pro Scout-Lauf. Gelten serverseitig in `runLeadScout`
 * und damit fuer ALLE Aufrufer — auch fuer die KI-Tools in groq.ts/gemini.ts,
 * die maxResults ungeprueft durchreichen.
 */
export const SCOUT_LIMITS = {
  /** Hoechstens so viele Betriebe werden pro Lauf tatsaechlich geprueft (scoutVenue). */
  maxScoutedVenues: 40,
  /** Hoechstens so viele Places-Listenaufrufe (inkl. Folgeseiten und "Alle"-Einzelsuchen). */
  maxPlacesListCalls: 3,
  /** Nach dieser Zeit startet kein neuer Pruef-Block mehr. */
  timeBudgetMs: 45_000,
  /** Obergrenze fuer die gewuenschte Trefferzahl. */
  maxResults: 30,
} as const;

export const SCOUT_RADIUS_OPTIONS = [3, 5] as const;
export type ScoutRadiusKm = (typeof SCOUT_RADIUS_OPTIONS)[number];

export type VenueSource = "treatwell" | "places";

export type TreatwellVenue = {
  key: string;
  name: string;
  source: VenueSource;
  treatwellUrl: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  streetAddress: string | null;
  locality: string | null;
  postalCode: string | null;
  addressLine: string;
  phone: string | null;
  website: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Google-Typen aus Places (Table A/B). Leer/undefined = unbekannt, NICHT "passt nicht". */
  types?: string[];
  /** Places `businessStatus` — OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY. */
  businessStatus?: string | null;
  /** Branche laut mapIndustry() aus den Google-Typen. */
  industry?: string | null;
};

export type InstagramCandidateView = {
  handle: string;
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
};

/** Gratis-Sicht auf einen Snapshot aus dem Cache. Nie aus einem Live-Abruf. */
export type InstagramSnapshotView = {
  source: "graph-api" | "apify" | "public-page";
  fetchedAt: string;
  ageDays: number;
  stale: boolean;
  incomplete: boolean;
  followerCount: number | null;
  isBusinessAccount: boolean | null;
  isPrivate: boolean | null;
  bio: string | null;
  externalUrl: string | null;
  /** false = "unbekannt", NICHT "kein Link". */
  externalUrlKnown: boolean;
  lastPostAt: string | null;
  /** Beim Lesen aus lastPostAt berechnet, nie gecacht. */
  daysSinceLastPost: number | null;
};

export type InstagramInsight = {
  handle: string;
  /** null = noch nie geprueft. */
  snapshot: InstagramSnapshotView | null;
  /** Nur mit Snapshot. Ohne Snapshot gibt es bewusst KEINEN Score (keine 0). */
  score: { score: number; approximate: boolean; reasons: Array<{ key: string; label: string; points: number }> } | null;
  /** Lead im CRM mit genau diesem Handle (normalisiert). */
  crmLead: { id: string; acquisitionType: AcquisitionType } | null;
};

export type ChainInfo = {
  suspected: boolean;
  /** Menschlich lesbare Gruende, z. B. "3× im Ergebnis". */
  reasons: string[];
};

export type ScoutResult = {
  venue: TreatwellVenue;
  distanceKm?: number | null;
  duplicate: {
    status: ScoutStepStatus;
    matches: ScoutDuplicateMatch[];
  };
  maps: {
    status: ScoutStepStatus;
    place: PlaceSuggestion | null;
    matchReason: string;
  };
  website: {
    status: ScoutStepStatus;
    url: string | null;
    source: "maps" | "search" | null;
    /** hasSolidWebsite(url): eigene, belastbare Website (kein Linktree/Social/Lieferdienst). */
    solid?: boolean;
    /** Websuche nicht beantwortet (Block/Timeout) — "keine Website" ist dann unbekannt. */
    searchFailed?: boolean;
  };
  menu: {
    status: ScoutStepStatus;
    url: string | null;
    isPdf: boolean;
  };
  audit: AuditResult | null;
  contacts: { phone: string | null; email: string | null; instagram: string | null };
  instagramProfile: {
    status: ScoutStepStatus;
    /** Nur gesetzt, wenn eindeutig — sonst entscheidet der Nutzer. */
    handle: string | null;
    source: "website" | "search" | null;
    candidates: InstagramCandidateView[];
    /** Beide Suchmaschinen haben nicht geantwortet — "keins" ist dann unbekannt. */
    searchFailed?: boolean;
  };
  chain?: ChainInfo;
  /** Frisch aus dem Snapshot-Cache gelesen, nie in rawData persistiert. */
  instagramInsight?: InstagramInsight | null;
  leadDraft: {
    companyName: string;
    industry: string | null;
    address: string | null;
    city: string | null;
    webPresence: WebPresence;
    website: string | null;
    treatwellUrl: string | null;
    phone: string | null;
    email: string | null;
    instagram: string | null;
    googleMapsUrl: string | null;
    googleRating: number | null;
    googleReviewCount: number | null;
    /**
     * Koordinaten aus dem bereits bezahlten Places-Treffer. Sie einfach
     * mitzugeben kostet keinen zusaetzlichen API-Aufruf und erspart dem Lead
     * spaeter ein Geocoding. POST /api/leads setzt daraus geoSource "places".
     */
    latitude: number | null;
    longitude: number | null;
    source: string;
    notes: string;
    acquisitionType?: "CALL" | "WALK_IN" | "DM";
    preferredContactMethod?: PreferredContactMethod | null;
    nfcDemoUrl?: string | null;
  };
};

export type LeadScoutOptions = {
  category: string;
  city: string;
  minRating: number;
  minReviews: number;
  maxResults: number;
  source: VenueSource;
  sortBy?: "rating" | "distance";
  baseLat?: number | null;
  baseLng?: number | null;
  /** null/undefined = stadtweit. Nur mit baseLat/baseLng wirksam. */
  radiusKm?: ScoutRadiusKm | null;
  // Advanced filters
  hasWebsiteFilter?: "all" | "yes" | "no";
  hasTreatwellFilter?: "all" | "yes" | "no";
  hasPhoneFilter?: "all" | "yes" | "no";
  hasInstagramFilter?: "all" | "yes" | "no";
  /** Kettenverdacht ausblenden (vor dem Pruefen, spart Kosten). */
  hideChains?: boolean;
  /** Sichere Duplikate aus dem CRM ausblenden. */
  onlyNew?: boolean;
};

export type PrefilterReason = "closed" | "type" | "distance" | "rating" | "treatwell" | "chain" | "website" | "duplicate";

export const PREFILTER_LABELS: Record<PrefilterReason, string> = {
  closed: "geschlossen",
  type: "andere Branche",
  distance: "außerhalb des Umkreises",
  rating: "Bewertung zu niedrig",
  treatwell: "Treatwell-Filter",
  chain: "Kettenverdacht",
  website: "eigene Website",
  duplicate: "schon im CRM",
};

export type ScoutFunnelStage = {
  key: "instagram" | "website" | "chain" | "new" | "phone";
  /** "keep" = "{count} {label}", "remove" = "−{removed} {label}". */
  kind: "keep" | "remove";
  label: string;
  count: number;
  removed: number;
  /** Nur bei key "instagram": Aufschluesselung der uebrig gebliebenen. */
  instagram?: { found: number; choose: number; failed: number };
};

export type ScoutFunnel = {
  /** Eindeutige Betriebe aus Treatwell/Places. */
  found: number;
  /** Vor dem Pruefen gratis aussortiert. */
  prefiltered: { total: number; byReason: Partial<Record<PrefilterReason, number>> };
  /** Tatsaechlich geprueft (scoutVenue). */
  scouted: number;
  stages: ScoutFunnelStage[];
  final: number;
  /** Instagram-Zustaende ueber ALLE gepruefte Betriebe. */
  instagram: Record<InstagramState, number>;
};

export type ScoutBudget = {
  scouted: number;
  maxScouted: number;
  placesCalls: number;
  maxPlacesCalls: number;
  elapsedMs: number;
  timeBudgetMs: number;
  target: number;
  /** Warum der Lauf endete. */
  stoppedBy: "target" | "no-more-candidates" | "venues" | "places-calls" | "time";
  /** true = ein Limit hat gegriffen, bevor das Ziel erreicht war. */
  exhausted: boolean;
};

export type LeadScoutResponse = {
  sessionId?: string;
  sourceUrl: string;
  totalFound: number;
  results: ScoutResult[];
  treatsWellError?: string;
  /** Nicht-fatale Hinweise (Teilausfall Places, Cache nicht lesbar …). */
  notices?: string[];
  funnel?: ScoutFunnel;
  budget?: ScoutBudget;
  /** Wurde der Umkreis tatsaechlich angewendet? */
  radiusApplied?: ScoutRadiusKm | null;
  placesConfigured: boolean;
};

// ---------------------------------------------------------------------------
// Instagram-Zustand einer Karte
// ---------------------------------------------------------------------------

export type InstagramState = "found" | "choose" | "none" | "failed";

/**
 * Leitet den Zustand aus den gespeicherten Daten ab — funktioniert auch fuer
 * alte Sessions ohne `searchFailed` (dort war "skip" der Fehlerfall).
 */
export function instagramStateOf(profile: ScoutResult["instagramProfile"] | undefined): InstagramState {
  if (!profile) return "failed";
  if (profile.handle) return "found";
  if (profile.candidates?.length) return "choose";
  if (profile.searchFailed || profile.status === "skip") return "failed";
  return "none";
}
