import * as cheerio from "cheerio";
import { normalizeUrl } from "@/lib/utils";
import type { AuditResult } from "./types";

const EMPTY_RESULT: Omit<AuditResult, "url" | "https"> = {
  reachable: false,
  statusCode: null,
  responseTimeMs: null,
  hasViewport: false,
  hasTitle: false,
  hasMetaDescription: false,
  hasImprint: false,
  hasPrivacy: false,
  hasConsent: false,
  hasContact: false,
  hasPhone: false,
  hasEmail: false,
  hasSocials: false,
  hasCta: false,
  hasBooking: false,
  hasMenu: false,
  menuUrl: null,
  menuIsPdf: false,
  findings: [],
  error: null,
  extracted: {},
};

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0]?.trim();
}

function textContains(text: string, terms: string[]) {
  const value = text.toLowerCase();
  return terms.some((term) => value.includes(term));
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class WebsiteAuditProvider {
  async analyze(input: string): Promise<AuditResult> {
    const normalized = normalizeUrl(input);
    const url = normalized ?? (input.startsWith("http") ? input : `https://${input}`);
    const https = url.startsWith("https://");
    const startedAt = performance.now();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      }).catch((err) => {
        // If HTTPS fails (e.g. invalid certificate), attempt HTTP fallback
        if (url.startsWith("https://")) {
          const httpUrl = url.replace(/^https:\/\//, "http://");
          return fetch(httpUrl, {
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow",
            cache: "no-store",
            signal: AbortSignal.timeout(2500),
          }).catch(() => null);
        }
        return null;
      });

      const responseTimeMs = Math.round(performance.now() - startedAt);

      if (!response) {
        return {
          ...EMPTY_RESULT,
          url,
          https,
          reachable: false,
          statusCode: 0,
          responseTimeMs,
          error: "Timeout oder Verbindungsfehler beim Laden der Website.",
          findings: ["Website nicht erreichbar oder Server antwortet nicht zeitnah."],
        };
      }

      const statusCode = response.status;
      const isOk = statusCode >= 200 && statusCode < 400;
      const html = (await response.text().catch(() => "")).slice(0, 2_000_000);
      const $ = cheerio.load(html);
      $("script, style, noscript, svg").remove();
      const pageText = $("body").text().replace(/\s+/g, " ").trim();
      const allLinks = $("a")
        .map((_, element) => ({
          text: $(element).text().trim().toLowerCase(),
          href: $(element).attr("href") ?? "",
        }))
        .get();
      const linkHaystack = allLinks.map((link) => `${link.text} ${link.href}`).join(" ").toLowerCase();

      const MENU_WORDS = /speisekarte|speisen|karte|menü|menu|food|essen|gerichte|dishes|menu_card/i;
      const menuLinks = allLinks.filter((link) => {
        const text = link.text.toLowerCase();
        const href = link.href.toLowerCase();
        if (!href || href.startsWith("#") || /javascript:/.test(href)) return false;
        if (/^(haupt)?men(ü|u)$/.test(text) && !/\.(pdf|jpg|jpeg|png|webp|svg)$/.test(href)) return false;
        return MENU_WORDS.test(text) || MENU_WORDS.test(href);
      });
      const menuPdfLinks = menuLinks.filter((link) => /\.pdf($|\?)/i.test(link.href) || /\.pdf/i.test(link.text));
      const menuIsPdf = menuPdfLinks.length > 0 && menuLinks.length === menuPdfLinks.length;
      let menuUrl: string | null = null;
      try {
        menuUrl = menuLinks[0]?.href ? new URL(menuLinks[0].href, url).toString() : null;
      } catch {
        menuUrl = null;
      }
      const phone = $("a[href^='tel:']").first().attr("href")?.replace(/^tel:/, "") ??
        firstMatch(pageText, /(?:\+43|0043|0)[\s()/-]*(?:\d[\s()/-]*){7,13}/);
      const email = $("a[href^='mailto:']").first().attr("href")?.replace(/^mailto:/, "").split("?")[0] ??
        firstMatch(pageText, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
      const instagram = allLinks.find((link) => /instagram\.com/i.test(link.href))?.href;
      const title = $("title").first().text().trim();
      const address =
        $("address").first().text().replace(/\s+/g, " ").trim() ||
        $("[itemprop='address']").first().text().replace(/\s+/g, " ").trim() ||
        undefined;
      const companyName =
        $("meta[property='og:site_name']").attr("content")?.trim() ||
        $("meta[property='og:title']").attr("content")?.trim() ||
        title.split(/[|\-–]/)[0]?.trim() ||
        undefined;

      const result: AuditResult = {
        url,
        reachable: isOk,
        statusCode: statusCode,
        https: (response.url || url).startsWith("https://"),
        responseTimeMs,
        hasViewport: Boolean($("meta[name='viewport']").attr("content")),
        hasTitle: Boolean(title),
        hasMetaDescription: Boolean($("meta[name='description']").attr("content")?.trim()),
        hasImprint: textContains(linkHaystack, ["impressum", "imprint"]),
        hasPrivacy: textContains(linkHaystack, ["datenschutz", "privacy"]),
        hasConsent: textContains(`${pageText} ${html.slice(0, 100_000)}`, [
          "cookie consent",
          "cookie-einstellungen",
          "cookie settings",
          "consent-manager",
          "cookiebot",
          "usercentrics",
          "borlabs",
        ]),
        hasContact: textContains(linkHaystack, ["kontakt", "contact", "anfrage"]),
        hasPhone: Boolean(phone),
        hasEmail: Boolean(email),
        hasSocials: Boolean(instagram || /facebook\.com|linkedin\.com|tiktok\.com/i.test(linkHaystack)),
        hasCta: textContains(`${pageText} ${linkHaystack}`, [
          "termin buchen",
          "jetzt anfragen",
          "kontakt aufnehmen",
          "angebot anfordern",
          "kostenlos beraten",
          "reservieren",
        ]),
        hasBooking: textContains(linkHaystack, [
          "calendly",
          "termin",
          "booking",
          "book now",
          "reservieren",
        ]),
        hasMenu: menuLinks.length > 0,
        menuUrl,
        menuIsPdf,
        findings: [],
        error: isOk ? null : `HTTP-Status ${statusCode}`,
        extracted: { companyName, phone, email, address, instagram },
      };

      result.findings = buildFindings(result);
      return result;
    } catch (error) {
      return {
        ...EMPTY_RESULT,
        url,
        https,
        findings: ["Website nicht erreichbar – URL und Erreichbarkeit manuell prüfen."],
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      };
    }
  }
}

export function buildFindings(result: AuditResult) {
  const findings: string[] = [];
  if (!result.reachable) findings.push("Website nicht erreichbar.");
  if (!result.https) findings.push("Kein HTTPS erkannt.");
  if (!result.hasViewport) findings.push("Kein Mobile Viewport erkannt.");
  if (!result.hasTitle) findings.push("Kein Seitentitel erkannt.");
  if (!result.hasMetaDescription) findings.push("Keine Meta Description erkannt.");
  if (!result.hasImprint) findings.push("Kein Impressums-Link erkannt.");
  if (!result.hasPrivacy) findings.push("Kein Datenschutz-Link erkannt.");
  if (!result.hasConsent) findings.push("Cookie-Consent konnte nicht erkannt werden.");
  if (!result.hasContact && !result.hasPhone && !result.hasEmail) findings.push("Keine klare Kontaktmöglichkeit erkannt.");
  if (!result.hasCta) findings.push("Kein klarer Call-to-Action erkannt.");
  if (!result.hasBooking) findings.push("Keine Online-Terminbuchung erkannt.");
  if (result.hasMenu && result.menuIsPdf) findings.push("Speisekarte nur als PDF.");
  if (!result.hasMenu) findings.push("Keine Speisekarte erkannt.");
  if ((result.responseTimeMs ?? 0) > 2500) findings.push(`Langsame Server-Antwort (${result.responseTimeMs} ms).`);
  return findings;
}
