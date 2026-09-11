import { WebPresence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapPlaceToSuggestion, type PlaceSuggestion, type RawPlace } from "@/lib/places";
import { normalizePhone, normalizeUrl } from "@/lib/utils";
import {
  type LeadScoutOptions,
  type LeadScoutResponse,
  type ScoutResult,
  type TreatwellVenue,
} from "@/lib/lead-scout-types";
import { findDuplicates } from "./dedup";
import { searchTreatwell } from "./treatwell";
import { searchFirstExternalUrl } from "./web-search";
import { WebsiteAuditProvider } from "./audit/website-provider";
import type { AuditResult } from "./audit/types";
import { calculateDistanceKm } from "@/lib/distance";

export type { LeadScoutOptions, LeadScoutResponse, ScoutResult, TreatwellVenue };

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName,places.location";

function mapsSearchUrl(category: string, city: string) {
  const query = category === "Alle" ? `Beauty Salon, Friseur, Restaurant, Cafe in ${city}` : `${category} in ${city}`;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

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
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        maxResultCount: 5,
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

async function searchRestaurantsViaPlaces(
  category: string,
  city: string,
  maxResults: number,
): Promise<PlaceSuggestion[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: category === "Alle" 
          ? `Beauty Salon, Friseur, Restaurant, Cafe in ${city}` 
          : `${category} in ${city}`,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        maxResultCount: Math.min(20, Math.max(1, maxResults)),
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

function placesToVenues(places: PlaceSuggestion[], city: string): TreatwellVenue[] {
  return places.map((place) => {
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
    };
  });
}

type LeadRow = Awaited<ReturnType<typeof prisma.lead.findMany>>[number];

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
      website: collected.website,
      googleMapsUrl: collected.googleMapsUrl,
      instagram: collected.instagram,
    },
    leads,
  );
}

async function scoutVenue(venue: TreatwellVenue, options: LeadScoutOptions, leads: LeadRow[]): Promise<ScoutResult> {
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
      industry: options.category,
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

  const isPlaceWebsiteTreatwell = place?.website ? /treatwell\.(at|de|com|ch|co\.uk)/i.test(place.website) : false;
  let websiteUrl: string | null = place?.website && !isPlaceWebsiteTreatwell ? normalizeUrl(place.website) : null;
  let websiteSource: "maps" | "search" | null = websiteUrl ? "maps" : null;

  if (!websiteUrl) {
    const found = await searchFirstExternalUrl(`${venue.name} ${options.city} website`, { venueName: venue.name });
    if (found) {
      if (/treatwell\.(at|de|com|ch|co\.uk)/i.test(found)) {
        if (!venue.treatwellUrl) {
          venue.treatwellUrl = normalizeUrl(found);
        }
      } else {
        websiteUrl = normalizeUrl(found);
        websiteSource = "search";
      }
    }
  }

  let audit: AuditResult | null = null;
  if (websiteUrl) {
    try {
      audit = await new WebsiteAuditProvider().analyze(websiteUrl);
    } catch {
      audit = null;
    }
  }

  // If audit or place revealed a Treatwell profile / booking link, capture it
  const detectedTreatwell =
    venue.treatwellUrl ||
    audit?.extracted?.treatwellUrl ||
    (isPlaceWebsiteTreatwell ? place?.website : null) ||
    null;

  if (detectedTreatwell) {
    venue.treatwellUrl = normalizeUrl(detectedTreatwell);
  }

  const phone = place?.phone ?? audit?.extracted.phone ?? null;
  const rawEmail = audit?.extracted.email ?? null;
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) ? rawEmail : null;
  const instagram = audit?.extracted.instagram ? normalizeUrl(audit.extracted.instagram) : null;

  const matches = findScoutDuplicates(
    venue,
    {
      phone,
      website: websiteUrl,
      googleMapsUrl: place?.googleMapsUri ? normalizeUrl(place.googleMapsUri) : null,
      instagram,
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
    hasWebsite
      ? `Website via ${websiteSource === "maps" ? "Google Maps" : "Websuche"} gefunden: ${websiteUrl}`
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
    website: { status: hasWebsite ? "ok" : "fail", url: websiteUrl, source: websiteSource },
    menu,
    audit,
    contacts: { phone, email, instagram },
    leadDraft: {
      companyName: venue.name,
      industry: options.category,
      address: place?.address ?? (venue.addressLine || null),
      city: place?.city ?? options.city,
      webPresence: hasWebsite
        ? WebPresence.WEBSITE
        : venue.treatwellUrl
          ? WebPresence.TREATWELL_ONLY
          : WebPresence.NONE,
      website: hasWebsite ? websiteUrl : null,
      treatwellUrl: normalizeUrl(venue.treatwellUrl),
      phone: normalizePhone(phone),
      email,
      instagram,
      googleMapsUrl: place?.googleMapsUri ? normalizeUrl(place.googleMapsUri) : null,
      googleRating: place?.rating ?? null,
      googleReviewCount: place?.reviewCount ?? null,
      source: venue.source === "places" ? "Google Places Lead-Scout" : "Treatwell Lead-Scout",
      notes,
    },
  };
}

export async function runLeadScout(options: LeadScoutOptions, userId: string): Promise<LeadScoutResponse> {
  const usePlaces = options.source === "places";
  let venues: TreatwellVenue[] = [];
  let url = "";
  let error: string | undefined;

  if (usePlaces) {
    const places = await searchRestaurantsViaPlaces(options.category, options.city, options.maxResults * 3);
    if (places === null) {
      error = "Google-Places-Suche nicht verfügbar (API-Key fehlt oder Fehler).";
    } else {
      venues = placesToVenues(places, options.city);
      url = mapsSearchUrl(options.category, options.city);
    }
  } else {
    const result = await searchTreatwell(options.category, options.city);
    venues = result.venues;
    url = result.url;
    error = result.error;

    // ── Google Places Fallback ──────────────────────────────────────────────
    // If Treatwell returns 0 results (blocked, wrong URL, or no listings),
    // automatically fall back to Google Places so the scout still finds leads.
    if (venues.length === 0) {
      const places = await searchRestaurantsViaPlaces(options.category, options.city, options.maxResults * 3);
      if (places && places.length > 0) {
        venues = placesToVenues(places, options.city);
        url = mapsSearchUrl(options.category, options.city);
        error = undefined; // Clear Treatwell error since Places succeeded
      }
    }
  }

  let filtered = venues.filter(
    (venue) => (venue.rating ?? 0) >= options.minRating && (venue.reviewCount ?? 0) >= options.minReviews,
  );

  // Apply optional website/treatwell/phone filters if specified
  if (options.hasTreatwellFilter === "yes") filtered = filtered.filter((v) => Boolean(v.treatwellUrl));
  if (options.hasTreatwellFilter === "no") filtered = filtered.filter((v) => !v.treatwellUrl);

  const selected = filtered.slice(0, options.maxResults);

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { createdById: userId },
        { assignedToId: userId },
      ],
    },
  });
  const CONCURRENCY = 10;
  const results: ScoutResult[] = [];
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const batch = selected.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map((venue) => scoutVenue(venue, options, leads)))));
  }

  let finalResults = results;
  if (options.hasWebsiteFilter === "no") finalResults = finalResults.filter((r) => !r.website.url);
  if (options.hasWebsiteFilter === "yes") finalResults = finalResults.filter((r) => Boolean(r.website.url));
  if (options.hasPhoneFilter === "yes") finalResults = finalResults.filter((r) => Boolean(r.contacts.phone));
  if (options.hasPhoneFilter === "no") finalResults = finalResults.filter((r) => !r.contacts.phone);
  if (options.hasInstagramFilter === "yes") finalResults = finalResults.filter((r) => Boolean(r.contacts.instagram));
  if (options.hasInstagramFilter === "no") finalResults = finalResults.filter((r) => !r.contacts.instagram);

  finalResults.sort((a, b) => {
    if (options.sortBy === "distance") {
      const aDist = a.distanceKm ?? Infinity;
      const bDist = b.distanceKm ?? Infinity;
      if (aDist !== bDist) return aDist - bDist;
      return (b.venue.rating ?? 0) - (a.venue.rating ?? 0);
    }

    const aHasSite = a.website.url ? 1 : 0;
    const bHasSite = b.website.url ? 1 : 0;
    if (aHasSite !== bHasSite) return aHasSite - bHasSite;
    return (b.venue.rating ?? 0) - (a.venue.rating ?? 0);
  });

  // Ensure DB User exists
  let dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: { id: userId, email: "scout@scaleevo.at", displayName: "Scout User" },
    });
  }

  // Persist Scout Session in DB so search runs are saved forever!
  const session = await prisma.scoutSession.create({
    data: {
      name: `${options.category} in ${options.city}`,
      searchQuery: options.category,
      city: options.city,
      radiusKm: null,
      filters: JSON.parse(JSON.stringify(options)),
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
          industry: options.category,
          hasTreatwell: Boolean(r.venue.treatwellUrl),
          rawData: JSON.parse(JSON.stringify(r)),
        })),
      },
    },
  });

  return {
    sessionId: session.id,
    sourceUrl: url,
    totalFound: venues.length,
    filteredCount: filtered.length,
    results: finalResults,
    treatsWellError: error,
    placesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
  };
}
