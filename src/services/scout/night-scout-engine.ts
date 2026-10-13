import { prisma } from "@/lib/prisma";
import { leadScopeForUserId } from "@/lib/workspace";
import { findDuplicates, type DuplicateCandidate } from "@/services/dedup";
import { calculateBestVisitSlot, type PopularTimeSlot } from "./popular-times";
import { normalizeUrl } from "@/lib/utils";

export type NightScoutOptions = {
  districts?: string[];
  category?: string;
  targetCount?: number;
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

export type NightScoutState = {
  running: boolean;
  sessionId?: string;
  step: string;
  progress: number;
  stats?: NightScoutFunnelStats;
  leads?: NightLeadItem[];
  allLeads?: NightLeadItem[];
  error?: string;
};

let globalNightScoutState: NightScoutState = {
  running: false,
  step: "Bereit",
  progress: 0,
};

export function getNightScoutState(): NightScoutState {
  return { ...globalNightScoutState };
}

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
 * Schneller, asynchroner Website-Check mit hartem 3.5s Timeout.
 * Erkennt fehlende Viewports, altes Copyright und Baukasten-Header ohne Blockaden.
 */
async function fastWebsiteAudit(rawUrl: string): Promise<{
  reachable: boolean;
  hasMobileIssue: boolean;
  hasSslIssue: boolean;
  isOldCopyright: boolean;
  isOldCms: boolean;
  issueCount: number;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const targetUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    }).catch(() => null);

    clearTimeout(timer);
    if (!res) {
      return { reachable: false, hasMobileIssue: true, hasSslIssue: true, isOldCopyright: false, isOldCms: false, issueCount: 2 };
    }

    const html = (await res.text().catch(() => "")).slice(0, 50000); // Erste 50KB reichen völlig
    const headers = Object.fromEntries(res.headers.entries());

    const hasMobileIssue = !html.includes("viewport") || !html.includes("width=device-width");
    const hasSslIssue = !targetUrl.startsWith("https://") || !headers["strict-transport-security"];

    const copyrightMatch = html.match(/©|copyright|all rights reserved/i);
    let isOldCopyright = false;
    if (copyrightMatch && copyrightMatch.index !== undefined) {
      const surrounding = html.slice(Math.max(0, copyrightMatch.index - 50), copyrightMatch.index + 50);
      if (surrounding.match(/20(1[0-9]|2[0-1])/)) {
        isOldCopyright = true;
      }
    }

    const isOldCms =
      html.includes("/wp-content/") ||
      html.includes("joomla") ||
      html.includes("typo3") ||
      Boolean(headers["x-powered-by"]?.toLowerCase().includes("php"));

    const issueCount =
      (hasMobileIssue ? 1 : 0) + (hasSslIssue ? 1 : 0) + (isOldCopyright ? 1 : 0) + (isOldCms ? 1 : 0);

    return { reachable: true, hasMobileIssue, hasSslIssue, isOldCopyright, isOldCms, issueCount };
  } catch {
    return { reachable: false, hasMobileIssue: true, hasSslIssue: true, isOldCopyright: false, isOldCms: false, issueCount: 2 };
  }
}

/**
 * Startet die Pipeline asynchron im Hintergrund. Gibt sofort true zurück.
 */
export async function startNightScoutPipeline(
  options: NightScoutOptions,
  userId: string
): Promise<boolean> {
  if (globalNightScoutState.running) {
    return false;
  }

  globalNightScoutState = {
    running: true,
    step: "Initialisiere Trichter...",
    progress: 5,
  };

  // Run in background without blocking caller
  (async () => {
    try {
      const districts =
        options.districts && options.districts.length > 0
          ? options.districts
          : ["1010 Wien", "1070 Wien", "1020 Wien"];
      const category = options.category || "Gastronomie";
      const targetCount = options.targetCount || 50;

      // 1. Duplikat-Check Setup
      globalNightScoutState.step = "Lade bestehenden CRM-Bestand...";
      globalNightScoutState.progress = 15;

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

      const previousResults = await prisma.scoutResult.findMany({
        select: { companyName: true, website: true, phone: true },
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
      globalNightScoutState.step = `Sammle Betriebe aus ${districts.length} Bezirken...`;
      globalNightScoutState.progress = 30;

      let rawCandidates: any[] = [];
      const DISTRICT_BATCH = 6;
      for (let i = 0; i < districts.length; i += DISTRICT_BATCH) {
        const batch = districts.slice(i, i + DISTRICT_BATCH);
        const results = await Promise.all(
          batch.map((district) => fetchPlacesForQuery(`${category} in ${district}`, 20))
        );
        for (const list of results) {
          rawCandidates.push(...list);
        }
      }

      const totalRawFound = rawCandidates.length;
      let droppedDuplicates = 0;
      let droppedModernWebsites = 0;
      let droppedInactiveSocial = 0;

      // 3. Stage 1: Duplikate filtern
      globalNightScoutState.step = "Prüfe Duplikate & bestehende Leads...";
      globalNightScoutState.progress = 50;

      const eligibleCandidates: any[] = [];
      for (const place of rawCandidates) {
        const name = place.displayName?.text || "";
        const address = place.formattedAddress || "";
        const phone = place.internationalPhoneNumber || null;
        const website = place.websiteUri || null;

        if (!name) continue;

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

        eligibleCandidates.push(place);
      }

      // 4. Stage 2: Schnelle parallele Website & Tech-Prüfung (Chunks von 6)
      globalNightScoutState.step = `Analysiere Websites & Mängel für ${eligibleCandidates.length} Betriebe...`;
      globalNightScoutState.progress = 70;

      const filteredCandidates: NightLeadItem[] = [];
      const allScoutedLeads: NightLeadItem[] = [];
      const CHUNK_SIZE = 6;

      for (let i = 0; i < eligibleCandidates.length; i += CHUNK_SIZE) {
        const chunk = eligibleCandidates.slice(i, i + CHUNK_SIZE);
        const audits = await Promise.all(
          chunk.map(async (place) => {
            const name = place.displayName?.text || "";
            const address = place.formattedAddress || "";
            const phone = place.internationalPhoneNumber || null;
            const website = place.websiteUri || null;
            const googleRating = place.rating || null;
            const reviewCount = place.userRatingCount || null;
            const googleMapsUrl = place.googleMapsUri || null;
            const types: string[] = place.types || [];

            let walkInScore = 40;
            const reasons: string[] = [];
            let websiteStatus: "missing" | "outdated" | "unsecure" | "ok" = "ok";
            let isModern = false;

            if (!website) {
              walkInScore += 35;
              websiteStatus = "missing";
              reasons.push("Keine Website vorhanden (Exzellenter Walk-In Hebel)");
            } else {
              const audit = await fastWebsiteAudit(website);
              if (audit.hasMobileIssue || audit.hasSslIssue || audit.isOldCopyright || audit.isOldCms || audit.issueCount >= 2) {
                walkInScore += 25;
                websiteStatus = audit.isOldCopyright ? "outdated" : "unsecure";
                if (audit.hasMobileIssue) reasons.push("Website nicht mobile-optimiert");
                if (audit.isOldCopyright) reasons.push("Veraltetes Website-Copyright");
                if (audit.hasSslIssue) reasons.push("Sicherheits- / SSL-Probleme");
                if (audit.isOldCms) reasons.push("Altes CMS / Baukasten");
              } else if (audit.issueCount === 0 && (googleRating || 0) < 4.2) {
                isModern = true;
                reasons.push("Moderne Website vorhanden");
              }
            }

            // Social & Linktree Check
            let hasInstagram = false;
            let instagramHandle: string | null = null;
            if (website && (website.includes("instagram.com") || website.includes("linktr.ee"))) {
              hasInstagram = true;
              walkInScore += 30;
              reasons.push("Nutzt Linktree/Instagram als Website-Ersatz");
            } else if (googleRating && googleRating >= 4.0 && reviewCount && reviewCount >= 15) {
              walkInScore += 15;
              reasons.push(`${reviewCount} Google-Bewertungen (${googleRating}★)`);
            }

            // Popular Times Walk-In Zeitfenster
            const bestVisitTime = calculateBestVisitSlot(category, types);

            return {
              isModern,
              item: {
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
              } as NightLeadItem,
            };
          })
        );

        for (const res of audits) {
          if (res.item) {
            allScoutedLeads.push(res.item);
            if (res.isModern) {
              droppedModernWebsites++;
            } else {
              filteredCandidates.push(res.item);
            }
          }
        }
      }

      // 5. Ranking & Speichern
      globalNightScoutState.step = "Berechne beste Besuchszeiten & erstelle Ranking...";
      globalNightScoutState.progress = 90;

      filteredCandidates.sort((a, b) => b.walkInScore - a.walkInScore);
      const topLeads = filteredCandidates.slice(0, targetCount);

      const stats: NightScoutFunnelStats = {
        totalRawFound,
        droppedDuplicates,
        droppedModernWebsites,
        droppedInactiveSocial,
        topHotLeads: topLeads.length,
      };

      const session = await prisma.scoutSession.create({
        data: {
          name: `Night Scout: ${districts.slice(0, 2).join(", ")} (${new Date().toLocaleDateString("de-AT")})`,
          searchQuery: `Night Scout Funnel: ${category}`,
          city: "Wien",
          filters: {
            districts,
            category,
            funnel: stats,
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

      globalNightScoutState = {
        running: false,
        sessionId: session.id,
        step: "Fertig",
        progress: 100,
        stats,
        leads: topLeads,
        allLeads: allScoutedLeads,
      };
    } catch (err) {
      console.error("[NightScout] Background runner error:", err);
      globalNightScoutState = {
        running: false,
        step: "Fehler aufgetreten",
        progress: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  return true;
}
