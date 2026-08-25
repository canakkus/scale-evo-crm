import type { Lead } from "@prisma/client";
import { normalizeUrl } from "@/lib/utils";

export type MatchConfidence = "high" | "medium" | "low";

export type DuplicateCandidate = Pick<
  Lead,
  "id" | "companyName" | "website" | "phone" | "email" | "instagram" | "address" | "city" | "googleMapsUrl" | "treatwellUrl"
>;

export type DuplicateInput = Partial<DuplicateCandidate>;

export type DuplicateMatch = {
  lead: DuplicateCandidate;
  score: number;
  confidence: MatchConfidence;
  reasons: string[];
};

const UMLAUT_MAP: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

const LEGAL_FORMS =
  /\b(gmbh\s*&\s*co\.?\s*k?g|gmbh|e\.?\s*u\.?|e\.?\s*k\.?|e\.?\s*v\.?|og|kg|ug|gbr|ltd\.?|inc\.?|llc|sa|sarl|ag|co\.?)\b/g;

const GENERIC_NAME_TOKENS = new Set([
  "salon", "studio", "atelier", "styling", "style", "team", "the", "der", "die", "das", "und", "and", "of", "by", "fur", "pro"
]);

const NAME_SYNONYMS: Record<string, string> = {
  frisoer: "friseur", friseur: "friseur", friseure: "friseur", coiffeur: "friseur", coiffeure: "friseur", coiffure: "friseur", hairdresser: "friseur",
  haar: "hair", hair: "hair", hairs: "hair",
  barbier: "barber", barbershop: "barber", barbers: "barber", barber: "barber",
  beautysalon: "beauty", beauty: "beauty", kosmetik: "beauty", kosmetikstudio: "beauty",
  nagelstudio: "nails", nagel: "nails", nailart: "nails", nails: "nails",
  massage: "massage", massagestudio: "massage",
  spa: "spa", wellness: "spa",
};

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(LEGAL_FORMS, " ")
    .replace(/[äöüß]/g, (char) => UMLAUT_MAP[char] ?? char)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .map((token) => NAME_SYNONYMS[token] ?? token)
    .filter((token) => token.length >= 2 && !GENERIC_NAME_TOKENS.has(token));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLength = Math.max(na.length, nb.length);
  const lev = 1 - levenshtein(na, nb) / maxLength;
  if (lev >= 0.85 && maxLength >= 10) return Math.max(0.75, lev);

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const intersection = ta.filter((token) => tb.includes(token));
  const union = new Set([...ta, ...tb]).size;
  const jaccard = intersection.length / union;
  if (jaccard >= 0.66) return jaccard;
  return intersection.length >= 1 ? Math.min(0.4, jaccard + 0.1) : 0;
}

export function normalizeStreet(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUT_MAP[char] ?? char)
    .replace(/str\.?\b/g, "strasse")
    .replace(/\bg\.\b/g, "gasse")
    .replace(/pl\.?\b/g, "platz")
    .replace(/wg\.?\b/g, "weg")
    .replace(/al\.?\b/g, "allee")
    .replace(/\b\d{4,5}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUT_MAP[char] ?? char)
    .replace(/\b(österreich|austria|deutschland|germany|schweiz|switzerland)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function streetParts(value: string): { base: string; number: string | null } {
  const normalized = normalizeStreet(value.split(",")[0] ?? value);
  const match = normalized.match(/^(.+?)\s+(\d+[a-z]?)$/);
  if (match) return { base: match[1], number: match[2] };
  return { base: normalized, number: null };
}

function phoneDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "").replace(/^00/, "");
}

function domainOf(value?: string | null): string {
  if (!value) return "";
  try {
    return new URL(normalizeUrl(value) ?? value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function instagramHandle(value?: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(normalizeUrl(value) ?? value);
    if (!url.hostname.replace(/^www\./, "").endsWith("instagram.com")) return "";
    return url.pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return "";
  }
}

const SIGNALS = {
  hardId: 100,
  instagram: 80,
  addressExact: 70,
  addressBaseOnly: 18,
  addressContainment: 8,
  nameExact: 55,
  nameStrong: 40,
  nameMedium: 25,
  nameWeak: 12,
  cityEqual: 8,
  cityDifferent: -12,
};

const THRESHOLDS = { high: 75, medium: 45, low: 25 } as const;

function classify(score: number): MatchConfidence {
  if (score >= THRESHOLDS.high) return "high";
  if (score >= THRESHOLDS.medium) return "medium";
  return "low";
}

export function findDuplicates(input: DuplicateInput, leads: DuplicateCandidate[]): DuplicateMatch[] {
  const ownId = input.id ?? null;
  const inputName = normalizeName(input.companyName ?? "");
  const inputAddress = input.address ? normalizeStreet(input.address) : "";
  const inputCity = input.city ? normalizeCity(input.city) : "";
  const inputPhone = phoneDigits(input.phone);
  const inputWebsite = domainOf(input.website);
  const inputMaps = input.googleMapsUrl ? normalizeUrl(input.googleMapsUrl) : null;
  const inputTreatwell = input.treatwellUrl ? normalizeUrl(input.treatwellUrl) : null;
  const inputInstagram = instagramHandle(input.instagram);

  const matches: DuplicateMatch[] = [];

  for (const lead of leads) {
    if (ownId && lead.id === ownId) continue;
    if (!lead.companyName) continue;

    const reasons: string[] = [];
    let score = 0;

    if (inputTreatwell && lead.treatwellUrl && normalizeUrl(lead.treatwellUrl) === inputTreatwell) {
      score = SIGNALS.hardId;
      reasons.push("Gleiche Treatwell-URL");
    } else if (inputPhone && lead.phone && inputPhone === phoneDigits(lead.phone)) {
      score = SIGNALS.hardId;
      reasons.push("Gleiche Telefonnummer");
    } else if (inputWebsite && domainOf(lead.website) === inputWebsite) {
      score = SIGNALS.hardId;
      reasons.push("Gleiche Website");
    } else if (inputMaps && lead.googleMapsUrl && normalizeUrl(lead.googleMapsUrl) === inputMaps) {
      score = SIGNALS.hardId;
      reasons.push("Gleicher Google-Maps-Eintrag");
    } else {
      const nameSim = inputName && lead.companyName ? nameSimilarity(inputName, lead.companyName) : 0;
      if (nameSim === 1) {
        score += SIGNALS.nameExact;
        reasons.push("Gleicher Name");
      } else if (nameSim >= 0.75) {
        score += SIGNALS.nameStrong;
        reasons.push("Ähnlicher Name");
      } else if (nameSim >= 0.5) {
        score += SIGNALS.nameMedium;
        reasons.push("Ähnlicher Name");
      } else if (nameSim >= 0.3) {
        score += SIGNALS.nameWeak;
        reasons.push("Teilweise ähnlicher Name");
      }

      const leadAddress = lead.address ? normalizeStreet(lead.address) : "";
      if (inputAddress && leadAddress) {
        const inputParts = streetParts(input.address ?? "");
        const leadParts = streetParts(lead.address ?? "");
        const sameBase = inputParts.base.length >= 4 && inputParts.base === leadParts.base;
        if (sameBase) {
          if (inputParts.number && leadParts.number && inputParts.number === leadParts.number) {
            score += SIGNALS.addressExact;
            reasons.push("Gleiche Straße + Hausnummer");
          } else {
            score += SIGNALS.addressBaseOnly;
            reasons.push("Passende Straße");
          }
        } else if (
          (inputParts.base.length >= 4 && leadParts.base.includes(inputParts.base)) ||
          (leadParts.base.length >= 4 && inputParts.base.includes(leadParts.base))
        ) {
          score += SIGNALS.addressContainment;
          reasons.push("Ähnliche Adresse");
        }
      }

      const leadCity = lead.city ? normalizeCity(lead.city) : "";
      if (inputCity && leadCity) {
        if (inputCity === leadCity) {
          score += SIGNALS.cityEqual;
          reasons.push("Gleiche Stadt");
        } else {
          score += SIGNALS.cityDifferent;
          reasons.push("Andere Stadt");
        }
      }

      const leadInstagram = instagramHandle(lead.instagram);
      if (inputInstagram && leadInstagram && inputInstagram === leadInstagram) {
        score += SIGNALS.instagram;
        reasons.push("Gleicher Instagram-Account");
      }
    }

    if (score < THRESHOLDS.low) continue;
    matches.push({
      lead,
      score: Math.min(100, score),
      confidence: classify(Math.min(100, score)),
      reasons: reasons.slice(0, 3),
    });
  }

  return matches.sort(
    (a, b) => b.score - a.score || a.lead.companyName.localeCompare(b.lead.companyName, "de"),
  );
}
