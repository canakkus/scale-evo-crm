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

import { runScrapling } from "./scrapling";

export async function searchFirstExternalUrl(
  query: string,
  options: { venueName?: string } = {},
): Promise<string | null> {
  const venueName = options.venueName ?? query.split(" website")[0] ?? query;
  try {
    const res = await runScrapling("websearch", { query });
    if (res.links && Array.isArray(res.links)) {
      const found = pickResult(res.links, venueName);
      if (found) return found;
    }
  } catch (error) {
    console.error("Scrapling websearch error:", error);
  }
  return null;
}
