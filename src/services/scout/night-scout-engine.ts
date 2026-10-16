import { prisma } from "@/lib/prisma";
import { leadScopeForUserId } from "@/lib/workspace";
import { findDuplicates, type DuplicateCandidate } from "@/services/dedup";
import { calculateBestVisitSlot, type PopularTimeSlot } from "./popular-times";
import { normalizeUrl } from "@/lib/utils";

export type NightScoutOptions = {
  districts?: string[];
  category?: string;
  targetCount?: number;
  runs?: number;
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
  currentRun?: number;
  totalRuns?: number;
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
  "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName," +
  "places.location,places.businessStatus,places.regularOpeningHours";

const SOCIAL_ONLY_HOSTS = [
  "instagram.com",
  "facebook.com",
  "linktr.ee",
  "beacons.ai",
  "msha.ke",
  "taplink.cc",
  "campsite.bio",
];

function parseSocialReplacement(rawUrl: string | null): {
  isSocialOnly: boolean;
  instagramHandle: string | null;
} {
  if (!rawUrl) return { isSocialOnly: false, instagramHandle: null };
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const isSocialOnly = SOCIAL_ONLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    let instagramHandle: string | null = null;

    if (host.includes("instagram.com")) {
      const firstSegment = url.pathname.split("/").filter(Boolean)[0];
      if (firstSegment && !["p", "reel", "explore", "stories", "share"].includes(firstSegment.toLowerCase())) {
        instagramHandle = `@${firstSegment}`;
      }
    }
    return { isSocialOnly, instagramHandle };
  } catch {
    return { isSocialOnly: false, instagramHandle: null };
  }
}

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
 * Schneller, asynchroner Website-Check mit hartem 3.5s Timeout (inkl. Body-Stream).
 * Erkennt fehlende Viewports, fehlendes HTTPS, altes Copyright und Legacy-Baukästen ohne HSTS/WP False-Positives.
 */
async function fastWebsiteAudit(rawUrl: string): Promise<{
  reachable: boolean;
  hasMobileIssue: boolean;
  hasSslIssue: boolean;
  isOldCopyright: boolean;
  isOldCms: boolean;
  issueCount: number;
  detectedIgHandle: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
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

    if (!res || !res.ok) {
      return {
        reachable: false,
        hasMobileIssue: false,
        hasSslIssue: false,
        isOldCopyright: false,
        isOldCms: false,
        issueCount: 1,
        detectedIgHandle: null,
      };
    }

    const html = (await res.text().catch(() => "")).slice(0, 50000); // Erste 50KB reichen völlig
    const lowerHtml = html.toLowerCase();

    // Echte HTTPS-Prüfung auf der finalen URL nach Redirects (ohne HSTS-Zwang)
    const finalUrl = res.url || targetUrl;
    const hasSslIssue = !finalUrl.toLowerCase().startsWith("https://");

    // Case-insensitiver Viewport-Check; leere SPA-Shells ohne <body>-Inhalt neutral werten
    const isSpaShell =
      html.length < 3500 &&
      (lowerHtml.includes('id="root"') || lowerHtml.includes('id="__next"') || lowerHtml.includes('id="app"'));
    const hasMobileIssue =
      !isSpaShell && (!lowerHtml.includes("viewport") || !lowerHtml.includes("width=device-width"));

    // Copyright-Check (2010 bis 2022 als veraltet werten)
    const copyrightRegex = /(?:©|&copy;|copyright|all rights reserved)[^<]{0,50}\b(201\d|202[0-2])\b/i;
    const isOldCopyright = copyrightRegex.test(html);

    // Echte Legacy-/Billig-Baukasten-Signale statt pauschalem WordPress/PHP
    const isOldCms =
      lowerHtml.includes("jimdo") ||
      lowerHtml.includes("ionos") ||
      lowerHtml.includes("1und1") ||
      lowerHtml.includes("strato") ||
      lowerHtml.includes("joomla") ||
      lowerHtml.includes("typo3") ||
      lowerHtml.includes("wp-content/themes/twenty1") ||
      lowerHtml.includes("generator\" content=\"microsoft frontpage");

    // Optional: Instagram-Link direkt auf der bestehenden Website erkennen
    const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
    const detectedIgHandle =
      igMatch && !["p", "reel", "explore", "stories", "share"].includes(igMatch[1].toLowerCase())
        ? `@${igMatch[1]}`
        : null;

    const issueCount =
      (hasMobileIssue ? 1 : 0) + (hasSslIssue ? 1 : 0) + (isOldCopyright ? 1 : 0) + (isOldCms ? 1 : 0);

    return {
      reachable: true,
      hasMobileIssue,
      hasSslIssue,
      isOldCopyright,
      isOldCms,
      issueCount,
      detectedIgHandle,
    };
  } catch {
    return {
      reachable: false,
      hasMobileIssue: false,
      hasSslIssue: false,
      isOldCopyright: false,
      isOldCms: false,
      issueCount: 1,
      detectedIgHandle: null,
    };
  } finally {
    clearTimeout(timer);
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
      const targetCount = options.targetCount || 30;
      const totalRuns = Math.max(1, Math.min(5, options.runs || 1));

      // 1. Duplikat-Check Setup
      globalNightScoutState.step = "Lade bestehenden CRM-Bestand...";
      globalNightScoutState.progress = 10;
      globalNightScoutState.currentRun = 1;
      globalNightScoutState.totalRuns = totalRuns;

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
        where: { session: { createdById: userId } },
        orderBy: { createdAt: "desc" },
        select: { companyName: true, website: true, phone: true },
        take: 2000,
      });

      const knownWebsites = new Set<string>();
      const knownPhones = new Set<string>();
      const deduplicationPool: DuplicateCandidate[] = [...(existingLeads as DuplicateCandidate[])];

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

      // Partition districts across the requested runs
      const districtChunks: string[][] = [];
      const chunkSize = Math.max(1, Math.ceil(districts.length / totalRuns));
      for (let r = 0; r < totalRuns; r++) {
        const slice = districts.slice(r * chunkSize, (r + 1) * chunkSize);
        if (slice.length > 0) {
          districtChunks.push(slice);
        }
      }
      if (districtChunks.length === 0) {
        districtChunks.push(districts);
      }
      const actualRuns = districtChunks.length;

      let totalRawFound = 0;
      let droppedDuplicates = 0;
      let droppedModernWebsites = 0;
      let droppedInactiveSocial = 0;

      const allScoutedLeads: NightLeadItem[] = [];
      const filteredCandidates: NightLeadItem[] = [];

      for (let runIdx = 0; runIdx < actualRuns; runIdx++) {
        const runDistricts = districtChunks[runIdx];
        const runNum = runIdx + 1;
        const baseProgress = Math.round((runIdx / actualRuns) * 85);

        globalNightScoutState.currentRun = runNum;
        globalNightScoutState.totalRuns = actualRuns;
        globalNightScoutState.step =
          actualRuns > 1
            ? `Run ${runNum}/${actualRuns}: Sammle Betriebe aus ${runDistricts.length} Bezirken...`
            : `Sammle Betriebe aus ${runDistricts.length} Bezirken...`;
        globalNightScoutState.progress = Math.max(15, baseProgress + 5);

        let rawCandidates: any[] = [];
        const DISTRICT_BATCH = 6;
        for (let i = 0; i < runDistricts.length; i += DISTRICT_BATCH) {
          const batch = runDistricts.slice(i, i + DISTRICT_BATCH);
          const results = await Promise.all(
            batch.map((district) => fetchPlacesForQuery(`${category} in ${district}`, 20))
          );
          for (const list of results) {
            rawCandidates.push(...list);
          }
        }

        totalRawFound += rawCandidates.length;

        // Stage 1: Duplikate, geschlossene Betriebe & Großketten filtern
        if (actualRuns > 1) {
          globalNightScoutState.step = `Run ${runNum}/${actualRuns}: Prüfe Duplikate & bestehende Leads...`;
        } else {
          globalNightScoutState.step = "Prüfe Duplikate & bestehende Leads...";
        }
        globalNightScoutState.progress = Math.max(25, baseProgress + 12);

        const eligibleCandidates: any[] = [];
        for (const place of rawCandidates) {
          const name = place.displayName?.text || "";
          const address = place.formattedAddress || "";
          const phone = place.internationalPhoneNumber || null;
          const website = place.websiteUri || null;

          if (!name) continue;

          // Dauerhaft oder vorübergehend geschlossene Betriebe sofort überspringen
          if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
            continue;
          }

          // Großketten & Touristen-Institutionen (>2.500 Reviews) überspringen (kein Inhaber beim Walk-In greifbar)
          if ((place.userRatingCount || 0) > 2500) {
            continue;
          }

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
            deduplicationPool
          );
          if (dupCheck.some((d) => d.confidence === "high" || d.score >= 0.85)) {
            droppedDuplicates++;
            continue;
          }

          if (normWeb) knownWebsites.add(normWeb);
          if (cleanPhone) knownPhones.add(cleanPhone);
          deduplicationPool.push({
            id: `run-${runIdx}-${eligibleCandidates.length}`,
            companyName: name,
            website: normWeb,
            phone,
            address,
            city: "Wien",
            treatwellUrl: null,
            email: null,
            instagram: null,
            googleMapsUrl: place.googleMapsUri || null,
          });

          eligibleCandidates.push(place);
        }

        // Stage 2: Schnelle parallele Website & Tech-Prüfung (Chunks von 6)
        if (actualRuns > 1) {
          globalNightScoutState.step = `Run ${runNum}/${actualRuns}: Analysiere Websites für ${eligibleCandidates.length} Betriebe...`;
        } else {
          globalNightScoutState.step = `Analysiere Websites & Mängel für ${eligibleCandidates.length} Betriebe...`;
        }
        globalNightScoutState.progress = Math.max(40, baseProgress + 20);

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
              const openingHours = place.regularOpeningHours || null;

              let walkInScore = 25;
              const reasons: string[] = [];
              let websiteStatus: "missing" | "outdated" | "unsecure" | "ok" = "ok";
              let isModern = false;
              let isInactiveDeadProfile = false;

              // 1. Social-Only / Linktree vorab abfangen (verhindert unnötigen HTML-Audit gegen Login-Walls)
              const socialCheck = parseSocialReplacement(website);
              let hasInstagram = Boolean(socialCheck.instagramHandle);
              let instagramHandle: string | null = socialCheck.instagramHandle;

              if (!website) {
                walkInScore += 45;
                websiteStatus = "missing";
                reasons.push("Keine Website vorhanden (Exzellenter Walk-In Hebel)");
              } else if (socialCheck.isSocialOnly) {
                walkInScore += 40;
                websiteStatus = "missing";
                hasInstagram = true;
                reasons.push("Nutzt nur Instagram/Linktree als Website-Ersatz");
              } else {
                const audit = await fastWebsiteAudit(website);
                if (audit.detectedIgHandle) {
                  hasInstagram = true;
                  instagramHandle = audit.detectedIgHandle;
                }

                if (!audit.reachable) {
                  walkInScore += 35;
                  websiteStatus = "unsecure";
                  reasons.push("Website nicht erreichbar / Fehler oder Timeout (>3.5s)");
                } else if (audit.issueCount === 0) {
                  // Fehlerfreie, moderne Website unabhängig vom Google-Rating markieren
                  isModern = true;
                  websiteStatus = "ok";
                  reasons.push("Moderne Website ohne technische Mängel");
                } else {
                  if (audit.hasSslIssue) {
                    walkInScore += 20;
                    websiteStatus = "unsecure";
                    reasons.push("Kein HTTPS / Unsichere Verbindung");
                  }
                  if (audit.hasMobileIssue) {
                    walkInScore += 20;
                    if (websiteStatus === "ok") websiteStatus = "outdated";
                    reasons.push("Website nicht für Smartphones optimiert (Viewport fehlt)");
                  }
                  if (audit.isOldCopyright) {
                    walkInScore += 15;
                    if (websiteStatus === "ok") websiteStatus = "outdated";
                    reasons.push("Veraltetes Website-Copyright");
                  }
                  if (audit.isOldCms) {
                    walkInScore += 10;
                    if (websiteStatus === "ok") websiteStatus = "outdated";
                    reasons.push("Veralteter Baukasten / Legacy-CMS erkannt");
                  }
                  if (hasInstagram) {
                    walkInScore += 5;
                    reasons.push(`Auf Instagram präsent (${instagramHandle}), aber Website veraltet`);
                  }
                }
              }

              // 2. Unabhängiger Kaufkraft- & Traktions-Check (nicht mehr durch else-if blockiert)
              if (googleRating && reviewCount) {
                if (googleRating >= 4.2 && reviewCount >= 50) {
                  walkInScore += 20;
                  reasons.push(`Starke Kundenfrequenz: ${reviewCount} Google-Bewertungen (${googleRating}★)`);
                } else if (googleRating >= 4.0 && reviewCount >= 15) {
                  walkInScore += 15;
                  reasons.push(`${reviewCount} Google-Bewertungen (${googleRating}★)`);
                } else if (reviewCount < 5 && !hasInstagram && !phone) {
                  isInactiveDeadProfile = true;
                  walkInScore -= 20;
                }
              } else if (!reviewCount && !hasInstagram && !phone) {
                isInactiveDeadProfile = true;
                walkInScore -= 20;
              }

              // 3. Popular Times Walk-In Zeitfenster inkl. echter Google-Öffnungszeiten
              const bestVisitTime = calculateBestVisitSlot(category, types, new Date().getDay(), openingHours);

              return {
                isModern,
                isInactiveDeadProfile,
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
                  walkInScore: Math.max(0, Math.min(100, walkInScore)),
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
              } else if (res.isInactiveDeadProfile) {
                droppedInactiveSocial++;
              } else {
                filteredCandidates.push(res.item);
              }
            }
          }
        }
      }

      // 5. Ranking & Speichern
      globalNightScoutState.step = "Berechne beste Besuchszeiten & erstelle Ranking...";
      globalNightScoutState.progress = 95;

      filteredCandidates.sort((a, b) => b.walkInScore - a.walkInScore);
      const totalTargetLeads = targetCount * actualRuns;
      const topLeads = filteredCandidates.slice(0, totalTargetLeads);

      const stats: NightScoutFunnelStats = {
        totalRawFound,
        droppedDuplicates,
        droppedModernWebsites,
        droppedInactiveSocial,
        topHotLeads: topLeads.length,
      };

      const session = await prisma.scoutSession.create({
        data: {
          name: `Night Scout: ${districts.slice(0, 2).join(", ")} (${actualRuns > 1 ? `${actualRuns} Runs, ` : ""}${new Date().toLocaleDateString("de-AT")})`,
          searchQuery: `Night Scout Funnel: ${category}`,
          city: "Wien",
          filters: {
            districts,
            category,
            runs: actualRuns,
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
              instagramHandle: item.instagramHandle,
              rawData: {
                walkInScore: item.walkInScore,
                opportunityReasons: item.opportunityReasons,
                bestVisitTime: item.bestVisitTime,
                websiteStatus: item.websiteStatus,
                hasInstagram: item.hasInstagram,
                instagramHandle: item.instagramHandle,
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
