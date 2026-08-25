import * as cheerio from "cheerio";

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
