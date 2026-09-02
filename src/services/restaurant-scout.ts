import { prisma } from "@/lib/prisma";
import { mapPlaceToSuggestion, type PlaceSuggestion, type RawPlace } from "@/lib/places";
import { normalizePhone, normalizeUrl } from "@/lib/utils";
import { detectRestaurantMenu, type MenuDetectionResult } from "@/lib/menu-detector";
import { calculateDistanceKm } from "@/lib/distance";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName,places.location";

export interface RestaurantScoutOptions {
  location: string;
  cuisineType?: string;
  radiusKm?: number;
  maxResults?: number;
  filterNoMenuOnly?: boolean;
}

export interface RestaurantScoutLeadItem {
  id?: string;
  companyName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  industry: string;
  hasMenu: boolean;
  menuUrl: string | null;
  menuSnippet: string | null;
  menuCheckedAt: string | null;
  status: string;
  isExistingLead: boolean;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
}

export interface RestaurantScoutResponse {
  totalScouted: number;
  results: RestaurantScoutLeadItem[];
  sessionId?: string;
}

async function searchGooglePlaces(query: string, maxCount: number): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[RestaurantScout] GOOGLE_PLACES_API_KEY is not set.");
    return [];
  }

  try {
    const regionCode = process.env.GOOGLE_PLACES_REGION?.trim() || "AT";
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
        regionCode,
        maxResultCount: Math.min(20, Math.max(1, maxCount)),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[RestaurantScout] Google Places API failed with status:", response.status);
      return [];
    }

    const payload: { places?: RawPlace[] } = await response.json();
    return (payload.places ?? []).map(mapPlaceToSuggestion);
  } catch (err) {
    console.error("[RestaurantScout] Error querying Google Places:", err);
    return [];
  }
}

export async function runRestaurantScout(
  options: RestaurantScoutOptions,
  userId: string
): Promise<RestaurantScoutResponse> {
  const location = options.location.trim() || "Wien";
  const cuisine = options.cuisineType?.trim() || "";
  const maxResults = options.maxResults ? Math.min(30, Math.max(1, options.maxResults)) : 10;
  const filterNoMenuOnly = Boolean(options.filterNoMenuOnly);

  const query = cuisine
    ? `${cuisine} Restaurant in ${location}`
    : `Restaurant in ${location}`;

  // Step 1: Fetch Google Places
  const places = await searchGooglePlaces(query, maxResults * 2);

  // Step 2: Ensure user exists in DB
  let dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: { id: userId, email: "scout@scaleevo.at", displayName: "Restaurant Scout" },
    });
  }

  // Step 3: Run Menu Detection on candidates in batches of 5
  const BATCH_SIZE = 5;
  const menuResults: Map<string, MenuDetectionResult> = new Map();

  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const batch = places.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (place) => {
      const url = place.website ? normalizeUrl(place.website) : null;
      if (!url) {
        return { key: place.name, result: { hasMenu: false, menuUrl: null, menuSnippet: "Keine Website vorhanden" } };
      }
      const menu = await detectRestaurantMenu(url);
      return { key: place.name, result: menu };
    });

    const settled = await Promise.allSettled(batchPromises);
    settled.forEach((res) => {
      if (res.status === "fulfilled") {
        menuResults.set(res.value.key, res.value.result);
      }
    });
  }

  // Step 4: Persist or match Leads in Prisma
  const processedLeads: RestaurantScoutLeadItem[] = [];

  for (const place of places) {
    const menu = menuResults.get(place.name) || { hasMenu: false, menuUrl: null, menuSnippet: null };

    // If filtering for only restaurants WITHOUT menu, skip ones with menu
    if (filterNoMenuOnly && menu.hasMenu) {
      continue;
    }

    const normWeb = place.website ? normalizeUrl(place.website) : null;
    const normPhone = normalizePhone(place.phone);
    const normMaps = place.googleMapsUri ? normalizeUrl(place.googleMapsUri) : null;

    // Check if lead already exists in user's DB
    const existingLead = await prisma.lead.findFirst({
      where: {
        AND: [
          {
            OR: [
              { createdById: userId },
              { assignedToId: userId },
            ],
          },
          {
            OR: [
              ...(normMaps ? [{ googleMapsUrl: normMaps }] : []),
              ...(normPhone ? [{ phone: normPhone }] : []),
              {
                AND: [
                  { companyName: { equals: place.name, mode: "insensitive" as const } },
                  { city: { equals: place.city || location, mode: "insensitive" as const } },
                ],
              },
            ],
          },
        ],
      },
    });

    const now = new Date();

    const distKm = calculateDistanceKm(
      place.latitude != null && place.longitude != null
        ? { lat: place.latitude, lng: place.longitude }
        : null
    );

    if (existingLead) {
      // Update existing lead with latest menu info
      const updated = await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          hasMenu: menu.hasMenu,
          menuUrl: menu.menuUrl,
          menuSnippet: menu.menuSnippet,
          menuCheckedAt: now,
          ...(place.rating !== null && { googleRating: place.rating }),
          ...(place.reviewCount !== null && { googleReviewCount: place.reviewCount }),
        },
      });

      processedLeads.push({
        id: updated.id,
        companyName: updated.companyName,
        address: updated.address,
        city: updated.city,
        phone: updated.phone,
        website: updated.website,
        googleMapsUrl: updated.googleMapsUrl,
        googleRating: updated.googleRating,
        googleReviewCount: updated.googleReviewCount,
        industry: updated.industry || "Restaurant",
        hasMenu: updated.hasMenu ?? false,
        menuUrl: updated.menuUrl,
        menuSnippet: updated.menuSnippet,
        menuCheckedAt: updated.menuCheckedAt ? updated.menuCheckedAt.toISOString() : null,
        status: updated.status,
        isExistingLead: true,
        latitude: place.latitude,
        longitude: place.longitude,
        distanceKm: distKm,
      });
    } else {
      // Create new lead in CRM
      const created = await prisma.lead.create({
        data: {
          companyName: place.name,
          industry: "Restaurant",
          address: place.address || null,
          city: place.city || location,
          phone: normPhone,
          website: normWeb,
          googleMapsUrl: normMaps,
          googleRating: place.rating,
          googleReviewCount: place.reviewCount,
          source: "Restaurant-Scout",
          status: "NEW",
          hasMenu: menu.hasMenu,
          menuUrl: menu.menuUrl,
          menuSnippet: menu.menuSnippet,
          menuCheckedAt: now,
          createdById: dbUser.id,
        },
      });

      processedLeads.push({
        id: created.id,
        companyName: created.companyName,
        address: created.address,
        city: created.city,
        phone: created.phone,
        website: created.website,
        googleMapsUrl: created.googleMapsUrl,
        googleRating: created.googleRating,
        googleReviewCount: created.googleReviewCount,
        industry: created.industry || "Restaurant",
        hasMenu: created.hasMenu ?? false,
        menuUrl: created.menuUrl,
        menuSnippet: created.menuSnippet,
        menuCheckedAt: created.menuCheckedAt ? created.menuCheckedAt.toISOString() : null,
        status: created.status,
        isExistingLead: false,
        latitude: place.latitude,
        longitude: place.longitude,
        distanceKm: distKm,
      });
    }

    if (processedLeads.length >= maxResults) {
      break;
    }
  }

  // Create a ScoutSession log in DB
  const session = await prisma.scoutSession.create({
    data: {
      name: `Restaurant Scout: ${cuisine ? cuisine + " in " : ""}${location}`,
      searchQuery: query,
      city: location,
      radiusKm: options.radiusKm || null,
      filters: JSON.parse(JSON.stringify(options)),
      resultCount: processedLeads.length,
      createdById: dbUser.id,
      results: {
        create: processedLeads.map((r) => ({
          leadId: r.id || null,
          companyName: r.companyName,
          address: r.address,
          city: r.city,
          phone: r.phone,
          website: r.website,
          googleMapsUrl: r.googleMapsUrl,
          googleRating: r.googleRating,
          reviewCount: r.googleReviewCount,
          industry: "Restaurant",
          hasTreatwell: false,
          rawData: JSON.parse(JSON.stringify(r)),
        })),
      },
    },
  });

  return {
    sessionId: session.id,
    totalScouted: places.length,
    results: processedLeads,
  };
}
