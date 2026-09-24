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
    // DuckDuckGo beantwortet Bot-Verdacht mit HTTP 202 und einer Captcha-Seite
    // ohne Treffer. Das ist "nicht beantwortet", nicht "keine Treffer".
    if (!response.ok || response.status === 202) return null;
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
  return (await searchFirstExternalUrlDetailed(query, options)).url;
}

/**
 * Wie `searchFirstExternalUrl`, unterscheidet aber "nichts gefunden" von
 * "keine Suchmaschine hat geantwortet" (Block, Timeout, HTTP-Fehler).
 * `failed` ist nur true, wenn KEINE Quelle eine Trefferliste geliefert hat.
 */
export async function searchFirstExternalUrlDetailed(
  query: string,
  options: { venueName?: string } = {},
): Promise<{ url: string | null; failed: boolean }> {
  const venueName = options.venueName ?? query.split(" website")[0] ?? query;
  let answered = false;
  for (const source of [searchDuckDuckGo, searchBing]) {
    const links = await source(query);
    if (links === null) continue;
    answered = true;
    if (links.length === 0) continue;
    const found = pickResult(links, venueName);
    if (found) return { url: found, failed: false };
  }
  return { url: null, failed: !answered };
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
 * Branchen-Gattungswoerter. Sie beschreiben, WAS ein Betrieb ist, nicht
 * WER er ist — "Pizzeria Da Mario" darf nicht auf jedes @pizzeria_xyz
 * passen. Nur fuer die Instagram-Zuordnung; die Website-Suche
 * (`titleMatches`) bleibt bewusst unveraendert.
 */
const TRADE_STOP_WORDS = new Set([
  "pizzeria", "pizza", "restaurant", "ristorante", "trattoria", "osteria", "cafe", "caffe", "kaffee", "kaffeehaus",
  "bar", "bistro", "beisl", "beisel", "gasthaus", "gasthof", "wirtshaus", "heuriger", "imbiss", "kebab", "kebap",
  "doener", "doner", "burger", "sushi", "asia", "nagelstudio", "nails", "nail", "kosmetik", "kosmetikstudio",
  "beauty", "beautysalon", "studio", "hair", "haar", "hairstyling", "coiffeur", "coiffure", "frisoer", "frisur",
  "spa", "wellness", "massage", "massagen", "lashes", "lash", "wimpern", "brows", "style", "styling", "team",
  "atelier", "official", "shop", "lounge",
]);

/** Umlaute und Akzente vereinheitlichen: "Café" -> "cafe", "Müller" -> "mueller". */
function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Woerter, die einen Betrieb IDENTIFIZIEREN — ohne Rechtsform, Ort und Gattung. */
function identityWords(venueName: string): string[] {
  return foldText(venueName)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.includes(word) && !TRADE_STOP_WORDS.has(word));
}

/** Handle-Bestandteile ohne Aussagekraft ueber die Identitaet ("salonmira_wien"). */
const HANDLE_NOISE = new Set(["wien", "vienna", "austria", "at", "official", "offiziell", "the"]);
/** Rechtsformen fliegen aus dem Namen, bevor Handles gegen Namensfolgen verglichen werden. */
const LEGAL_WORDS = new Set(["gmbh", "og", "kg", "eu", "ug", "ltd"]);

/**
 * Fuellwoerter, die in einem Handle neben dem Namen stehen duerfen, ohne dass
 * es ein anderer Betrieb waere: Gattung ("nails", "friseur"), Ort ("wien"),
 * Floskeln ("official"). Kurze Woerter (< 3 Zeichen) nur als eigenes Token,
 * nie als Stueck innerhalb eines Tokens — sonst waere "miraat" = mira + at.
 */
const FILLER_WORDS = new Set([...TRADE_STOP_WORDS, ...STOP_WORDS, ...HANDLE_NOISE]);

/**
 * Wiener Postleitzahl als eigenes Token ("pizzeria.damario.1070") ist ein
 * Bezirk, kein fremdes Wort. Alle anderen Ziffern ("mario.rossi.88",
 * "sandra.meier.1990") sind typisch fuer Privatprofile und zaehlen als fremd.
 */
const VIENNA_POSTCODE = /^1(0[1-9]|1\d|2[0-3])0$/;

/**
 * Zerlegt ein Handle-Token vollstaendig in Namens- und Fuellwoerter und gibt
 * die dabei abgedeckten Identitaetswoerter zurueck (die Zerlegung mit der
 * groessten Abdeckung). null = das Token enthaelt etwas Fremdes:
 * "mariahilf" = maria + "hilf", "supermario" = "super" + mario, "annabelle" = anna + "belle".
 */
function explainToken(token: string, pieces: string[], identity: Set<string>): Set<string> | null {
  const memo = new Map<number, Set<string> | null>();
  const walk = (index: number): Set<string> | null => {
    if (index === token.length) return new Set();
    if (memo.has(index)) return memo.get(index)!;
    let best: Set<string> | null = null;
    for (const piece of pieces) {
      if (!token.startsWith(piece, index)) continue;
      const rest = walk(index + piece.length);
      if (!rest) continue;
      const covered = new Set(rest);
      if (identity.has(piece)) covered.add(piece);
      if (!best || covered.size > best.size) best = covered;
    }
    memo.set(index, best);
    return best;
  };
  return walk(0);
}

/**
 * Bewertet, wie gut ein gefundenes Profil zum gesuchten Betrieb passt.
 * Nichts wird automatisch uebernommen — die Konfidenz entscheidet, ob
 * die UI den Treffer vorschlaegt oder zur manuellen Pruefung auffordert.
 *
 * "high" NUR, wenn das Handle vollstaendig aus dem Betrieb erklaerbar ist:
 * Jedes Token (getrennt an . _ und zwischen Buchstaben/Ziffern) laesst sich
 * restlos in Namenswoerter und Fuellwoerter zerlegen, und zusammen decken sie
 * ALLE Identitaetswoerter ab. "@salon.mira", "@miranails", "@hairbyana",
 * "@pizzeria.damario.1070" -> high. Bleibt irgendwo ein fremder Rest
 * ("mariahilf", "mirabella", "mario.rossi.88"), ist es hoechstens "medium" —
 * also Auswahl durch den Nutzer. Lieber ein Klick mehr als ein falsches Profil.
 *
 * Besteht der Name NUR aus Gattungswoertern ("Pizzeria Restaurant"), gibt
 * es kein identifizierendes Wort und damit hoechstens "low".
 */
function rateCandidate(handle: string, title: string, venueName: string): InstagramCandidate["confidence"] {
  const words = identityWords(venueName);
  if (words.length === 0) return "low";

  const identity = new Set(words);
  const nameWords = foldText(venueName).split(/[^a-z0-9]+/).filter((word) => word && !LEGAL_WORDS.has(word));
  const pieces = [...new Set([...nameWords, ...[...FILLER_WORDS].filter((word) => word.length >= 3)])];

  const tokens = handle.split(/[._]+/).flatMap((part) => part.match(/\d+|[a-z]+/g) ?? []);
  const covered = new Set<string>();
  let explained = tokens.length > 0;
  for (const token of tokens) {
    if (FILLER_WORDS.has(token) || VIENNA_POSTCODE.test(token)) continue;
    const result = /^\d+$/.test(token) ? null : explainToken(token, pieces, identity);
    if (!result) {
      explained = false;
      break;
    }
    result.forEach((word) => covered.add(word));
  }

  if (explained && words.every((word) => covered.has(word))) return "high";

  const flatHandle = tokens.filter((token) => !HANDLE_NOISE.has(token)).join("");
  const flatTitle = foldText(title);
  const inHandle = words.some((word) => flatHandle.includes(word));
  const hits = words.filter((word) => flatHandle.includes(word) || flatTitle.includes(word));
  if (inHandle || hits.length >= 2) return "medium";
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
  return (await searchInstagramProfilesDetailed(venueName, city)).candidates;
}

/**
 * Wie `searchInstagramProfiles`, meldet aber zusaetzlich, ob die Suche
 * ueberhaupt beantwortet wurde. `failed: true` heisst: BEIDE Suchmaschinen
 * haben blockiert oder nicht geantwortet — das ist "unbekannt", nicht
 * "kein Profil". Hat eine Maschine eine (auch leere) Liste geliefert,
 * gilt die Suche als beantwortet.
 */
export async function searchInstagramProfilesDetailed(
  venueName: string,
  city: string,
): Promise<{ candidates: InstagramCandidate[]; failed: boolean }> {
  const query = `site:instagram.com ${venueName} ${city}`.trim();
  const seen = new Set<string>();
  const candidates: InstagramCandidate[] = [];
  let answered = false;

  for (const source of [searchDuckDuckGo, searchBing]) {
    const links = await source(query);
    if (links === null) continue;
    answered = true;
    if (links.length === 0) continue;

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
  return {
    candidates: candidates.sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 5),
    failed: !answered,
  };
}
