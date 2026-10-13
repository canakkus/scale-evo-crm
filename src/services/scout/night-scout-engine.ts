import { prisma } from "@/lib/prisma";
import { leadScopeForUserId } from "@/lib/workspace";
import { findDuplicates, type DuplicateCandidate } from "@/services/dedup";
import { runSecurityAudit } from "@/services/audit/security-audit";
import { calculateBestVisitSlot, type PopularTimeSlot } from "./popular-times";
import { normalizeInstagramHandle, normalizeUrl } from "@/lib/utils";

export type NightScoutOptions = {
  districts?: string[]; // z.B. ["1010 Wien", "1070 Wien", "1090 Wien"]
  category?: string; // "Gastronomie" | "Beauty" | "Alle"
  targetCount?: number; // Standard: 50
  maxRawFetch?: number; // Standard: 200 pro Bezirk
};

export type NightScoutFunnelStats = {
  totalRawFound: number;
  droppedDuplicates: number;
  droppedModernWebsites: number;
  droppedInactiveSocial: number;
  topHotLeads: number;
};

export type NightLeadItem = {
  companyName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  walkInScore: number;
  opportunityReasons: string[];
  bestVisitTime: PopularTimeSlot;
  websiteStatus: "missing" | "outdated" | "unsecure" | "ok";
};

const VIENNA_DISTRICTS = [
  "1010 Wien", "1020 Wien", "1030 Wien", "1040 Wien", "1050 Wien",
  "1060 Wien", "1070 Wien", "1080 Wien", "1090 Wien", "1100 Wien",
  "1110 Wien", "1120 Wien", "1130 Wien", "1140 Wien", "1150 Wien",
  "1160 Wien", "1170 Wien", "1180 Wien", "1190 Wien", "1200 Wien",
  "1210 Wien", "1220 Wien", "1230 Wien",
];

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK =
  "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName,places.location";

async function fetchPlacesForQuery(query: string, maxResults: number = 20) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: "AT",
        pageSize: Math.min(20, maxResults),
      }),
      cache: "no-store",
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.places || [];
  } catch (err) {
    console.error("[NightScout] Places API error:", err);
    return [];
  }
}

/**
 * Führt den vollständigen mehrstufigen Trichter des Night Scouts aus.
 */
export async function runNightScoutPipeline(
  options: NightScoutOptions,
  userId: string
): Promise<{
  sessionId: string;
  stats: NightScoutFunnelStats;
  leads: NightLeadItem[];
}> {
  const districts = options.districts && options.districts.length > 0 ? options.districts : ["1010 Wien", "1070 Wien", "1020 Wien"];
  const category = options.category || "Gastronomie";
  const targetCount = options.targetCount || 50;

  // 1. Lade bestehende Leads für Duplikat-Filter
  const scope = await leadScopeForUserId(userId);
  const existingLeads = await prisma.lead.findMany({
    where: scope,
    select: {
      id: true,
      companyName: true,
      website: true,
      phone: true,
      email: true,
      instagram: true,
      address: true,
      city: true,
      googleMapsUrl: true,
      treatwellUrl: true,
    },
  });

  // Lade bereits gescannte Domains & Telefone aus früheren Scout-Sessions
  const previousResults = await prisma.scoutResult.findMany({
    select: {
      companyName: true,
      website: true,
      phone: true,
    },
    take: 2000,
  });

  const knownWebsites = new Set<string>();
  const knownPhones = new Set<string>();

  for (const l of existingLeads) {
    if (l.website) {
      const u = normalizeUrl(l.website);
      if (u) knownWebsites.add(u);
    }
    if (l.phone) knownPhones.add(l.phone.replace(/[^0-9]/g, ""));
  }
  for (const r of previousResults) {
    if (r.website) {
      const u = normalizeUrl(r.website);
      if (u) knownWebsites.add(u);
    }
    if (r.phone) knownPhones.add(r.phone.replace(/[^0-9]/g, ""));
  }

  // 2. Stage 0: Mass Gathering (Places API)
  let rawCandidates: any[] = [];
  for (const district of districts) {
    const query = `${category} in ${district}`;
    const places = await fetchPlacesForQuery(query, 20);
    rawCandidates.push(...places);
  }

  const totalRawFound = rawCandidates.length;
  let droppedDuplicates = 0;
  let droppedModernWebsites = 0;
  let droppedInactiveSocial = 0;

  const filteredCandidates: NightLeadItem[] = [];

  for (const place of rawCandidates) {
    const name = place.displayName?.text || "";
    const address = place.formattedAddress || "";
    const phone = place.internationalPhoneNumber || null;
    const website = place.websiteUri || null;
    const googleRating = place.rating || null;
    const reviewCount = place.userRatingCount || null;
    const googleMapsUrl = place.googleMapsUri || null;
    const types: string[] = place.types || [];

    if (!name) continue;

    // Filter 1: Duplikat & Archiv
    const normWeb = website ? normalizeUrl(website) : null;
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, "") : null;

    if (normWeb && knownWebsites.has(normWeb)) {
      droppedDuplicates++;
      continue;
    }
    if (cleanPhone && cleanPhone.length > 5 && knownPhones.has(cleanPhone)) {
      droppedDuplicates++;
      continue;
    }

    const dupCheck = findDuplicates(
      { companyName: name, website: normWeb, phone, address },
      existingLeads as DuplicateCandidate[]
    );
    if (dupCheck.some((d) => d.confidence === "high" || d.score >= 0.85)) {
      droppedDuplicates++;
      continue;
    }

    // Filter 2: Website & Tech-Audit Heuristik
    let walkInScore = 40; // Basis
    const reasons: string[] = [];
    let websiteStatus: "missing" | "outdated" | "unsecure" | "ok" = "ok";

    if (!website) {
      walkInScore += 35;
      websiteStatus = "missing";
      reasons.push("Keine Website vorhanden (Exzellenter Walk-In Hebel)");
    } else {
      // Passive Audit Prüfung
      const audit = await runSecurityAudit(website).catch(() => null);
      if (audit) {
        const hasMobileIssue = audit.issues.some((i) => i.code === "no-viewport");
        const hasSslIssue = audit.issues.some((i) => i.code === "no-https" || i.code === "mixed-content");
        const isOldCopyright = audit.issues.some((i) => i.code === "outdated-copyright");
        const isOldCms = audit.issues.some((i) => i.code.includes("wordpress") || i.code.includes("php"));

        if (hasMobileIssue || hasSslIssue || isOldCopyright || isOldCms || audit.issues.length >= 3) {
          walkInScore += 25;
          websiteStatus = isOldCopyright ? "outdated" : "unsecure";
          if (hasMobileIssue) reasons.push("Website nicht mobile-optimiert");
          if (isOldCopyright) reasons.push("Veraltetes Website-Copyright");
          if (hasSslIssue) reasons.push("Sicherheits- / SSL-Probleme");
          if (isOldCms) reasons.push("Altes CMS / Baukasten");
        } else if (audit.issues.length === 0 && (googleRating || 0) < 4.2) {
          // Perfekte moderne Website
          droppedModernWebsites++;
          continue;
        }
      }
    }

    // Filter 3: Social Media & Instagram Indikator
    const hasSocialLink = types.some((t) => t.includes("food") || t.includes("barber") || t.includes("hair"));
    let hasInstagram = false;
    let instagramHandle: string | null = null;

    // Erkennung von Social-Präsenz (z. B. wenn Website auf Linktree/Instagram verlinkt)
    if (website && (website.includes("instagram.com") || website.includes("linktr.ee"))) {
      hasInstagram = true;
      walkInScore += 30;
      reasons.push("Nutzt Linktree/Instagram als Website-Ersatz");
    } else if (googleRating && googleRating >= 4.0 && reviewCount && reviewCount >= 15) {
      // Betrieb hat Kunden, ist aktiv
      walkInScore += 15;
      reasons.push(`${reviewCount} Google-Bewertungen (${googleRating}★)`);
    }

    // Filter 4: Google Popular Times & Walk-In Zeitfenster
    const bestVisitTime = calculateBestVisitSlot(category, types);

    filteredCandidates.push({
      companyName: name,
      address,
      city: "Wien",
      phone,
      website,
      industry: category,
      googleMapsUrl,
      googleRating,
      reviewCount,
      hasInstagram,
      instagramHandle,
      walkInScore: Math.min(100, walkInScore),
      opportunityReasons: reasons,
      bestVisitTime,
      websiteStatus,
    });
  }

  // 3. Sortierung nach Walk-In Score & Top Auswahl
  filteredCandidates.sort((a, b) => b.walkInScore - a.walkInScore);
  const topLeads = filteredCandidates.slice(0, targetCount);

  // 4. In Prisma als ScoutSession persistieren
  const session = await prisma.scoutSession.create({
    data: {
      name: `Night Scout: ${districts.slice(0, 2).join(", ")} (${new Date().toLocaleDateString("de-AT")})`,
      searchQuery: `Night Scout Funnel: ${category}`,
      city: "Wien",
      filters: {
        districts,
        category,
        funnel: {
          totalRawFound,
          droppedDuplicates,
          droppedModernWebsites,
          droppedInactiveSocial,
          topHotLeads: topLeads.length,
        },
      },
      resultCount: topLeads.length,
      createdById: userId,
      results: {
        create: topLeads.map((item) => ({
          companyName: item.companyName,
          address: item.address,
          city: item.city,
          phone: item.phone,
          website: item.website,
          googleMapsUrl: item.googleMapsUrl,
          googleRating: item.googleRating,
          reviewCount: item.reviewCount,
          industry: item.industry,
          rawData: {
            walkInScore: item.walkInScore,
            opportunityReasons: item.opportunityReasons,
            bestVisitTime: item.bestVisitTime,
            websiteStatus: item.websiteStatus,
            hasInstagram: item.hasInstagram,
          },
        })),
      },
    },
  });

  return {
    sessionId: session.id,
    stats: {
      totalRawFound,
      droppedDuplicates,
      droppedModernWebsites,
      droppedInactiveSocial,
      topHotLeads: topLeads.length,
    },
    leads: topLeads,
  };
}
