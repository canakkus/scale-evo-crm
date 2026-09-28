/**
 * Production Batch Scout and Import Runner Engine for 2014-Style Retro Leads
 * Target User: Can Akkus (canakkus378@gmail.com / 020c62b0-1e83-4d89-8120-328e8a5ce3b9)
 *
 * Features:
 * - 95+ Austrian search queries across all 23 Vienna districts (1010-1230) and 7 major Austrian cities.
 * - Industries: Traditionelle Gastronomie (Gasthäuser, Heurige, Wirtshäuser, Cafés), Handwerk (Installateure, Tischler, Elektriker, Schlosser, Dachdecker, Maler, Spengler), KFZ & Autowerkstätten, lokale Dienstleister.
 * - Google Places API v1 (SearchText) with regionCode: "AT".
 * - 2014-Style HTML Retro-Audit with 4s timeout & HTTP fallback:
 *     Missing mobile viewport: +45 pts
 *     Insecure HTTP (no SSL): +25 pts
 *     Outdated copyright (<= 2018): +20 pts
 *     HTML layout tables (> 2): +15 pts
 *     Outdated CMS (Joomla, Typo3 4, WordPress 3/4, FrontPage, Dreamweaver): +20 pts
 *     PDF-only menu: +10 pts
 *     Missing cookie consent: +10 pts
 *     Qualification gate: retroScore >= 35.
 * - Continuous 3er-Batch persistence & deep deduplication against existing database leads.
 * - Ready-to-call Viennese telephone pitch opener & structured notes.
 * - CLI flags: --target=81, --dry-run, --batch-size=3.
 */

import { existsSync } from "fs";

// Automatically load .env and .env.local if present
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {}
}
if (existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
}

import { prisma } from "../src/lib/prisma";
import { WebPresence, AcquisitionType, LeadStatus, Priority } from "@prisma/client";
import { normalizeUrl } from "../src/lib/utils";
import * as cheerio from "cheerio";

// ==================== CLI ARGUMENTS ====================

interface CliOptions {
  target: number;
  batchSize: number;
  dryRun: boolean;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  let target = 81;
  let batchSize = 3;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--target=")) {
      target = parseInt(arg.split("=")[1], 10) || 81;
    } else if (arg.startsWith("--batch-size=")) {
      batchSize = parseInt(arg.split("=")[1], 10) || 3;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Verwendung: npx tsx scripts/scout-and-import-80-retro-leads.ts [Optionen]

Optionen:
  --target=N       Anzahl der zu importierenden qualifizierten Leads (Standard: 81)
  --batch-size=N   Größe der inkrementellen Batches (Standard: 3)
  --dry-run        Simulation: Findet und auditiert Leads ohne Schreibzugriff auf die Datenbank
  --help, -h       Hilfe anzeigen
`);
      process.exit(0);
    }
  }

  return { target, batchSize, dryRun };
}

// ==================== SEARCH QUERIES (60+ AUSTRIAN TARGETS) ====================

interface SearchQuery {
  q: string;
  industry: string;
  defaultCity: string;
}

const SEARCH_QUERIES: SearchQuery[] = [
  // --- 1010 Wien (Innere Stadt) ---
  { q: "Gasthaus Wien 1010", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Traditionscafé Wien 1010", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1010", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1020 Wien (Leopoldstadt) ---
  { q: "Gasthaus Wien 1020", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1020", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1020", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1030 Wien (Landstraße) ---
  { q: "Gasthaus Wien 1030", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Elektriker Wien 1030", industry: "Handwerk & Elektro", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1030", industry: "KFZ & Werkstatt", defaultCity: "Wien" },

  // --- 1040 Wien (Wieden) ---
  { q: "Pizzeria Wien 1040", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1040", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Malerbetrieb Wien 1040", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1050 Wien (Margareten) ---
  { q: "Gasthaus Wien 1050", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1050", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1050", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1060 Wien (Mariahilf) ---
  { q: "Wirtshaus Wien 1060", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1060", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1060", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1070 Wien (Neubau) ---
  { q: "Café Restaurant Wien 1070", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Elektriker Wien 1070", industry: "Handwerk & Elektro", defaultCity: "Wien" },
  { q: "Tischler Wien 1070", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1080 Wien (Josefstadt) ---
  { q: "Gasthaus Wien 1080", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1080", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1080", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1090 Wien (Alsergrund) ---
  { q: "Wirtshaus Wien 1090", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1090", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Elektriker Wien 1090", industry: "Handwerk & Elektro", defaultCity: "Wien" },

  // --- 1100 Wien (Favoriten) ---
  { q: "Gasthaus Wien 1100", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Autowerkstatt Wien 1100", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Installateur Wien 1100", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Spengler Wien 1100", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1110 Wien (Simmering) ---
  { q: "Gasthof Wien 1110", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1110", industry: "Handwerk", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1110", industry: "KFZ & Werkstatt", defaultCity: "Wien" },

  // --- 1120 Wien (Meidling) ---
  { q: "Gasthaus Wien 1120", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1120", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1120", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1130 Wien (Hietzing) ---
  { q: "Heuriger Wien 1130", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Gasthaus Wien 1130", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Malerbetrieb Wien 1130", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1140 Wien (Penzing) ---
  { q: "Wirtshaus Wien 1140", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1140", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Elektriker Wien 1140", industry: "Handwerk & Elektro", defaultCity: "Wien" },

  // --- 1150 Wien (Rudolfsheim-Fünfhaus) ---
  { q: "Gasthaus Wien 1150", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Elektriker Wien 1150", industry: "Handwerk & Elektro", defaultCity: "Wien" },
  { q: "Autowerkstatt Wien 1150", industry: "KFZ & Werkstatt", defaultCity: "Wien" },

  // --- 1160 Wien (Ottakring) ---
  { q: "Heuriger Wien 1160", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Gasthaus Wien 1160", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1160", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1160", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1170 Wien (Hernals) ---
  { q: "Heuriger Wien 1170", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Gasthaus Wien 1170", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1170", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1180 Wien (Währing) ---
  { q: "Gasthaus Wien 1180", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Maler Wien 1180", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Elektriker Wien 1180", industry: "Handwerk & Elektro", defaultCity: "Wien" },

  // --- 1190 Wien (Döbling) ---
  { q: "Heuriger Wien 1190", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Weingut Wien 1190", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1190", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },

  // --- 1200 Wien (Brigittenau) ---
  { q: "Gasthaus Wien 1200", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1200", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1200", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1210 Wien (Floridsdorf) ---
  { q: "Gasthaus Wien 1210", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Heuriger Wien 1210", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Installateur Wien 1210", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1210", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1220 Wien (Donaustadt) ---
  { q: "Gasthaus Wien 1220", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Autowerkstatt Wien 1220", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1220", industry: "Handwerk", defaultCity: "Wien" },

  // --- 1230 Wien (Liesing) ---
  { q: "Gasthof Wien 1230", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Heuriger Wien 1230", industry: "Gastronomie", defaultCity: "Wien" },
  { q: "Malerbetrieb Wien 1230", industry: "Handwerk", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1230", industry: "KFZ & Werkstatt", defaultCity: "Wien" },

  // --- Graz ---
  { q: "Gasthaus Graz", industry: "Gastronomie", defaultCity: "Graz" },
  { q: "Wirtshaus Graz", industry: "Gastronomie", defaultCity: "Graz" },
  { q: "Installateur Graz", industry: "Handwerk & Haustechnik", defaultCity: "Graz" },
  { q: "Tischlerei Graz", industry: "Handwerk", defaultCity: "Graz" },
  { q: "KFZ Werkstatt Graz", industry: "KFZ & Werkstatt", defaultCity: "Graz" },

  // --- Linz ---
  { q: "Gasthaus Linz", industry: "Gastronomie", defaultCity: "Linz" },
  { q: "Wirtshaus Linz", industry: "Gastronomie", defaultCity: "Linz" },
  { q: "Installateur Linz", industry: "Handwerk & Haustechnik", defaultCity: "Linz" },
  { q: "Elektriker Linz", industry: "Handwerk & Elektro", defaultCity: "Linz" },
  { q: "Autowerkstatt Linz", industry: "KFZ & Werkstatt", defaultCity: "Linz" },

  // --- Salzburg ---
  { q: "Gasthaus Salzburg", industry: "Gastronomie", defaultCity: "Salzburg" },
  { q: "Wirtshaus Salzburg", industry: "Gastronomie", defaultCity: "Salzburg" },
  { q: "Installateur Salzburg", industry: "Handwerk & Haustechnik", defaultCity: "Salzburg" },
  { q: "Tischler Salzburg", industry: "Handwerk", defaultCity: "Salzburg" },

  // --- Innsbruck ---
  { q: "Gasthof Innsbruck", industry: "Gastronomie", defaultCity: "Innsbruck" },
  { q: "Wirtshaus Innsbruck", industry: "Gastronomie", defaultCity: "Innsbruck" },
  { q: "Installateur Innsbruck", industry: "Handwerk & Haustechnik", defaultCity: "Innsbruck" },

  // --- Klagenfurt ---
  { q: "Gasthaus Klagenfurt", industry: "Gastronomie", defaultCity: "Klagenfurt" },
  { q: "Wirtshaus Klagenfurt", industry: "Gastronomie", defaultCity: "Klagenfurt" },
  { q: "Installateur Klagenfurt", industry: "Handwerk & Haustechnik", defaultCity: "Klagenfurt" },

  // --- St. Pölten ---
  { q: "Gasthaus St. Pölten", industry: "Gastronomie", defaultCity: "St. Pölten" },
  { q: "Wirtshaus St. Pölten", industry: "Gastronomie", defaultCity: "St. Pölten" },
  { q: "Installateur St. Pölten", industry: "Handwerk & Haustechnik", defaultCity: "St. Pölten" },

  // --- Wels ---
  { q: "Gasthaus Wels", industry: "Gastronomie", defaultCity: "Wels" },
  { q: "Wirtshaus Wels", industry: "Gastronomie", defaultCity: "Wels" },
  { q: "Installateur Wels", industry: "Handwerk & Haustechnik", defaultCity: "Wels" },
  { q: "KFZ Werkstatt Wels", industry: "KFZ & Werkstatt", defaultCity: "Wels" },
  { q: "Elektriker Wels", industry: "Handwerk & Elektro", defaultCity: "Wels" },

  // --- Weitere Wien Bezirke & Handwerk/Gastro ---
  { q: "Elektriker Wien 1010", industry: "Handwerk & Elektro", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1020", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Installateur Wien 1030", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1040", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Maler Wien 1050", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1060", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Installateur Wien 1070", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1080", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1090", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1100", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1110", industry: "Handwerk", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1120", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Installateur Wien 1130", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "KFZ Werkstatt Wien 1140", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Schlosser Wien 1150", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Tischlerei Wien 1160", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Dachdecker Wien 1170", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Installateur Wien 1180", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1190", industry: "Handwerk", defaultCity: "Wien" },
  { q: "Elektriker Wien 1200", industry: "Handwerk & Elektro", defaultCity: "Wien" },
  { q: "Autowerkstatt Wien 1210", industry: "KFZ & Werkstatt", defaultCity: "Wien" },
  { q: "Installateur Wien 1220", industry: "Handwerk & Haustechnik", defaultCity: "Wien" },
  { q: "Schlosserei Wien 1230", industry: "Handwerk", defaultCity: "Wien" },

  // --- Graz (weitere) ---
  { q: "Elektriker Graz", industry: "Handwerk & Elektro", defaultCity: "Graz" },
  { q: "Dachdecker Graz", industry: "Handwerk", defaultCity: "Graz" },
  { q: "Malerbetrieb Graz", industry: "Handwerk", defaultCity: "Graz" },
  { q: "Schlosserei Graz", industry: "Handwerk", defaultCity: "Graz" },

  // --- Linz (weitere) ---
  { q: "Tischlerei Linz", industry: "Handwerk", defaultCity: "Linz" },
  { q: "Dachdecker Linz", industry: "Handwerk", defaultCity: "Linz" },
  { q: "Malerbetrieb Linz", industry: "Handwerk", defaultCity: "Linz" },
  { q: "Schlosserei Linz", industry: "Handwerk", defaultCity: "Linz" },

  // --- Salzburg (weitere) ---
  { q: "KFZ Werkstatt Salzburg", industry: "KFZ & Werkstatt", defaultCity: "Salzburg" },
  { q: "Elektriker Salzburg", industry: "Handwerk & Elektro", defaultCity: "Salzburg" },
  { q: "Malerbetrieb Salzburg", industry: "Handwerk", defaultCity: "Salzburg" },
  { q: "Dachdecker Salzburg", industry: "Handwerk", defaultCity: "Salzburg" },

  // --- Innsbruck (weitere) ---
  { q: "KFZ Werkstatt Innsbruck", industry: "KFZ & Werkstatt", defaultCity: "Innsbruck" },
  { q: "Tischler Innsbruck", industry: "Handwerk", defaultCity: "Innsbruck" },
  { q: "Elektriker Innsbruck", industry: "Handwerk & Elektro", defaultCity: "Innsbruck" },

  // --- Klagenfurt (weitere) ---
  { q: "KFZ Werkstatt Klagenfurt", industry: "KFZ & Werkstatt", defaultCity: "Klagenfurt" },
  { q: "Tischler Klagenfurt", industry: "Handwerk", defaultCity: "Klagenfurt" },
  { q: "Elektriker Klagenfurt", industry: "Handwerk & Elektro", defaultCity: "Klagenfurt" },

  // --- St. Pölten (weitere) ---
  { q: "KFZ Werkstatt St. Pölten", industry: "KFZ & Werkstatt", defaultCity: "St. Pölten" },
  { q: "Tischlerei St. Pölten", industry: "Handwerk", defaultCity: "St. Pölten" },
  { q: "Dachdecker St. Pölten", industry: "Handwerk", defaultCity: "St. Pölten" },

  // --- Villach ---
  { q: "Gasthaus Villach", industry: "Gastronomie", defaultCity: "Villach" },
  { q: "Wirtshaus Villach", industry: "Gastronomie", defaultCity: "Villach" },
  { q: "Installateur Villach", industry: "Handwerk & Haustechnik", defaultCity: "Villach" },
  { q: "KFZ Werkstatt Villach", industry: "KFZ & Werkstatt", defaultCity: "Villach" },
  { q: "Tischler Villach", industry: "Handwerk", defaultCity: "Villach" },

  // --- Steyr ---
  { q: "Gasthaus Steyr", industry: "Gastronomie", defaultCity: "Steyr" },
  { q: "Wirtshaus Steyr", industry: "Gastronomie", defaultCity: "Steyr" },
  { q: "Installateur Steyr", industry: "Handwerk & Haustechnik", defaultCity: "Steyr" },
  { q: "KFZ Werkstatt Steyr", industry: "KFZ & Werkstatt", defaultCity: "Steyr" },

  // --- Wiener Neustadt ---
  { q: "Gasthaus Wiener Neustadt", industry: "Gastronomie", defaultCity: "Wiener Neustadt" },
  { q: "Wirtshaus Wiener Neustadt", industry: "Gastronomie", defaultCity: "Wiener Neustadt" },
  { q: "Installateur Wiener Neustadt", industry: "Handwerk & Haustechnik", defaultCity: "Wiener Neustadt" },
  { q: "KFZ Werkstatt Wiener Neustadt", industry: "KFZ & Werkstatt", defaultCity: "Wiener Neustadt" },
  { q: "Elektriker Wiener Neustadt", industry: "Handwerk & Elektro", defaultCity: "Wiener Neustadt" },

  // --- Baden bei Wien ---
  { q: "Gasthaus Baden", industry: "Gastronomie", defaultCity: "Baden" },
  { q: "Heuriger Baden", industry: "Gastronomie", defaultCity: "Baden" },
  { q: "Installateur Baden", industry: "Handwerk & Haustechnik", defaultCity: "Baden" },
  { q: "Tischlerei Baden", industry: "Handwerk", defaultCity: "Baden" },

  // --- Krems an der Donau ---
  { q: "Gasthaus Krems", industry: "Gastronomie", defaultCity: "Krems" },
  { q: "Heuriger Krems", industry: "Gastronomie", defaultCity: "Krems" },
  { q: "Installateur Krems", industry: "Handwerk & Haustechnik", defaultCity: "Krems" },
  { q: "Tischlerei Krems", industry: "Handwerk", defaultCity: "Krems" },

  // --- Dornbirn & Bregenz ---
  { q: "Gasthaus Dornbirn", industry: "Gastronomie", defaultCity: "Dornbirn" },
  { q: "Installateur Dornbirn", industry: "Handwerk & Haustechnik", defaultCity: "Dornbirn" },
  { q: "Gasthaus Bregenz", industry: "Gastronomie", defaultCity: "Bregenz" },
  { q: "Installateur Bregenz", industry: "Handwerk & Haustechnik", defaultCity: "Bregenz" },
];

// Blocked directories and social networks
const BLOCKED_PATTERNS = /facebook\.com|instagram\.com|wien\.gv\.at|herold\.at|firmenabc\.at|tripadvisor|lieferando|m\.lieferando|booking\.com|google\.com|youtube\.com|linkedin\.com|twitter\.com|x\.com|gelbeseiten|gutgemacht\.at|docfinder\.at/i;

// ==================== GOOGLE PLACES API V1 CLIENT ====================

interface PlaceResult {
  displayName?: { text: string };
  formattedAddress?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  internationalPhoneNumber?: string;
  types?: string[];
  primaryTypeDisplayName?: { text: string };
  location?: { latitude: number; longitude: number };
}

async function searchGooglePlaces(query: string): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("Fehlende Umgebungsvariable: GOOGLE_PLACES_API_KEY");
  }

  const url = "https://places.googleapis.com/v1/places:searchText";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.types,places.primaryTypeDisplayName,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        pageSize: 10,
      }),
    });

    if (!res.ok) {
      console.warn(`[Places API] Warnung: HTTP ${res.status} für Query "${query}"`);
      return [];
    }

    const data = await res.json();
    return data.places || [];
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Places API] Netzwerkfehler bei Query "${query}": ${errorMsg}`);
    return [];
  }
}

// ==================== 2014-STYLE HTML RETRO-AUDIT ====================

interface RetroAuditResult {
  hasViewport: boolean;
  https: boolean;
  copyrightMatch: string | null;
  layoutTables: number;
  generator: string;
  isOutdatedCms: boolean;
  hasConsent: boolean;
  menuIsPdf: boolean;
  htmlPhone: string | null;
  retroScore: number;
  retroFindings: string[];
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchWebsiteHtml(
  rawUrl: string
): Promise<{ html: string; finalUrl: string; https: boolean } | null> {
  const normalized = normalizeUrl(rawUrl) || rawUrl;
  let targetUrl = normalized.startsWith("http") ? normalized : `https://${normalized}`;

  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
  };

  let res: Response | null = null;
  try {
    res = await fetch(targetUrl, {
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // If HTTPS fails or times out, attempt HTTP fallback
    if (targetUrl.startsWith("https://")) {
      const httpUrl = targetUrl.replace(/^https:\/\//, "http://");
      try {
        res = await fetch(httpUrl, {
          headers,
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        targetUrl = httpUrl;
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (!res) return null;
  const status = res.status;
  if (status < 200 || status >= 400) return null;

  try {
    const html = (await res.text().catch(() => "")).slice(0, 2_000_000);
    const finalUrl = res.url || targetUrl;
    const https = finalUrl.startsWith("https://");
    return { html, finalUrl, https };
  } catch {
    return null;
  }
}

function auditHtml(html: string, finalUrl: string, https: boolean): RetroAuditResult {
  const $ = cheerio.load(html);

  // 1. Mobile Viewport Check (<meta name='viewport'>)
  const viewport = $("meta[name='viewport']").attr("content");
  const hasViewport = Boolean(viewport && viewport.trim().length > 0);

  // Strip script, style, noscript, svg for accurate text analysis
  const textClone = cheerio.load(html);
  textClone("script, style, noscript, svg").remove();
  const bodyText = textClone("body").text().replace(/\s+/g, " ").trim();

  // 2. Copyright Year Check (<= 2018)
  const copyrightMatch = bodyText.match(/(?:©|copyright|\(c\))\s*(?:200\d|201[0-8])\b/i);

  // 3. HTML Layout Tables Check
  const layoutTables = $("table[width], table[border], td[valign]").length;

  // 4. Outdated CMS / Generator Check
  const generator = $("meta[name='generator']").attr("content")?.trim() || "";
  const isOutdatedCms = /joomla|frontpage|dreamweaver|typo3 4|wordpress 3|wordpress 4/i.test(generator);

  // 5. Cookie Consent / DSGVO Check
  const rawHtmlSlice = html.slice(0, 100_000).toLowerCase();
  const pageTextLower = bodyText.toLowerCase();
  const consentKeywords = [
    "cookie consent",
    "cookie-einstellungen",
    "cookie settings",
    "consent-manager",
    "cookiebot",
    "usercentrics",
    "borlabs",
    "cookie-hinweis",
    "cookie banner",
    "cookies akzeptieren",
  ];
  const hasConsent = consentKeywords.some(
    (term) => pageTextLower.includes(term) || rawHtmlSlice.includes(term)
  );

  // 6. Speisekarte PDF Check
  const allLinks = $("a")
    .map((_, el) => ({
      text: $(el).text().trim().toLowerCase(),
      href: $(el).attr("href") ?? "",
    }))
    .get();

  const MENU_WORDS =
    /speisekarte|speisen|karte|menü|menu|essen|gerichte|dishes|tageskarte|mittagskarte|abendkarte/i;
  const menuLinks = allLinks.filter((link) => {
    const text = link.text;
    const href = link.href;
    if (!href || href.startsWith("#") || /javascript:/.test(href)) return false;
    return MENU_WORDS.test(text) || MENU_WORDS.test(href);
  });
  const menuPdfLinks = menuLinks.filter(
    (link) => /\.pdf($|\?)/i.test(link.href) || /\.pdf/i.test(link.text)
  );
  const menuIsPdf = menuLinks.length > 0 && menuPdfLinks.length === menuLinks.length;

  // Phone fallback from HTML if needed
  const htmlPhone =
    $("a[href^='tel:']").first().attr("href")?.replace(/^tel:/, "").trim() ||
    bodyText.match(/(?:\+43|0043|0)[\s()/-]*(?:\d[\s()/-]*){7,13}/)?.[0]?.trim() ||
    null;

  // Compute Retro Score & Compile Findings
  let retroScore = 0;
  const retroFindings: string[] = [];

  if (!hasViewport) {
    retroScore += 45;
    retroFindings.push("Kein Mobile Viewport (nicht responsive – Schriften winzig auf Smartphones)");
  }
  if (!https) {
    retroScore += 25;
    retroFindings.push("Kein HTTPS (reines HTTP – Browser zeigt rote Warnung 'Nicht sicher')");
  }
  if (copyrightMatch) {
    retroScore += 20;
    retroFindings.push(`Veraltetes Copyright: '${copyrightMatch[0]}'`);
  }
  if (layoutTables > 2) {
    retroScore += 15;
    retroFindings.push(`Alte HTML-Layout-Tabellen (${layoutTables} Elemente)`);
  }
  if (generator) {
    retroFindings.push(`CMS/Generator: ${generator}`);
    if (isOutdatedCms) {
      retroScore += 20;
    }
  }
  if (menuIsPdf) {
    retroScore += 10;
    retroFindings.push("Speisekarte nur als PDF-Download");
  }
  if (!hasConsent) {
    retroScore += 10;
    retroFindings.push("Kein Cookie-Consent / DSGVO-Banner");
  }

  return {
    hasViewport,
    https,
    copyrightMatch: copyrightMatch ? copyrightMatch[0] : null,
    layoutTables,
    generator,
    isOutdatedCms,
    hasConsent,
    menuIsPdf,
    htmlPhone,
    retroScore,
    retroFindings,
  };
}

// ==================== LEAD ENRICHMENT & PITCH BUILDER ====================

interface PitchAndEnrichment {
  pitch: string;
  interestingReason: string;
  tags: string[];
  scoreReasons: string[];
  score: number;
  priority: Priority;
}

function buildPitchAndEnrichment(
  name: string,
  city: string,
  industry: string,
  reviews: number,
  rating: number,
  audit: RetroAuditResult
): PitchAndEnrichment {
  const {
    retroFindings,
    retroScore,
    hasViewport,
    https,
    copyrightMatch,
    layoutTables,
    generator,
    isOutdatedCms,
    hasConsent,
  } = audit;

  const tags: string[] = ["RETRO_WEBSITE"];
  const scoreReasons: string[] = [];

  if (!hasViewport) {
    tags.push("NO_MOBILE_VIEWPORT");
    scoreReasons.push("Kein Mobile Viewport (<meta name='viewport'> fehlt)");
  }
  if (!https) {
    tags.push("NO_HTTPS");
    scoreReasons.push("Kein HTTPS (ungesichertes HTTP)");
  }
  if (copyrightMatch) {
    tags.push("OLD_COPYRIGHT");
    scoreReasons.push(`Uralt-Copyright: ${copyrightMatch}`);
  }
  if (layoutTables > 2) {
    tags.push("LAYOUT_TABLES");
    scoreReasons.push("HTML-Layout-Tabellen");
  }
  if (isOutdatedCms || (generator && /joomla|wordpress/i.test(generator))) {
    tags.push("OUTDATED_CMS");
    scoreReasons.push(`Veraltetes CMS: ${generator}`);
  }
  if (!hasConsent) {
    scoreReasons.push("Kein Cookie-Consent");
  }
  if (reviews > 100) {
    tags.push("HIGH_REVIEWS");
    scoreReasons.push(`${reviews} Google-Rezensionen (${rating}★)`);
  }
  if (reviews >= 1000) {
    tags.push("HUGE_CUSTOMER_BASE");
  }

  // Priority and Inactivity Derivation
  let priority: Priority = Priority.HIGH;
  let finalScore = Math.min(98, retroScore + (reviews > 100 ? 10 : 0));
  if (reviews < 5) {
    priority = Priority.LOW;
    tags.push("INACTIVE_SUSPECTED", "LOW_VOLUME");
    finalScore = Math.min(30, retroScore);
  }

  // Telephone Pitch Opener (Viennese Tone & Context-Aware)
  let opener = "";
  const locationRef = city ? `in ${city}` : "in Wien";

  if (!hasViewport && !https) {
    opener = `Servus! Ihr habt auf Google ${
      reviews > 0 ? `über ${reviews} super Bewertungen` : "einen top Ruf"
    }, aber wenn ein Kunde euch am Handy sucht, ist die Website komplett zerschossen und der Browser warnt vor einer ungesicherten Verbindung. Ich helfe lokalen Betrieben ${locationRef} dabei, das kurzfristig und ohne Ausfallzeiten auf ein modernes Niveau zu bringen. Wann passt es diese Woche für ein kurzes Gespräch?`;
  } else if (!hasViewport) {
    opener = `Grüß Gott! Bei euren ${
      reviews > 0 ? `${reviews} Bewertungen` : "Kunden"
    } seid ihr eine feste Größe. Auf dem Smartphone lädt eure Website aber leider noch in der starren Desktop-Ansicht, sodass Kunden mühsam reinzoomen müssen, um Angebote oder Telefonnummern zu sehen. Lasst uns das glattziehen!`;
  } else {
    opener = `Servus! Eure Website läuft aktuell noch auf ungesichertem HTTP${
      copyrightMatch ? ` mit Stand von ${copyrightMatch}` : ""
    }. Moderne Browser markieren das rot als unsicher. Ich helfe lokalen Betrieben ${locationRef} dabei, den Webauftritt abzusichern und für Mobilgeräte zu optimieren. Habt ihr 5 Minuten?`;
  }

  const pitchText = `🔥 RETRO-AUDIT (Score: ${retroScore}/100 - Handlungsbedarf):
${retroFindings.map((f) => `• ${f}`).join("\n")}

🎯 PITCH & HEBEL FÜR DEN ANRUF:
"${opener}"`;

  const interestingReason = `${name} in ${city}: Retro-Score ${retroScore}/100 mit ${reviews} Bewertungen (${rating}★). ${
    retroFindings[0] || "Veralteter Webauftritt"
  }.`;

  return {
    pitch: pitchText,
    interestingReason,
    tags,
    scoreReasons,
    score: finalScore,
    priority,
  };
}

// ==================== ADDRESS & PHONE HELPERS ====================

function parsePlacesAddress(
  formattedAddress: string | null | undefined,
  defaultCity: string
): { address: string; city: string } {
  if (!formattedAddress) {
    return { address: "", city: defaultCity };
  }

  const parts = formattedAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2 && /^(österreich|austria)$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }

  let city = defaultCity;
  let streetAddress = parts.join(", ");

  if (parts.length >= 2) {
    const cityCandidate = parts[parts.length - 1];
    const match = cityCandidate.match(/(?:\d{4}\s+)?([A-Za-zÄÖÜäöüß\s.-]+)/);
    if (match && match[1].trim()) {
      city = match[1].trim();
    }
    streetAddress = parts.slice(0, parts.length - 1).join(", ");
  }

  return { address: streetAddress || formattedAddress, city };
}

function cleanPhoneNumber(rawPhone?: string | null): string | null {
  if (!rawPhone?.trim()) return null;
  const trimmed = rawPhone.trim();

  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  if (trimmed.startsWith("0043")) {
    return "+43 " + trimmed.slice(4).trim();
  }
  if (trimmed.startsWith("0")) {
    return "+43 " + trimmed.slice(1).trim();
  }
  return trimmed;
}

// ==================== LEAD PAYLOAD INTERFACE ====================

interface LeadPayload {
  companyName: string;
  industry: string;
  address: string;
  city: string;
  phone: string;
  website: string;
  googleRating: number;
  googleReviewCount: number;
  latitude: number | null;
  longitude: number | null;
  geoSource: string;
  geoPrecision: string;
  geoStatus: string;
  geoAttemptedAt: Date;
  source: string;
  webPresence: WebPresence;
  acquisitionType: AcquisitionType;
  status: LeadStatus;
  priority: Priority;
  score: number;
  scoreReasons: string[];
  opportunityTags: string[];
  interestingReason: string;
  notes: string;
  createdById: string;
}

// ==================== MAIN RUNNER ENGINE ====================

async function main() {
  const options = parseCliArgs();
  console.log("================================================================================");
  console.log("🚀 SCALE EVO CRM — PRODUCTION RETRO-LEAD SCOUT & IMPORT RUNNER");
  console.log(`   Konfiguration: Target = ${options.target} Leads | Batch-Größe = ${options.batchSize} | Modus = ${options.dryRun ? "DRY-RUN (Simulation)" : "LIVE (Postgres/Supabase)"}`);
  console.log("================================================================================\n");

  // 1. Resolve Target User (Can Akkus)
  const canUser = await prisma.user.findUnique({
    where: { email: "canakkus378@gmail.com" },
  });

  if (!canUser) {
    throw new Error("Fehler: Benutzer canakkus378@gmail.com nicht in der Datenbank gefunden!");
  }
  console.log(`👤 Target User: ${canUser.displayName} (${canUser.email}, ID: ${canUser.id})`);

  // 2. Count Existing Retro Leads
  const initialRetroCount = await prisma.lead.count({
    where: {
      createdById: canUser.id,
      notes: { contains: "RETRO-AUDIT" },
    },
  });
  console.log(`📊 Bestehende Retro-Leads in Cans Workspace: ${initialRetroCount}`);

  // 3. Load In-Memory Deduplication Sets
  const allUserLeads = await prisma.lead.findMany({
    where: { createdById: canUser.id },
    select: { companyName: true, website: true, phone: true },
  });

  function extractDomain(urlStr?: string | null): string | null {
    if (!urlStr) return null;
    try {
      const clean = urlStr.trim();
      const parsed = new URL(clean.startsWith("http") ? clean : `http://${clean}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, "").trim();
    } catch {
      return null;
    }
  }

  const existingNames = new Set(allUserLeads.map((l) => l.companyName.toLowerCase().trim()));
  const existingWebsites = new Set(
    allUserLeads
      .map((l) => (l.website || "").toLowerCase().replace(/\/$/, "").trim())
      .filter(Boolean)
  );
  const existingDomains = new Set<string>();
  for (const l of allUserLeads) {
    const dom = extractDomain(l.website);
    if (dom) existingDomains.add(dom);
  }
  const existingPhones = new Set(
    allUserLeads
      .map((l) => (l.phone || "").replace(/\D/g, ""))
      .filter((p) => p.length >= 6)
  );

  console.log(
    `🔒 Deduplizierungs-Cache geladen: ${existingNames.size} Namen, ${existingWebsites.size} Websites (${existingDomains.size} Domains), ${existingPhones.size} Telefonnummern.\n`
  );

  function registerLead(payload: { companyName: string; website?: string | null; phone?: string | null }) {
    const cleanName = payload.companyName.toLowerCase().trim();
    existingNames.add(cleanName);
    if (payload.website) {
      existingWebsites.add(payload.website.toLowerCase().replace(/\/$/, "").trim());
      const dom = extractDomain(payload.website);
      if (dom) existingDomains.add(dom);
    }
    if (payload.phone) {
      const digits = payload.phone.replace(/\D/g, "");
      if (digits.length >= 6) existingPhones.add(digits);
    }
  }

  function isDuplicate(name: string, website?: string | null, phone?: string | null): boolean {
    const cleanName = name.toLowerCase().trim();
    if (existingNames.has(cleanName)) return true;

    if (website) {
      const cleanWeb = website.toLowerCase().replace(/\/$/, "").trim();
      if (existingWebsites.has(cleanWeb)) return true;
      const dom = extractDomain(cleanWeb);
      if (dom && existingDomains.has(dom)) return true;
    }

    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 6 && existingPhones.has(digits)) return true;
    }

    return false;
  }

  // 4. Batch Accumulator State
  const batchBuffer: LeadPayload[] = [];
  let batchIndex = 0;
  let totalImported = 0;
  const targetCount = options.target;
  const totalBatches = Math.ceil(targetCount / options.batchSize);

  // 5. Query Stream Execution
  queryLoop: for (const { q, industry, defaultCity } of SEARCH_QUERIES) {
    if (totalImported >= targetCount) break queryLoop;
    console.log(`\n🔍 [Scouting] Query: "${q}" (${industry})...`);

    const places = await searchGooglePlaces(q);
    await new Promise((r) => setTimeout(r, 200)); // Rate limit buffer

    for (const place of places) {
      if (totalImported >= targetCount) break queryLoop;

      const name = place.displayName?.text?.trim();
      const rawWebsite = place.websiteUri?.trim();
      const placesPhone = place.internationalPhoneNumber?.trim();
      const formattedAddress = place.formattedAddress;
      const rating = typeof place.rating === "number" ? place.rating : 0;
      const reviews = typeof place.userRatingCount === "number" ? place.userRatingCount : 0;

      if (!name || !rawWebsite) continue;

      // Filter blocked social and directory domains
      if (BLOCKED_PATTERNS.test(rawWebsite)) {
        continue;
      }

      // Check deduplication
      if (isDuplicate(name, rawWebsite, placesPhone)) {
        continue;
      }

      // Audit Website HTML with 4s timeout & HTTP fallback
      const fetchResult = await fetchWebsiteHtml(rawWebsite);
      if (!fetchResult) {
        continue;
      }

      const audit = auditHtml(fetchResult.html, fetchResult.finalUrl, fetchResult.https);

      // Qualification Gate: retroScore >= 35
      if (audit.retroScore < 35) {
        continue;
      }

      // Resolve Phone Number (Places phone or HTML fallback)
      const phoneCandidate = cleanPhoneNumber(placesPhone || audit.htmlPhone);
      if (!phoneCandidate || phoneCandidate.replace(/\D/g, "").length < 6) {
        // Skip leads with no reachable phone number
        continue;
      }

      // Secondary duplicate check with resolved phone and final resolved URL
      if (
        isDuplicate(name, rawWebsite, phoneCandidate) ||
        isDuplicate(name, fetchResult.finalUrl, phoneCandidate)
      ) {
        continue;
      }

      const { address, city } = parsePlacesAddress(formattedAddress, defaultCity);
      const enrichment = buildPitchAndEnrichment(
        name,
        city,
        industry,
        reviews,
        rating,
        audit
      );

      const leadPayload: LeadPayload = {
        companyName: name,
        industry,
        address,
        city,
        phone: phoneCandidate,
        website: fetchResult.finalUrl,
        googleRating: rating,
        googleReviewCount: reviews,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        geoSource: "places",
        geoPrecision: "ROOFTOP",
        geoStatus: "ok",
        geoAttemptedAt: new Date(),
        source: "Lead Scout (2014-Website-Detector)",
        webPresence: WebPresence.WEBSITE,
        acquisitionType: AcquisitionType.CALL,
        status: LeadStatus.NEW,
        priority: enrichment.priority,
        score: enrichment.score,
        scoreReasons: enrichment.scoreReasons,
        opportunityTags: enrichment.tags,
        interestingReason: enrichment.interestingReason,
        notes: enrichment.pitch,
        createdById: canUser.id,
      };

      batchBuffer.push(leadPayload);
      registerLead(leadPayload); // Register immediately into deduplication tracking
      console.log(
        `   🎯 Qualifiziert [Score ${audit.retroScore}]: ${name} (${city}) — ${audit.retroFindings[0]}`
      );

      // Check if current batch is ready to be committed
      const isBatchReady =
        batchBuffer.length >= options.batchSize ||
        totalImported + batchBuffer.length >= targetCount;

      if (isBatchReady) {
        batchIndex++;
        const currentBatchSize = batchBuffer.length;

        if (!options.dryRun) {
          // Persist batch to Supabase/PostgreSQL via Prisma sequentially
          for (const leadData of batchBuffer) {
            await prisma.lead.create({ data: leadData });
          }
        }

        // Update in-memory deduplication sets immediately
        for (const leadData of batchBuffer) {
          registerLead(leadData);
        }

        totalImported += currentBatchSize;
        const targetWorkspaceLeads = initialRetroCount + targetCount;

        if (options.dryRun) {
          console.log(
            `\n[Dry-Run] [Batch ${batchIndex}/${totalBatches}] (${currentBatchSize}/${targetCount}) Simulated ${currentBatchSize} leads. Total new leads: ${totalImported}/${targetCount}. Overall workspace leads: (${initialRetroCount} + ${totalImported})/${targetWorkspaceLeads}.`
          );
          for (const l of batchBuffer) {
            console.log(
              `      • ${l.companyName} | ${l.city} | ${l.phone} | Score: ${l.score} | Tags: ${l.opportunityTags.join(", ")}`
            );
          }
        } else {
          console.log(
            `\n[Batch ${batchIndex}/${totalBatches}] (${currentBatchSize}/${targetCount}) Committed ${currentBatchSize} leads to Supabase. Total new leads: ${totalImported}/${targetCount}. Overall workspace leads: (${initialRetroCount} + ${totalImported})/${targetWorkspaceLeads}.`
          );
          for (const l of batchBuffer) {
            console.log(
              `      ✅ Gespeichert: ${l.companyName} (${l.city}) | Tel: ${l.phone} | Score: ${l.score}`
            );
          }
        }

        batchBuffer.length = 0; // Clear buffer for next 3-lead batch

        if (!options.dryRun) {
          await new Promise((r) => setTimeout(r, 400)); // Inter-batch cooldown
        }
      }
    }
  }

  // Handle remainder if any leads left in buffer
  if (batchBuffer.length > 0) {
    batchIndex++;
    const remainderSize = batchBuffer.length;

    if (!options.dryRun) {
      for (const leadData of batchBuffer) {
        await prisma.lead.create({ data: leadData });
      }
    }

    for (const leadData of batchBuffer) {
      existingNames.add(leadData.companyName.toLowerCase().trim());
      existingWebsites.add(leadData.website.toLowerCase().replace(/\/$/, "").trim());
      existingPhones.add(leadData.phone.replace(/\D/g, ""));
    }

    totalImported += remainderSize;
    const targetWorkspaceLeads = initialRetroCount + targetCount;

    if (options.dryRun) {
      console.log(
        `\n[Dry-Run] [Batch ${batchIndex}/${totalBatches}] (${remainderSize}/${targetCount}) Simulated ${remainderSize} remainder leads. Total new leads: ${totalImported}/${targetCount}. Overall workspace leads: (${initialRetroCount} + ${totalImported})/${targetWorkspaceLeads}.`
      );
    } else {
      console.log(
        `\n[Batch ${batchIndex}/${totalBatches}] (${remainderSize}/${targetCount}) Committed ${remainderSize} remainder leads to Supabase. Total new leads: ${totalImported}/${targetCount}. Overall workspace leads: (${initialRetroCount} + ${totalImported})/${targetWorkspaceLeads}.`
      );
    }
    batchBuffer.length = 0;
  }

  console.log("\n================================================================================");
  console.log("🏁 RUNNER ABGESCHLOSSEN");
  console.log(`   Erfolgreich ${totalImported} qualifizierte Retro-Leads bearbeitet.`);
  console.log(`   Gesamtbestand Retro-Leads im Workspace: ${initialRetroCount + (options.dryRun ? 0 : totalImported)}`);
  console.log("================================================================================\n");
}

main()
  .catch((err) => {
    console.error("Schwerwiegender Fehler im Batch Runner:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
