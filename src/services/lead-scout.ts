import { WebPresence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapPlaceToSuggestion, type PlaceSuggestion, type RawPlace } from "@/lib/places";
import { instagramProfileUrl, normalizeInstagramHandle, normalizePhone, normalizeUrl } from "@/lib/utils";
import {
  SCOUT_LIMITS,
  instagramStateOf,
  type InstagramState,
  type LeadScoutOptions,
  type LeadScoutResponse,
  type PrefilterReason,
  type ScoutBudget,
  type ScoutFunnel,
  type ScoutFunnelStage,
  type ScoutRadiusKm,
  type ScoutResult,
  type TreatwellVenue,
} from "@/lib/lead-scout-types";
import { categorySearchesFor, matchesCategoryTypes, type ScoutCategorySearch } from "@/lib/scout-categories";
import { hasSolidWebsite } from "@/services/instagram/enrichment";
import { findDuplicates } from "./dedup";
import { searchTreatwell } from "./treatwell";
import { searchFirstExternalUrlDetailed, searchInstagramProfilesDetailed } from "./web-search";
import { WebsiteAuditProvider } from "./audit/website-provider";
import type { AuditResult } from "./audit/types";
import { calculateDistanceKm } from "@/lib/distance";
import { buildChainContext, chainDomainOf, detectChain, type ChainContext } from "./scout/chain";
import {
  PlacesCallBudget,
  fetchPlacesPage,
  isPlacesConfigured,
  mapsSearchUrl,
  type PlacesArea,
} from "./scout/places-search";
import { attachInstagramInsights } from "./scout/instagram-insights";

export type { LeadScoutOptions, LeadScoutResponse, ScoutResult, TreatwellVenue };

// ---------------------------------------------------------------------------
// Einzel-Abgleich Treatwell-Betrieb -> Google-Maps-Eintrag
// (1 Call pro Betrieb, gedeckelt ueber SCOUT_LIMITS.maxScoutedVenues)
// ---------------------------------------------------------------------------

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const MATCH_FIELD_MASK =
  "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName,places.location";

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9äöü]/g, "");
}

function matchScore(venue: TreatwellVenue, place: PlaceSuggestion) {
  const vName = norm(venue.name);
  const pName = norm(place.name);
  const nameMatch =
    vName.length > 2 && pName.length > 2 && (vName === pName || vName.includes(pName) || pName.includes(vName));

  const vStreet = norm(venue.streetAddress ?? "");
  const pAddr = norm(place.address);
  const streetMatch = vStreet.length > 3 && pAddr.includes(vStreet);
  const city = norm(venue.locality?.split(",")[0] ?? "");
  const cityMatch = city.length > 2 && pAddr.includes(city);
  const addressMatch = streetMatch || (cityMatch && nameMatch);

  return { nameMatch, streetMatch, addressMatch, score: (nameMatch ? 1 : 0) + (addressMatch ? 1 : 0) };
}

async function searchPlaces(query: string): Promise<PlaceSuggestion[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": MATCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        pageSize: 5,
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload: { places?: RawPlace[] } = await response.json();
    return (payload.places ?? []).map(mapPlaceToSuggestion);
  } catch {
    return null;
  }
}

function rawToVenue(raw: RawPlace, city: string): TreatwellVenue {
  const place = mapPlaceToSuggestion(raw);
  const street = place.address.split(",")[0]?.trim() || null;
  const postal = place.address.match(/\b\d{4}\b/)?.[0] ?? null;
  return {
    key: place.googleMapsUri ?? `${place.name}-${place.address}`,
    name: place.name,
    source: "places",
    treatwellUrl: null,
    googleMapsUri: place.googleMapsUri,
    rating: place.rating,
    reviewCount: place.reviewCount,
    streetAddress: street,
    locality: place.city || city,
    postalCode: postal,
    addressLine: place.address,
    phone: place.phone,
    website: place.website,
    latitude: place.latitude,
    longitude: place.longitude,
    types: raw.types ?? [],
    businessStatus: raw.businessStatus ?? null,
    industry: place.industry,
  };
}

type LeadRow = Awaited<ReturnType<typeof prisma.lead.findMany>>[number];

/** Eine Website zaehlt fuer den Dublettencheck nur, wenn sie einen Betrieb identifiziert. */
function identityWebsite(url: string | null): string | null {
  // "instagram.com", "linktr.ee" oder "booksy.com" teilen sich viele Betriebe.
  // Als "Gleiche Website" (harte ID, 100 Punkte) wuerde sonst jeder Salon mit
  // Instagram-Link zum sicheren Duplikat — und "Nur neue" wuerfe genau die
  // Zielgruppe raus.
  return chainDomainOf(url) ? url : null;
}

function findScoutDuplicates(
  venue: TreatwellVenue,
  collected: { phone: string | null; website: string | null; googleMapsUrl: string | null; instagram: string | null },
  leads: LeadRow[],
) {
  return findDuplicates(
    {
      companyName: venue.name,
      address: venue.streetAddress ?? venue.addressLine,
      city: venue.locality ?? undefined,
      treatwellUrl: venue.treatwellUrl,
      phone: collected.phone,
      website: identityWebsite(collected.website),
      googleMapsUrl: collected.googleMapsUrl,
      instagram: collected.instagram,
    },
    leads,
  );
}

type Candidate = { venue: TreatwellVenue; search: ScoutCategorySearch };

type ScoutContext = {
  options: LeadScoutOptions;
  leads: LeadRow[];
  chain: ChainContext;
};

async function scoutVenue({ venue, search }: Candidate, context: ScoutContext): Promise<ScoutResult> {
  const { options, leads } = context;
  let place: PlaceSuggestion | null = null;
  let mapsStatus: ScoutResult["maps"]["status"] = "fail";
  let matchReason = "Kein Google-Maps-Eintrag gefunden.";
  let mapsMatched = false;

  if (venue.source === "places") {
    place = {
      name: venue.name,
      address: venue.addressLine,
      city: venue.locality ?? options.city,
      phone: venue.phone,
      website: venue.website,
      rating: venue.rating,
      reviewCount: venue.reviewCount,
      googleMapsUri: venue.googleMapsUri,
      industry: venue.industry ?? search.industry,
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
    mapsStatus = "ok";
    matchReason = "Direkt aus Google Places übernommen.";
    mapsMatched = true;
  } else if (venue.name && options.city) {
    const suggestions = await searchPlaces(`${venue.name} ${options.city}`);
    if (suggestions && suggestions.length > 0) {
      const ranked = suggestions
        .map((candidate) => ({ candidate, match: matchScore(venue, candidate) }))
        .sort((a, b) => b.match.score - a.match.score);
      const best = ranked[0];
      if (best.match.score >= 2) {
        place = best.candidate;
        mapsStatus = "ok";
        matchReason = "Name und Adresse stimmen überein.";
        mapsMatched = true;
      } else if (best.match.nameMatch) {
        place = best.candidate;
        mapsStatus = "warn";
        matchReason = "Name passt, Adresse abweichend – manuell prüfen.";
        mapsMatched = true;
      } else {
        matchReason = "Kein übereinstimmender Google-Maps-Eintrag.";
      }
    }
  }

  let websiteUrl: string | null = place?.website ? normalizeUrl(place.website) : null;
  let websiteSource: "maps" | "search" | null = websiteUrl ? "maps" : null;
  let websiteSearchFailed = false;

  if (!websiteUrl) {
    const found = await searchFirstExternalUrlDetailed(`${venue.name} ${options.city} website`, { venueName: venue.name });
    if (found.url) {
      websiteUrl = normalizeUrl(found.url);
      websiteSource = "search";
    }
    websiteSearchFailed = found.failed;
  }

  let audit: AuditResult | null = null;
  if (websiteUrl) {
    try {
      audit = await new WebsiteAuditProvider().analyze(websiteUrl);
    } catch {
      audit = null;
    }
  }

  const phone = place?.phone ?? audit?.extracted.phone ?? null;
  const rawEmail = audit?.extracted.email ?? null;
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) ? rawEmail : null;
  const instagram = audit?.extracted.instagram ? normalizeUrl(audit.extracted.instagram) : null;

  // Instagram-Profil bestimmen. Erste Wahl ist der Link von der eigenen
  // Website (verlaesslich). Fehlt der, wird ueber die Suchmaschinen gesucht —
  // bewusst nicht ueber Instagram selbst. Mehrdeutige Treffer werden NICHT
  // automatisch uebernommen, sondern in der UI zur Auswahl gestellt.
  // Haben beide Suchmaschinen nicht geantwortet, heisst das "unbekannt" —
  // nicht "kein Profil".
  const websiteHandle = normalizeInstagramHandle(instagram);
  let instagramProfile: ScoutResult["instagramProfile"] = websiteHandle
    ? { status: "ok", handle: websiteHandle, source: "website", candidates: [] }
    : { status: "fail", handle: null, source: null, candidates: [] };

  if (!websiteHandle) {
    try {
      const { candidates, failed } = await searchInstagramProfilesDetailed(venue.name, options.city);
      // Nur EIN sicherer Treffer ist eindeutig. Zwei "high" heisst: wir wissen
      // es nicht — dann entscheidet der Nutzer, statt dass wir den ersten raten.
      const highs = candidates.filter((candidate) => candidate.confidence === "high");
      if (highs.length === 1) {
        instagramProfile = { status: "ok", handle: highs[0].handle, source: "search", candidates };
      } else if (candidates.length > 0) {
        instagramProfile = { status: "warn", handle: null, source: "search", candidates };
      } else if (failed) {
        instagramProfile = { status: "skip", handle: null, source: null, candidates: [], searchFailed: true };
      }
    } catch {
      instagramProfile = { status: "skip", handle: null, source: null, candidates: [], searchFailed: true };
    }
  }

  const matches = findScoutDuplicates(
    venue,
    {
      phone,
      website: websiteUrl,
      googleMapsUrl: place?.googleMapsUri ? normalizeUrl(place.googleMapsUri) : null,
      // Auch das per Suche eindeutig gefundene Handle — sonst feuert das
      // 80-Punkte-Signal "Gleicher Instagram-Account" in dedup.ts nie.
      instagram: instagram ?? instagramProfile.handle,
    },
    leads,
  );
  const hasHighMatch = matches.some((match) => match.confidence === "high");
  const duplicate = {
    status: (matches.length === 0 ? "ok" : hasHighMatch ? "fail" : "warn") as "ok" | "fail" | "warn",
    matches: matches.map((match) => ({
      id: match.lead.id,
      companyName: match.lead.companyName,
      address: match.lead.address,
      confidence: match.confidence,
      score: match.score,
      reasons: match.reasons,
    })),
  };

  const hasWebsite = Boolean(websiteUrl);
  const solidWebsite = hasSolidWebsite(websiteUrl);
  const hasContact = Boolean(phone || email || instagram);

  const menu: ScoutResult["menu"] = audit
    ? !audit.reachable
      ? { status: "skip", url: null, isPdf: false }
      : audit.hasMenu
        ? audit.menuIsPdf
          ? { status: "warn", url: audit.menuUrl, isPdf: true }
          : { status: "ok", url: audit.menuUrl, isPdf: false }
        : { status: "fail", url: null, isPdf: false }
    : { status: "skip", url: null, isPdf: false };

  const menuNote = !audit
    ? null
    : audit.hasMenu
      ? audit.menuIsPdf
        ? `Speisekarte NUR als PDF (${audit.menuUrl ?? "Link vorhanden"}).`
        : "Speisekarte digital vorhanden."
      : "Keine Speisekarte auf der Website erkannt.";

  const notes = [
    venue.source === "places"
      ? `Google: ${venue.rating ?? "–"}★ (${venue.reviewCount ?? 0} Bewertungen)`
      : `Treatwell: ${venue.rating ?? "–"}★ (${venue.reviewCount ?? 0} Bewertungen)`,
    venue.treatwellUrl ? `Treatwell-Profil: ${venue.treatwellUrl}` : null,
    venue.addressLine ? `Adresse: ${venue.addressLine}` : null,
    solidWebsite
      ? `Website via ${websiteSource === "maps" ? "Google Maps" : "Websuche"} gefunden.`
      : hasWebsite
        ? "Keine eigene Website — nur Social-/Plattform-Link."
        : websiteSearchFailed
          ? "Website unbekannt — Websuche nicht beantwortet."
          : "Keine eigene Website gefunden.",
    menuNote,
    mapsMatched ? `Maps-Abgleich: ${matchReason}` : null,
    !hasContact ? "Keine Kontaktmöglichkeit gefunden." : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lat = place?.latitude ?? venue.latitude ?? null;
  const lng = place?.longitude ?? venue.longitude ?? null;
  const baseCoords =
    options.baseLat != null && options.baseLng != null
      ? { lat: options.baseLat, lng: options.baseLng }
      : undefined;
  const distanceKm = calculateDistanceKm(lat != null && lng != null ? { lat, lng } : null, baseCoords);

  return {
    venue: {
      ...venue,
      latitude: lat,
      longitude: lng,
    },
    distanceKm,
    duplicate,
    maps: { status: mapsStatus, place, matchReason },
    website: {
      status: hasWebsite ? "ok" : websiteSearchFailed ? "skip" : "fail",
      url: websiteUrl,
      source: websiteSource,
      solid: solidWebsite,
      searchFailed: !hasWebsite && websiteSearchFailed,
    },
    menu,
    audit,
    contacts: { phone, email, instagram },
    instagramProfile,
    chain: detectChain({ name: venue.name, website: websiteUrl }, context.chain),
    leadDraft: {
      companyName: venue.name,
      // Echte Branche aus den Google-Typen (mapIndustry), nie die Suchkategorie:
      // "Alle" als Branche loeste in score.ts ein falsches INDUSTRY_MATCH aus.
      industry: place?.industry ?? venue.industry ?? search.industry,
      address: place?.address ?? (venue.addressLine || null),
      city: place?.city ?? options.city,
      webPresence: solidWebsite
        ? WebPresence.WEBSITE
        : venue.treatwellUrl
          ? WebPresence.TREATWELL_ONLY
          : WebPresence.NONE,
      website: hasWebsite ? websiteUrl : null,
      treatwellUrl: normalizeUrl(venue.treatwellUrl),
      phone: normalizePhone(phone),
      email,
      instagram: instagram ?? instagramProfileUrl(instagramProfile.handle),
      googleMapsUrl: place?.googleMapsUri ? normalizeUrl(place.googleMapsUri) : null,
      googleRating: place?.rating ?? null,
      googleReviewCount: place?.reviewCount ?? null,
      // Gratis-Verortung: lat/lng liegen aus dem Places-Treffer bereits vor.
      latitude: lat,
      longitude: lng,
      source: venue.source === "places" ? "Google Places Lead-Scout" : "Treatwell Lead-Scout",
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Optionen, Umkreis, Vorfilter
// ---------------------------------------------------------------------------

function clampMaxResults(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Math.min(SCOUT_LIMITS.maxResults, Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : 10));
}

function resolveArea(options: LeadScoutOptions): PlacesArea {
  const radius = options.radiusKm;
  const lat = options.baseLat;
  const lng = options.baseLng;
  const validCoords =
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if ((radius === 3 || radius === 5) && validCoords) {
    return { mode: "radius", city: options.city, lat, lng, radiusKm: radius };
  }
  return { mode: "city", city: options.city };
}

function distanceFromBase(venue: TreatwellVenue, area: PlacesArea): number | null {
  if (area.mode !== "radius" || venue.latitude == null || venue.longitude == null) return null;
  return calculateDistanceKm({ lat: venue.latitude, lng: venue.longitude }, { lat: area.lat, lng: area.lng });
}

/**
 * Gratis-Vorfilter VOR scoutVenue — spart Websuche, Audit, Instagram-Suche
 * und (bei Treatwell) den Places-Abgleich. Arbeitet nur mit Daten, die
 * bereits vorliegen. Fehlende Daten (keine Typen, kein Status) filtern nie.
 */
function prefilterReason(candidate: Candidate, options: LeadScoutOptions, context: ScoutContext, area: PlacesArea): PrefilterReason | null {
  const { venue, search } = candidate;
  if (venue.businessStatus === "CLOSED_PERMANENTLY" || venue.businessStatus === "CLOSED_TEMPORARILY") return "closed";
  if (matchesCategoryTypes(venue.types, search.matchTypes) === false) return "type";
  const distance = distanceFromBase(venue, area);
  if (area.mode === "radius" && distance != null && distance > area.radiusKm) return "distance";
  if ((venue.rating ?? 0) < options.minRating || (venue.reviewCount ?? 0) < options.minReviews) return "rating";
  if (options.hasTreatwellFilter === "yes" && !venue.treatwellUrl) return "treatwell";
  if (options.hasTreatwellFilter === "no" && venue.treatwellUrl) return "treatwell";
  if (options.hideChains && detectChain({ name: venue.name, website: venue.website }, context.chain).suspected) return "chain";
  // Nur der sichere Fall: Places meldet eine belastbare eigene Website.
  if (options.hasWebsiteFilter === "no" && hasSolidWebsite(venue.website)) return "website";
  if (options.onlyNew) {
    const matches = findScoutDuplicates(
      venue,
      {
        phone: venue.phone,
        website: venue.website,
        googleMapsUrl: venue.googleMapsUri ? normalizeUrl(venue.googleMapsUri) : null,
        instagram: null,
      },
      context.leads,
    );
    if (matches.some((match) => match.confidence === "high")) return "duplicate";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Nachfilter + ehrlicher Trichter
// ---------------------------------------------------------------------------

function countStates(results: ScoutResult[]): Record<InstagramState, number> {
  const counts: Record<InstagramState, number> = { found: 0, choose: 0, none: 0, failed: 0 };
  for (const result of results) counts[instagramStateOf(result.instagramProfile)] += 1;
  return counts;
}

/** Website unbekannt = keine eigene gefunden UND die Websuche war nicht beantwortet. */
function websiteUnknown(result: ScoutResult): boolean {
  return !result.website.url && Boolean(result.website.searchFailed);
}

function applyPostFilters(scouted: ScoutResult[], options: LeadScoutOptions) {
  const stages: ScoutFunnelStage[] = [];
  let current = scouted;

  const step = (key: ScoutFunnelStage["key"], kind: ScoutFunnelStage["kind"], label: string, keep: (r: ScoutResult) => boolean) => {
    const next = current.filter(keep);
    const stage: ScoutFunnelStage = { key, kind, label, count: next.length, removed: current.length - next.length };
    if (key === "instagram") {
      const counts = countStates(next);
      stage.instagram = { found: counts.found, choose: counts.choose, failed: counts.failed };
    }
    stages.push(stage);
    current = next;
  };

  // "Unbekannt" ist nie "nein": fehlgeschlagene Suchen bleiben in BEIDEN
  // Richtungen sichtbar und werden hinten einsortiert.
  if (options.hasInstagramFilter === "yes") {
    step("instagram", "keep", "mit Instagram", (r) => instagramStateOf(r.instagramProfile) !== "none");
  } else if (options.hasInstagramFilter === "no") {
    step("instagram", "keep", "ohne Instagram", (r) => {
      const state = instagramStateOf(r.instagramProfile);
      return state === "none" || state === "failed";
    });
  }
  if (options.hasWebsiteFilter === "no") {
    step("website", "keep", "ohne eigene Website", (r) => !hasSolidWebsite(r.website.url));
  } else if (options.hasWebsiteFilter === "yes") {
    step("website", "keep", "mit eigener Website", (r) => hasSolidWebsite(r.website.url) || websiteUnknown(r));
  }
  if (options.hideChains) {
    step("chain", "remove", "Ketten", (r) => !r.chain?.suspected);
  }
  if (options.hasPhoneFilter === "yes") step("phone", "keep", "mit Telefon", (r) => Boolean(r.contacts.phone));
  if (options.hasPhoneFilter === "no") step("phone", "keep", "ohne Telefon", (r) => !r.contacts.phone);
  if (options.onlyNew) {
    step("new", "keep", "neu", (r) => r.duplicate.status !== "fail");
  }

  return { results: current, stages };
}

function uncertainty(result: ScoutResult, options: LeadScoutOptions): number {
  let score = 0;
  if (options.hasInstagramFilter && options.hasInstagramFilter !== "all" && instagramStateOf(result.instagramProfile) === "failed") score += 1;
  if (options.hasWebsiteFilter && options.hasWebsiteFilter !== "all" && websiteUnknown(result)) score += 1;
  return score;
}

function sortResults(results: ScoutResult[], options: LeadScoutOptions) {
  results.sort((a, b) => {
    const uncertain = uncertainty(a, options) - uncertainty(b, options);
    if (uncertain !== 0) return uncertain;

    if (options.sortBy === "distance") {
      const aDist = a.distanceKm ?? Infinity;
      const bDist = b.distanceKm ?? Infinity;
      if (aDist !== bDist) return aDist - bDist;
      return (b.venue.rating ?? 0) - (a.venue.rating ?? 0);
    }

    const aHasSite = hasSolidWebsite(a.website.url) ? 1 : 0;
    const bHasSite = hasSolidWebsite(b.website.url) ? 1 : 0;
    if (aHasSite !== bHasSite) return aHasSite - bHasSite;
    return (b.venue.rating ?? 0) - (a.venue.rating ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

type SearchCursor = { search: ScoutCategorySearch; nextPageToken: string | null; done: boolean };

const CONCURRENCY = 5;

/**
 * Scout-Lauf mit harter Obergrenze (SCOUT_LIMITS):
 *  - hoechstens 40 gepruefte Betriebe,
 *  - hoechstens 3 Places-Listenaufrufe (Folgeseiten und "Alle" eingeschlossen),
 *  - nach 45 s startet kein neuer Pruef-Block mehr.
 *
 * Gefiltert wird NACH dem Pruefen, und es wird nachgeprueft, bis genug
 * Treffer die Filter bestehen oder ein Limit greift. Ein erschoepftes
 * Budget wird in `budget` gemeldet, nicht verschwiegen.
 */
export async function runLeadScout(rawOptions: LeadScoutOptions, userId: string): Promise<LeadScoutResponse> {
  const startedAt = Date.now();
  const deadline = startedAt + SCOUT_LIMITS.timeBudgetMs;
  const target = clampMaxResults(rawOptions.maxResults);
  const options: LeadScoutOptions = { ...rawOptions, maxResults: target };

  const area = resolveArea(options);
  const searches = categorySearchesFor(options.category);
  const placesBudget = new PlacesCallBudget(SCOUT_LIMITS.maxPlacesListCalls);
  const notices: string[] = [];
  let error: string | undefined;
  let url = "";

  const seen = new Set<string>();
  const pool: Candidate[] = [];
  const queue: Candidate[] = [];
  const addCandidates = (venues: TreatwellVenue[], search: ScoutCategorySearch) => {
    for (const venue of venues) {
      if (seen.has(venue.key)) continue;
      seen.add(venue.key);
      const candidate = { venue, search };
      pool.push(candidate);
      queue.push(candidate);
    }
  };

  const cursors: SearchCursor[] = [];
  const fetchCursor = async (cursor: SearchCursor): Promise<TreatwellVenue[]> => {
    const page = await fetchPlacesPage(cursor.search, area, placesBudget, cursor.nextPageToken ?? undefined);
    if (!page.ok) {
      notices.push(page.reason);
      cursor.done = true;
      return [];
    }
    const venues = page.places.map((raw) => rawToVenue(raw, options.city));
    cursor.nextPageToken = page.nextPageToken;
    cursor.done = !page.nextPageToken;
    // DISTANCE-Ranking: liegt schon diese Seite teils ausserhalb des Umkreises,
    // liegt jede Folgeseite komplett draussen — also nicht weiter blaettern.
    if (area.mode === "radius" && venues.some((venue) => (distanceFromBase(venue, area) ?? 0) > area.radiusKm)) {
      cursor.done = true;
    }
    return venues;
  };

  const startPlaces = async () => {
    const fresh = searches.map((search) => ({ search, nextPageToken: null, done: false }) as SearchCursor);
    cursors.push(...fresh);
    const pages = await Promise.all(fresh.map((cursor) => fetchCursor(cursor)));
    // Reissverschluss statt Aneinanderhaengen: bei "Alle" wechseln sich die
    // Branchen ab, statt dass 20 Friseure das Pruefbudget aufbrauchen.
    const longest = Math.max(0, ...pages.map((page) => page.length));
    for (let index = 0; index < longest; index++) {
      pages.forEach((page, searchIndex) => {
        if (page[index]) addCandidates([page[index]], fresh[searchIndex].search);
      });
    }
    url = mapsSearchUrl(searches, area);
    if (pool.length === 0 && notices.length > 0) error = notices.join(" ");
  };

  // Umkreis geht nur ueber Places — Treatwell kennt keine Koordinaten, und
  // ein Places-Abgleich pro Treatwell-Betrieb waere der teuerste Weg dorthin.
  const usePlaces = options.source === "places" || area.mode === "radius";

  if (usePlaces) {
    if (!isPlacesConfigured()) error = "Google-Places-Suche nicht verfügbar (API-Key fehlt).";
    else await startPlaces();
  } else {
    const result = await searchTreatwell(options.category, options.city);
    addCandidates(result.venues, searches[0]);
    url = result.url;
    error = result.error;

    // Treatwell leer (Block, falsche URL, keine Eintraege) -> Places-Fallback,
    // jetzt ebenfalls getypt und im selben Budget.
    if (pool.length === 0 && isPlacesConfigured()) {
      await startPlaces();
      if (pool.length > 0) error = undefined;
    }
  }

  const leads = await prisma.lead.findMany({
    where: { OR: [{ createdById: userId }, { assignedToId: userId }] },
  });

  const context: ScoutContext = {
    options,
    leads,
    chain: buildChainContext(pool.map((candidate) => candidate.venue), options.city),
  };

  const prefiltered: Partial<Record<PrefilterReason, number>> = {};
  const scouted: ScoutResult[] = [];
  let passing = 0;
  let stoppedBy: ScoutBudget["stoppedBy"] = "no-more-candidates";

  for (;;) {
    if (passing >= target) { stoppedBy = "target"; break; }
    if (scouted.length >= SCOUT_LIMITS.maxScoutedVenues) { stoppedBy = "venues"; break; }
    if (Date.now() >= deadline) { stoppedBy = "time"; break; }

    const room = Math.min(CONCURRENCY, SCOUT_LIMITS.maxScoutedVenues - scouted.length);
    const batch: Candidate[] = [];
    while (batch.length < room && queue.length > 0) {
      const next = queue.shift()!;
      const reason = prefilterReason(next, options, context, area);
      if (reason) {
        prefiltered[reason] = (prefiltered[reason] ?? 0) + 1;
        continue;
      }
      batch.push(next);
    }

    if (batch.length === 0) {
      const cursor = cursors.find((entry) => !entry.done && entry.nextPageToken);
      if (!cursor) { stoppedBy = "no-more-candidates"; break; }
      if (placesBudget.remaining === 0) { stoppedBy = "places-calls"; break; }
      addCandidates(await fetchCursor(cursor), cursor.search);
      context.chain = buildChainContext(pool.map((candidate) => candidate.venue), options.city);
      continue;
    }

    const results = await Promise.all(batch.map((candidate) => scoutVenue(candidate, context)));
    scouted.push(...results);
    passing = applyPostFilters(scouted, options).results.length;
  }

  // Kettenverdacht mit dem ENDGUELTIGEN Pool neu bewerten — spaetere Seiten
  // koennen weitere Filialen desselben Namens geliefert haben.
  const finalChain = buildChainContext(pool.map((candidate) => candidate.venue), options.city);
  const rescored = scouted.map((result) => ({
    ...result,
    chain: detectChain({ name: result.venue.name, website: result.website.url }, finalChain),
  }));

  const { results: finalResults, stages } = applyPostFilters(rescored, options);
  sortResults(finalResults, options);

  const prefilterTotal = Object.values(prefiltered).reduce((sum, count) => sum + (count ?? 0), 0);
  const funnel: ScoutFunnel = {
    found: pool.length,
    prefiltered: { total: prefilterTotal, byReason: prefiltered },
    scouted: scouted.length,
    stages,
    final: finalResults.length,
    instagram: countStates(rescored),
  };

  const budget: ScoutBudget = {
    scouted: scouted.length,
    maxScouted: SCOUT_LIMITS.maxScoutedVenues,
    placesCalls: placesBudget.used,
    maxPlacesCalls: SCOUT_LIMITS.maxPlacesListCalls,
    elapsedMs: Date.now() - startedAt,
    timeBudgetMs: SCOUT_LIMITS.timeBudgetMs,
    target,
    stoppedBy,
    exhausted: finalResults.length < target && (stoppedBy === "venues" || stoppedBy === "places-calls" || stoppedBy === "time"),
  };

  const radiusApplied: ScoutRadiusKm | null = area.mode === "radius" ? (area.radiusKm as ScoutRadiusKm) : null;

  // Session speichern. Scheitert das, ist der (bezahlte) Lauf trotzdem nicht
  // verloren — die Ergebnisse gehen mit Hinweis an die Oberflaeche.
  let sessionId: string | undefined;
  try {
    let dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { id: userId, email: "scout@scaleevo.at", displayName: "Scout User" },
      });
    }

    const session = await prisma.scoutSession.create({
      data: {
        name: radiusApplied ? `${options.category} · ${radiusApplied} km um Standort` : `${options.category} in ${options.city}`,
        searchQuery: options.category,
        city: options.city,
        radiusKm: radiusApplied,
        filters: JSON.parse(JSON.stringify({ ...options, funnel, budget, notices, sourceUrl: url })),
        resultCount: finalResults.length,
        createdById: dbUser.id,
        results: {
          create: finalResults.map((r) => ({
            companyName: r.venue.name,
            address: r.leadDraft.address,
            city: r.leadDraft.city,
            phone: r.contacts.phone,
            website: r.website.url,
            googleMapsUrl: r.leadDraft.googleMapsUrl,
            googleRating: r.venue.rating,
            reviewCount: r.venue.reviewCount,
            industry: r.leadDraft.industry,
            hasTreatwell: Boolean(r.venue.treatwellUrl),
            instagramHandle: r.instagramProfile.handle,
            // Snapshot-Daten bewusst NICHT persistieren: sie werden beim Laden
            // frisch aus dem Cache gelesen, sonst zeigte die Session veraltete Werte.
            rawData: JSON.parse(JSON.stringify({ ...r, instagramInsight: undefined })),
          })),
        },
      },
    });
    sessionId = session.id;
  } catch (persistError) {
    console.error("[lead-scout] Session konnte nicht gespeichert werden:", persistError);
    notices.push("Suchlauf konnte nicht gespeichert werden — die Ergebnisse unten sind nur in dieser Ansicht verfügbar.");
  }

  const withInsights = await attachInstagramInsights(finalResults, userId, leads);
  if (withInsights.notice) notices.push(withInsights.notice);

  return {
    sessionId,
    sourceUrl: url,
    totalFound: pool.length,
    results: withInsights.results,
    treatsWellError: error,
    notices,
    funnel,
    budget,
    radiusApplied,
    placesConfigured: isPlacesConfigured(),
  };
}
