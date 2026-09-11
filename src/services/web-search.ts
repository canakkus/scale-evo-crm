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

async function fetchDuckDuckGoLinks(query: string): Promise<Array<{ title: string; href: string }>> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    }).catch(() => null);

    if (!res || !res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: Array<{ title: string; href: string }> = [];
    $(".result").each((_, el) => {
      const linkEl = $(el).find(".result__a");
      const title = linkEl.text().trim();
      const href = linkEl.attr("href") || "";
      if (title && href) links.push({ title, href });
    });
    return links;
  } catch {
    return [];
  }
}

async function fetchBingLinks(query: string): Promise<Array<{ title: string; href: string }>> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5&setlang=de`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    }).catch(() => null);

    if (!res || !res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: Array<{ title: string; href: string }> = [];
    $("li.b_algo h2 a").each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr("href") || "";
      if (title && href) links.push({ title, href });
    });
    return links;
  } catch {
    return [];
  }
}

export async function searchFirstExternalUrl(
  query: string,
  options: { venueName?: string } = {},
): Promise<string | null> {
  const venueName = options.venueName ?? query.split(" website")[0] ?? query;
  try {
    const ddgLinks = await fetchDuckDuckGoLinks(query);
    if (ddgLinks.length > 0) {
      const found = pickResult(ddgLinks, venueName);
      if (found) return found;
    }

    const bingLinks = await fetchBingLinks(query);
    if (bingLinks.length > 0) {
      const found = pickResult(bingLinks, venueName);
      if (found) return found;
    }
  } catch (error) {
    console.error("Web search error:", error);
  }
  return null;
}
