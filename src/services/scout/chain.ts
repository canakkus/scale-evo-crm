import type { ChainInfo } from "@/lib/lead-scout-types";
import { hasSolidWebsite } from "@/services/instagram/enrichment";
import { normalizeName } from "@/services/dedup";

/**
 * ============================================================
 * KETTEN-ERKENNUNG (gratis, nur aus vorhandenen Daten)
 * ============================================================
 * Ketten sind fuer uns keine Zielgruppe: die Entscheidung faellt
 * nicht im Laden. Erkannt wird ein VERDACHT mit Begruendung — die
 * UI zeigt den Grund an, statt still auszusortieren.
 *
 * Signale:
 *  1. Gleicher Markenname mehrfach im Ergebnis ("Klipp - Wien Mitte",
 *     "Klipp Mariahilf" -> beide "klipp").
 *  2. Gleiche eigene Website-Domain mehrfach im Ergebnis.
 *  3. Standort-Pfad in der Website (/salons/wien-1060, /filialen/…).
 *  4. Kurze, kuratierte Liste bekannter Ketten in Oesterreich.
 *
 * Bewusst konservativ: Buchungsplattformen, Baukaesten und Social-
 * Links teilen sich Domains ueber viele unabhaengige Betriebe
 * (booksy.com/…, sites.google.com/…) und zaehlen deshalb NICHT.
 * ============================================================
 */

const KNOWN_CHAINS = [
  "klipp", "douglas", "marionnaud", "hairfree", "wax in the city", "bundy bundy",
  "mcdonald", "burger king", "kfc", "subway", "pizza hut", "domino s", "five guys", "le burger",
  "vapiano", "l osteria", "nordsee", "wienerwald", "swing kitchen", "dean david",
  "starbucks", "coffeeshop company", "tchibo", "stroeck", "backwerk",
];
const KNOWN_CHAIN_PATTERN = new RegExp(`(?:^| )(${KNOWN_CHAINS.join("|")})(?: |$)`);

/** Domains, die sich viele unabhaengige Betriebe teilen — kein Kettensignal. */
const SHARED_PLATFORM_HOST =
  /(booksy|fresha|planity|shore\.com|salonized|treatwell|studiobookr|phorest|timify|etermin|calendly|setmore|squareup|square\.site|wixsite|jimdo|business\.site|sites\.google|webnode|weebly|godaddysites|lieferando|wolt|mjam|foodora|opentable|thefork|quandoo|resmio|tripadvisor|facebook|instagram|linktr|google\.)/i;

/** Pfad mit Unterseite pro Standort. "/standort" allein (Anfahrt-Seite) zaehlt nicht. */
const LOCATION_PATH = /\/(filialen?|standorte?|salons|locations?|stores?|studios|filialfinder)\/[^/?#]+/i;

const CITY_NOISE = new Set(["wien", "vienna", "austria", "oesterreich", "filiale", "city", "center", "zentrum"]);

/**
 * Gattungswoerter. "Hair Studio" und "Hair Studio" sind zwei verschiedene
 * Salons, keine Kette — ohne ein unterscheidendes Wort gibt es keinen Schluessel.
 */
const TRADE_WORDS = new Set([
  "salon", "studio", "friseur", "frisoer", "hair", "haar", "beauty", "kosmetik", "kosmetikstudio", "nails", "nail",
  "nagelstudio", "barber", "barbershop", "pizzeria", "pizza", "restaurant", "ristorante", "cafe", "bar", "bistro",
  "imbiss", "kebab", "sushi", "asia", "spa", "massage", "wellness", "lounge", "style", "styling", "team", "atelier",
]);

/** Markenschluessel: Name vor Trennzeichen, ohne Ort/Bezirk/Ziffern. */
export function brandKey(name: string, city: string): string | null {
  const head = name.split(/\s[-–|·]\s|,/)[0] ?? name;
  const cityTokens = new Set(normalizeName(city).split(" ").filter(Boolean));
  const tokens = normalizeName(head)
    .split(" ")
    .filter((token) => token && !/^\d+$/.test(token) && !CITY_NOISE.has(token) && !cityTokens.has(token));
  if (!tokens.some((token) => token.length >= 3 && !TRADE_WORDS.has(token))) return null;
  return tokens.join(" ");
}

/** Hostname einer belastbaren, NICHT geteilten Website — sonst null. */
export function chainDomainOf(website: string | null | undefined): string | null {
  if (!website || !hasSolidWebsite(website)) return null;
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase();
    return SHARED_PLATFORM_HOST.test(host) ? null : host;
  } catch {
    return null;
  }
}

export type ChainContext = {
  city: string;
  nameCounts: Map<string, number>;
  domainCounts: Map<string, number>;
};

/**
 * Zaehlt ueber EINDEUTIGE Betriebe. Wer die Liste vorher nicht
 * dedupliziert, macht aus einem Salon, der in zwei "Alle"-Einzelsuchen
 * auftaucht, faelschlich eine Kette.
 */
export function buildChainContext(venues: Array<{ name: string; website: string | null }>, city: string): ChainContext {
  const nameCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  for (const venue of venues) {
    const key = brandKey(venue.name, city);
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    const domain = chainDomainOf(venue.website);
    if (domain) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  return { city, nameCounts, domainCounts };
}

export function detectChain(venue: { name: string; website: string | null }, context: ChainContext): ChainInfo {
  const reasons: string[] = [];

  const known = normalizeName(venue.name).match(KNOWN_CHAIN_PATTERN)?.[1];
  if (known) reasons.push(`bekannte Kette (${venue.name.split(/\s[-–|·]\s|,/)[0]?.trim() || known})`);

  const domain = chainDomainOf(venue.website);
  const domainCount = domain ? (context.domainCounts.get(domain) ?? 0) : 0;
  if (domain && domainCount >= 2) reasons.push(`gleiche Website wie ${domainCount - 1} weitere (${domain})`);

  if (domain && venue.website) {
    try {
      const path = new URL(venue.website.startsWith("http") ? venue.website : `https://${venue.website}`).pathname;
      const match = path.match(LOCATION_PATH);
      if (match) reasons.push(`Standort-Seite auf der Website (/${match[1]}/…)`);
    } catch {
      // Ungueltige URL ist kein Kettensignal.
    }
  }

  // Gleicher Name: ab 3 Treffern allein ausreichend. Bei genau 2 nur als
  // Stuetze eines anderen Signals — zwei unabhaengige "Pizzeria Italia"
  // in einer Stadt sind realistisch, drei kaum.
  const key = brandKey(venue.name, context.city);
  const nameCount = key ? (context.nameCounts.get(key) ?? 0) : 0;
  if (nameCount >= 3 || (nameCount === 2 && reasons.length > 0)) {
    reasons.unshift(`${nameCount}× im Ergebnis`);
  }

  return { suspected: reasons.length > 0, reasons };
}
