import type { WebPresence } from "@prisma/client";
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
  };
  menu: {
    status: ScoutStepStatus;
    url: string | null;
    isPdf: boolean;
  };
  audit: AuditResult | null;
  contacts: { phone: string | null; email: string | null; instagram: string | null };
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
    source: string;
    notes: string;
    acquisitionType?: "CALL" | "WALK_IN";
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
  // Advanced filters
  hasWebsiteFilter?: "all" | "yes" | "no";
  hasTreatwellFilter?: "all" | "yes" | "no";
  hasPhoneFilter?: "all" | "yes" | "no";
  hasInstagramFilter?: "all" | "yes" | "no";
};

export type LeadScoutResponse = {
  sessionId?: string;
  sourceUrl: string;
  totalFound: number;
  filteredCount: number;
  results: ScoutResult[];
  treatsWellError?: string;
  placesConfigured: boolean;
};
