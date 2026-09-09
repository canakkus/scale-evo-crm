import * as cheerio from "cheerio";
import { normalizeInstagramHandle, normalizeUrl } from "@/lib/utils";
import type { InstagramProfile } from "./types";

/**
 * Liest oeffentlich verfuegbare Profildaten best-effort aus.
 *
 * WICHTIG: Instagram stellt fuer Fremdprofile keine offene API bereit und
 * blockt serverseitige Zugriffe zunehmend mit Login-Walls. Dieser Provider
 * ist deshalb bewusst als Best-Effort gebaut:
 *   - Er raet niemals Werte und fuellt keine Luecken.
 *   - Er wirft nach aussen keinen Fehler.
 *   - Was fehlt, bleibt null und `incomplete` wird gesetzt.
 * Die UI zeigt solche Leads als "manuell pruefen" an.
 */
export class InstagramProfileProvider {
  private readonly timeoutMs: number;

  constructor(timeoutMs = Number(process.env.ENRICHMENT_TIMEOUT_MS ?? 12000)) {
    this.timeoutMs = timeoutMs;
  }

  private empty(handle: string, note: string): InstagramProfile {
    return {
      handle,
      url: `https://www.instagram.com/${handle}`,
      bio: null,
      displayName: null,
      followerCount: null,
      followingCount: null,
      postCount: null,
      externalUrl: null,
      isBusinessAccount: null,
      isPrivate: null,
      daysSinceLastPost: null,
      externalUrlKnown: false,
      incomplete: true,
      note,
    };
  }

  async fetchProfile(input: string): Promise<InstagramProfile> {
    const handle = normalizeInstagramHandle(input);
    if (!handle) return this.empty(String(input ?? "").slice(0, 40), "Kein gültiges Instagram-Handle.");

    const url = `https://www.instagram.com/${handle}/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": process.env.ENRICHMENT_USER_AGENT ?? "ScaleEvoCRM/3.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return this.empty(handle, `Profil nicht abrufbar (HTTP ${response.status}).`);
      }

      const html = (await response.text()).slice(0, 1_500_000);

      // Login-Wall erkennen: dann sind keine belastbaren Daten da.
      if (/loginForm|"is_logged_in":false.*accounts\/login/i.test(html) && !/og:description/i.test(html)) {
        return this.empty(handle, "Instagram verlangt Login — Profil manuell prüfen.");
      }

      return this.parse(handle, url, html);
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "Zeitüberschreitung" : "nicht erreichbar";
      return this.empty(handle, `Profil ${reason} — manuell prüfen.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parse(handle: string, url: string, html: string): InstagramProfile {
    const $ = cheerio.load(html);
    const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";

    // Ausgeloggt liefert Instagram nur die og-Meta-Tags. Bio, Link-in-Bio,
    // Accounttyp und Post-Datum stehen im JSON-Payload, der nur mit Login
    // ausgeliefert wird. Ist er nicht da, sind diese Felder UNBEKANNT —
    // nicht "nicht vorhanden". Der Unterschied ist fuer das Scoring
    // entscheidend, deshalb wird er hier sauber getrennt.
    const hasProfileJson = /"biography"\s*:/.test(html);

    const counts = this.parseCounts(ogDescription);
    const bio = hasProfileJson ? this.parseBio(ogDescription) : null;
    const displayName = this.parseDisplayName(ogTitle);
    const externalUrl = this.parseExternalUrl(html);
    const externalUrlKnown = hasProfileJson || externalUrl !== null;

    const isPrivate = /"is_private":\s*true/i.test(html)
      ? true
      : /"is_private":\s*false/i.test(html)
        ? false
        : null;

    const isBusinessAccount = /"is_business_account":\s*true/i.test(html)
      ? true
      : /"is_business_account":\s*false/i.test(html)
        ? false
        : null;

    const daysSinceLastPost = this.parseDaysSinceLastPost(html);

    const hasAnything = counts.followerCount !== null || displayName !== null;
    const incomplete = !hasAnything || !hasProfileJson;

    const note = !hasAnything
      ? "Keine Profildaten auslesbar — manuell prüfen."
      : !hasProfileJson
        ? "Nur Reichweite auslesbar. Bio, Link-in-Bio und letzter Post brauchen einen Blick aufs Profil."
        : null;

    return {
      handle,
      url,
      bio,
      displayName,
      followerCount: counts.followerCount,
      followingCount: counts.followingCount,
      postCount: counts.postCount,
      externalUrl,
      externalUrlKnown,
      isBusinessAccount,
      isPrivate,
      daysSinceLastPost,
      incomplete,
      note,
    };
  }

  /**
   * og:description sieht typischerweise so aus:
   * "2,345 Followers, 187 Following, 96 Posts - See Instagram photos ... (@handle)"
   * Auch die deutsche Variante ("Follower", "Beiträge") wird abgedeckt.
   */
  private parseCounts(description: string) {
    const num = (raw: string | undefined): number | null => {
      if (!raw) return null;
      const cleaned = raw.trim().toLowerCase().replace(/\s/g, "");
      const multiplier = cleaned.endsWith("k") ? 1_000 : cleaned.endsWith("m") ? 1_000_000 : 1;
      const digits = cleaned.replace(/[km]$/, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
      const value = parseFloat(digits);
      return Number.isFinite(value) ? Math.round(value * multiplier) : null;
    };

    const followers = description.match(/([\d.,]+\s*[kKmM]?)\s*(?:Followers?|Follower)/i)?.[1];
    const following = description.match(/([\d.,]+\s*[kKmM]?)\s*(?:Following|Gefolgt)/i)?.[1];
    const posts = description.match(/([\d.,]+\s*[kKmM]?)\s*(?:Posts?|Beiträge?)/i)?.[1];

    return {
      followerCount: num(followers),
      followingCount: num(following),
      postCount: num(posts),
    };
  }

  /**
   * Aus og:description laesst sich in der Regel KEINE echte Bio gewinnen —
   * dort steht nur Instagram-Boilerplate ("Sieh dir Instagram-Fotos ... an"
   * bzw. "See Instagram photos and videos from ..."). Solche Texte werden
   * verworfen, damit sie nicht als Aufhaenger in eine Nachricht wandern.
   */
  private parseBio(description: string): string | null {
    const afterDash = description.split(/\s[-–—]\s/).slice(1).join(" - ");
    const cleaned = afterDash.trim();
    if (cleaned.length < 3) return null;

    const BOILERPLATE =
      /^(?:see instagram photos and videos from|sieh dir instagram-fotos und -videos von|schau dir instagram-fotos)/i;
    if (BOILERPLATE.test(cleaned)) return null;

    return cleaned.slice(0, 500);
  }

  private parseDisplayName(ogTitle: string): string | null {
    const name = ogTitle.split("(@")[0]?.trim();
    return name && name.length >= 2 ? name.slice(0, 120) : null;
  }

  private parseExternalUrl(html: string): string | null {
    const raw =
      html.match(/"external_url":\s*"([^"]+)"/)?.[1] ??
      html.match(/"external_lynx_url":\s*"([^"]+)"/)?.[1];
    if (!raw) return null;
    try {
      const decoded = raw.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      return normalizeUrl(decoded);
    } catch {
      return null;
    }
  }

  private parseDaysSinceLastPost(html: string): number | null {
    const timestamps = [...html.matchAll(/"taken_at_timestamp":\s*(\d{9,11})/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (timestamps.length === 0) return null;

    const newest = Math.max(...timestamps) * 1000;
    const days = Math.floor((Date.now() - newest) / 86_400_000);
    return days >= 0 && days < 36_500 ? days : null;
  }
}
