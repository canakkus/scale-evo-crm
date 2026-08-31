import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeUrl } from "@/lib/utils";

export interface MenuDetectionResult {
  hasMenu: boolean;
  menuUrl: string | null;
  menuSnippet: string | null;
}

const DEFAULT_RESULT: MenuDetectionResult = {
  hasMenu: false,
  menuUrl: null,
  menuSnippet: null,
};

let _geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(key);
  }
  return _geminiClient;
}

/**
 * Scans a restaurant's website for an online menu (HTML page, PDF, or delivery platform link)
 * and uses Gemini to analyze menu availability and provide a short summary snippet.
 */
export async function detectRestaurantMenu(websiteUrl: string): Promise<MenuDetectionResult> {
  const normalized = normalizeUrl(websiteUrl);
  if (!normalized) {
    return { ...DEFAULT_RESULT };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(normalized, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      return { ...DEFAULT_RESULT };
    }

    const contentType = response.headers.get("content-type") || "";
    // If the website itself is a direct PDF menu
    if (contentType.includes("application/pdf") || normalized.toLowerCase().endsWith(".pdf")) {
      return {
        hasMenu: true,
        menuUrl: normalized,
        menuSnippet: "Direkter PDF-Speisekartenlink",
      };
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { ...DEFAULT_RESULT };
    }

    const html = await response.text();
    const $ = cheerio.load(html.slice(0, 1_500_000));
    $("script, style, noscript, svg, iframe").remove();

    const pageTitle = $("title").text().trim();
    const pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);

    const candidateLinks: Array<{ text: string; href: string; isPdf: boolean; isDelivery: boolean }> = [];
    const MENU_PATTERN = /speisekarte|speisen|karte|menü|menu|food|essen|gerichte|dishes|tageskarte|lunch|dinner/i;
    const DELIVERY_PATTERN = /lieferando|wolt|mjam|ubereats|foodora/i;

    $("a").each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let absoluteUrl = href;
      try {
        absoluteUrl = new URL(href, normalized).toString();
      } catch {
        return;
      }

      const isPdf = /\.pdf($|\?)/i.test(absoluteUrl) || /\.pdf/i.test(text);
      const isDelivery = DELIVERY_PATTERN.test(absoluteUrl) || DELIVERY_PATTERN.test(text);
      const isMenuTextOrLink = MENU_PATTERN.test(text) || MENU_PATTERN.test(absoluteUrl);

      if (isPdf || isDelivery || isMenuTextOrLink) {
        // avoid adding duplicate URLs
        if (!candidateLinks.some((l) => l.href === absoluteUrl)) {
          candidateLinks.push({
            text: text.slice(0, 80),
            href: absoluteUrl,
            isPdf,
            isDelivery,
          });
        }
      }
    });

    // If Gemini is available, use Gemini to evaluate text + links accurately
    const gemini = getGeminiClient();
    if (gemini) {
      try {
        const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Du bist ein Restaurant-Analyst. Prüfe anhand des Website-Ausschnitts und der gefundenen Links, ob für dieses Restaurant eine Speisekarte (als HTML-Unterseite, PDF-Download, Lieferdienst-Link wie Wolt/Lieferando oder direkt im Text) vorliegt.

Website-Titel: ${pageTitle}
Website-URL: ${normalized}
Gefundene Menü-/PDF-/Lieferdienst-Links:
${JSON.stringify(candidateLinks.slice(0, 15), null, 2)}

Textauszug der Startseite:
"""
${pageText.slice(0, 2500)}
"""

Antworte AUSSCHLIESSLICH mit gültigem JSON in folgendem Format (keine zusätzlichen Erklärungen, keine Markdown-Codeblöcke):
{
  "hasMenu": true/false,
  "menuUrl": "die beste konkrete URL zur Speisekarte oder PDF oder null",
  "menuSnippet": "Kurze Zusammenfassung in 1-2 Sätzen über das Speisenangebot/Kategorien oder null wenn keine Karte vorliegt"
}`;

        const result = await model.generateContent(prompt);
        const rawResponse = result.response.text().trim();
        const jsonStr = rawResponse.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
        const parsed = JSON.parse(jsonStr);

        let finalMenuUrl = parsed.menuUrl || null;
        if (!finalMenuUrl && candidateLinks.length > 0) {
          const bestCandidate = candidateLinks.find((l) => l.isPdf) || candidateLinks[0];
          finalMenuUrl = bestCandidate.href;
        }

        return {
          hasMenu: Boolean(parsed.hasMenu),
          menuUrl: finalMenuUrl,
          menuSnippet: parsed.menuSnippet ? String(parsed.menuSnippet).slice(0, 300) : null,
        };
      } catch (geminiErr) {
        console.warn("[MenuDetector] Gemini evaluation fallback due to error:", geminiErr);
      }
    }

    // Heuristic Fallback if Gemini failed or is not configured
    const bestCandidate = candidateLinks.find((l) => l.isPdf) || candidateLinks[0];
    if (bestCandidate) {
      return {
        hasMenu: true,
        menuUrl: bestCandidate.href,
        menuSnippet: bestCandidate.isPdf
          ? "PDF-Speisekarte gefunden."
          : bestCandidate.isDelivery
          ? "Lieferdienst-Speisekarte vorhanden."
          : `Online-Speisekarte (${bestCandidate.text || "Link"}).`,
      };
    }

    if (MENU_PATTERN.test(pageText)) {
      return {
        hasMenu: true,
        menuUrl: normalized,
        menuSnippet: "Speisekarte / Gerichte auf der Website erwähnt.",
      };
    }

    return { ...DEFAULT_RESULT };
  } catch (error) {
    console.error("[MenuDetector] Error detecting menu for URL:", websiteUrl, error);
    return { ...DEFAULT_RESULT };
  }
}
