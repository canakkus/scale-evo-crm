import * as cheerio from "cheerio";
import type { TreatwellVenue } from "@/lib/lead-scout-types";

export type { TreatwellVenue };

// Map from category name to { slug, useBeiPrefix }
// Treatwell uses "bei-{slug}" for some categories, but not all.
// Test: https://www.treatwell.at/orte/{bei-?slug}/in-{city}-at/
export const TREATWELL_CATEGORIES: Record<string, { slug: string; prefix: boolean }> = {
  Barber:         { slug: "barber-shop",                              prefix: true  },
  Friseur:        { slug: "friseur",                                  prefix: true  },
  "Spa & Wellness": { slug: "spa",                                    prefix: true  },
  Nagelstudio:    { slug: "behandlung-gruppe-nagel/angebot-typ-lokal", prefix: false },
  Kosmetik:       { slug: "kosmetik",                                 prefix: false },
  Massage:        { slug: "massage",                                  prefix: false },
  Wimpern:        { slug: "wimpernverlaengerung",                     prefix: false },
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type TreatwellSearchResult = {
  venues: TreatwellVenue[];
  url: string;
  error?: string;
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function searchTreatwell(
  category: string,
  city: string,
  options: { timeoutMs?: number } = {},
): Promise<TreatwellSearchResult> {
  const entry = TREATWELL_CATEGORIES[category];
  const slug = entry ? entry.slug : slugify(category);
  const useBei = entry ? entry.prefix : true;
  const prefix = useBei ? "bei-" : "";
  const url = `https://www.treatwell.at/orte/${prefix}${slug}/in-${slugify(city)}-at/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { venues: [], url, error: `Treatwell antwortete mit HTTP ${response.status}.` };
    }
    const html = await response.text();
    return { venues: parseTreatwellHtml(html), url };
  } catch (error) {
    return {
      venues: [],
      url,
      error: error instanceof Error ? error.message : "Treatwell konnte nicht geladen werden.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseTreatwellHtml(html: string): TreatwellVenue[] {
  const $ = cheerio.load(html);
  const venues: TreatwellVenue[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text();
    if (!text.includes("itemListElement")) return;

    let data: { itemListElement?: unknown[] };
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!Array.isArray(data.itemListElement)) return;

    for (const entry of data.itemListElement) {
      const item = (entry as { item?: Record<string, unknown> })?.item ?? (entry as Record<string, unknown>);
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) continue;

      const aggregateRating = (item.aggregateRating ?? {}) as Record<string, unknown>;
      const address = (item.address ?? {}) as Record<string, unknown>;
      const ratingValue = aggregateRating.ratingValue;
      const reviewCountValue = aggregateRating.reviewCount;

      const streetAddress = typeof address.streetAddress === "string" ? address.streetAddress.trim() : null;
      const locality = typeof address.addressLocality === "string" ? address.addressLocality.trim() : null;
      const postalCode = typeof address.postalCode === "string" ? address.postalCode.trim() : null;
      const treatwellUrl =
        typeof item["@id"] === "string" ? item["@id"] : typeof item.url === "string" ? item.url : "";

      const parsedRating = typeof ratingValue === "number" ? ratingValue : parseFloat(String(ratingValue));
      const parsedReviews =
        typeof reviewCountValue === "number" ? reviewCountValue : parseInt(String(reviewCountValue), 10);

      venues.push({
        key: treatwellUrl || `${name}-${streetAddress ?? ""}`,
        name,
        source: "treatwell",
        treatwellUrl: treatwellUrl || null,
        googleMapsUri: null,
        rating: Number.isFinite(parsedRating) ? parsedRating : null,
        reviewCount: Number.isFinite(parsedReviews) ? parsedReviews : null,
        streetAddress,
        locality,
        postalCode,
        addressLine: [streetAddress, postalCode, locality].filter(Boolean).join(", "),
        phone: null,
        website: null,
      });
    }
  });

  return venues;
}
