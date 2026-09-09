import * as cheerio from "cheerio";
import { normalizeInstagramHandle } from "@/lib/utils";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const STOP_WORDS = [
  "barber", "barbershop", "friseur", "salon", "gmbh", "og", "und", "wien", "vienna", "austria", "at", "the", "by", "x"
];

const BLOCKED_PATTERNS = [
  "instagram.com", "facebook.com", "tiktok.com", "youtube.com", "pinterest.com", "xing.com", "linkedin.com", "yelp.com", "wikipedia.org", "treatwell", "google",
  "firmenabc", "herold", "wko.at", "gelbeseiten", "yellowpages", "cylex", "firmenliste", "1000things", "wien.info", "wien.gv.at", "booking.com", "tripadvisor"
];

function significantWords(venueName: string) {
  return venueName
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.includes(word));
}

function titleMatches(title: string, venueName: string) {
  const words = significantWords(venueName);
  if (words.length === 0) return null;
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  return title.toLowerCase().includes(longest);
}

function safeHostname(value: string): string | null {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function pickResult(links: Array<{ title: string; href: string }>, venueName: string): string | null {
  for (const result of links) {
    const match = result.href.match(/uddg=([^&]+)/);
    const target = match ? decodeURIComponent(match[1]) : result.href;
    const hostname = safeHostname(target);
    if (!hostname) continue;
    if (BLOCKED_PATTERNS.some((pattern) => hostname.includes(pattern))) continue;
    const matches = titleMatches(result.title, venueName);
    if (matches === null || matches) return target.startsWith("http") ? target : `https://${target}`;
  }
  return null;
}

async function searchDuckDuckGo(query: string): Promise<Array<{ title: string; href: string }> | null> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    return $(".result")
      .map((_, element) => {
        const link = $(element).find(".result__a").first();
        return { title: link.text().trim(), href: link.attr("href") ?? "" };
      })
      .get();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchBing(query: string): Promise<Array<{ title: string; href: string }> | null> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=de`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    const links: Array<{ title: string; href: string }> = [];
    $("li.b_algo h2 a, h2 a, a[href^='http']").each((_, element) => {
      const href = $(element).attr("href") ?? "";
      const title = $(element).text().trim();
      if (!href || !title) return;
      if (/bing\.com|microsoft|msn|go\.microsoft|bingj\.com/i.test(href)) return;
      links.push({ title: title.slice(0, 120), href });
    });
    return links;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchFirstExternalUrl(
  query: string,
  options: { venueName?: string } = {},
): Promise<string | null> {
  const venueName = options.venueName ?? query.split(" website")[0] ?? query;
  const sources = [searchDuckDuckGo, searchBing];
  for (const source of sources) {
    const links = await source(query);
    if (!links || links.length === 0) continue;
    const found = pickResult(links, venueName);
    if (found) return found;
  }
  return null;
}


// ============================================================
// Instagram-Profilsuche
// ------------------------------------------------------------
// Bewusst ueber die Suchmaschinen-Treffer, NICHT ueber Instagram
// selbst: Instagram hat keine offene API fuer Fremdprofile, sperrt
// serverseitige Zugriffe und untersagt Scraping. Oeffentliche
// Profile sind aber ohnehin indexiert — das ist der robuste Weg.
// ============================================================

export type InstagramCandidate = {
  handle: string;
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
};

/** Loest den echten Ziel-Link aus einem Suchmaschinen-Treffer heraus. */
function unwrapHref(href: string): string {
  const match = href.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  return href;
}

/**
 * Bewertet, wie gut ein gefundenes Profil zum gesuchten Betrieb passt.
 * Nichts wird automatisch uebernommen — die Konfidenz entscheidet, ob
 * die UI den Treffer vorschlaegt oder zur manuellen Pruefung auffordert.
 */
function rateCandidate(handle: string, title: string, venueName: string): InstagramCandidate["confidence"] {
  const words = significantWords(venueName);
  if (words.length === 0) return "low";

  const flatHandle = handle.replace(/[._]/g, "");
  const flatTitle = title.toLowerCase();
  const hits = words.filter((word) => flatHandle.includes(word) || flatTitle.includes(word));

  if (hits.length === 0) return "low";

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  const handleHasLongest = flatHandle.includes(longest);

  if (handleHasLongest && hits.length >= 2) return "high";
  if (handleHasLongest) return "high";
  if (hits.length >= 2) return "medium";
  return "low";
}

/**
 * Sucht oeffentliche Instagram-Profile zu einem Betrieb.
 * Gibt mehrere Kandidaten zurueck (beste zuerst) und waehlt bewusst
 * keinen davon aus — das entscheidet der Nutzer bzw. die Konfidenz.
 */
export async function searchInstagramProfiles(
  venueName: string,
  city: string,
): Promise<InstagramCandidate[]> {
  const query = `site:instagram.com ${venueName} ${city}`.trim();
  const seen = new Set<string>();
  const candidates: InstagramCandidate[] = [];

  for (const source of [searchDuckDuckGo, searchBing]) {
    const links = await source(query);
    if (!links || links.length === 0) continue;

    for (const result of links) {
      const target = unwrapHref(result.href);
      if (!/instagram\.com/i.test(target)) continue;

      const handle = normalizeInstagramHandle(target);
      if (!handle || seen.has(handle)) continue;
      seen.add(handle);

      candidates.push({
        handle,
        url: `https://www.instagram.com/${handle}`,
        title: result.title,
        confidence: rateCandidate(handle, result.title, venueName),
      });
    }

    // Ein sicherer Treffer reicht — die zweite Suchmaschine sparen wir uns.
    if (candidates.some((candidate) => candidate.confidence === "high")) break;
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return candidates.sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 5);
}
