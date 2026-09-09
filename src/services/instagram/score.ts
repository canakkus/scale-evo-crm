import { INDUSTRIES } from "@/lib/constants";
import type { InstagramProfile, InstagramScore, ScoreReason } from "./types";

/**
 * Signalgewichte. Bewusst an einer Stelle, damit sich das Modell
 * nachschaerfen laesst, ohne die Aufrufer anzufassen.
 */
export const SCORE_SIGNALS = {
  noLinkInBio: 25,
  dmBooking: 20,
  linktreeOnly: 20,
  activePoster: 15,
  followerSweetSpot: 15,
  businessAccount: 10,
  standort: 8,
  branchenKeyword: 8,
  ownWebsite: -30,
  dormant: -25,
  tooSmall: -15,
  tooBig: -15,
  privateAccount: -20,
  chain: -20,
} as const;

const LINK_AGGREGATORS = /linktr\.ee|beacons\.ai|linkin\.bio|link\.me|taplink|bio\.link|campsite\.bio|linktree/i;
const DM_BOOKING_PHRASES = /termine?\s*(?:nur\s*)?(?:per|via|über|ueber)\s*dm|dm\s*(?:for|für|fuer)\s*(?:booking|termin)|buchung\s*per\s*dm|terminanfragen?\s*per\s*dm|anfragen?\s*per\s*dm/i;
const CHAIN_HINTS = /\b(filiale|filialen|standorte|kette|franchise|branches)\b/i;
const VIENNA_HINTS = /\b(wien|vienna|1010|1020|1030|1040|1050|1060|1070|1080|1090|11\d0|12\d0|13\d0|14\d0|15\d0|16\d0|17\d0|18\d0|19\d0|2[0-3]\d0)\b/i;

/**
 * Bewertet ein Instagram-Profil als Vertriebs-Lead.
 *
 * Grundgedanke: gut ist, wer sichtbar aktiv, aber digital schlecht
 * aufgestellt und gross genug fuer ein Budget ist.
 *
 * Fehlende Daten erzeugen KEINE Punkte — weder positiv noch negativ.
 * Beruht der Score auf Luecken, wird `approximate` gesetzt und die UI
 * zeigt ihn als "~64" mit Hinweis auf manuelle Pruefung.
 */
export function scoreInstagramProfile(
  profile: InstagramProfile,
  context: { industry?: string | null; city?: string | null; hasSolidWebsite?: boolean } = {},
): InstagramScore {
  const reasons: ScoreReason[] = [];
  const tags: string[] = [];
  const add = (key: string, label: string, points: number) => reasons.push({ key, label, points });

  const bio = profile.bio ?? "";
  const externalUrl = profile.externalUrl;

  // ---- Link in Bio / Website ------------------------------------------
  // Reihenfolge ist wichtig: Was das CRM ueber den Lead weiss, schlaegt die
  // unsichere Profil-Auslesung. "Kein Link in Bio" wird NUR vergeben, wenn
  // wir das auch wirklich pruefen konnten (externalUrlKnown) — sonst waere
  // eine fehlgeschlagene Auslesung ein Pluspunkt, und das waere Unsinn.
  const aggregatorUrl = externalUrl && LINK_AGGREGATORS.test(externalUrl);

  if (aggregatorUrl) {
    add("LINKTREE_ONLY", "Nur Linktree statt eigener Website", SCORE_SIGNALS.linktreeOnly);
    tags.push("LINKTREE_ONLY");
  } else if (context.hasSolidWebsite || externalUrl) {
    add("OWN_WEBSITE", "Eigene Website vorhanden", SCORE_SIGNALS.ownWebsite);
  } else if (profile.externalUrlKnown) {
    add("NO_LINK_IN_BIO", "Kein Link in Bio", SCORE_SIGNALS.noLinkInBio);
    tags.push("NO_WEBSITE");
  }

  // ---- Terminvergabe per DM -------------------------------------------
  if (DM_BOOKING_PHRASES.test(bio)) {
    add("DM_BOOKING", "Termine per DM", SCORE_SIGNALS.dmBooking);
    tags.push("DM_BOOKING");
  }

  // ---- Aktivitaet ------------------------------------------------------
  if (profile.daysSinceLastPost !== null) {
    if (profile.daysSinceLastPost <= 14) {
      add("ACTIVE_POSTER", `Aktiv (Post vor ${profile.daysSinceLastPost} Tagen)`, SCORE_SIGNALS.activePoster);
      tags.push("ACTIVE_POSTER");
    } else if (profile.daysSinceLastPost > 180) {
      add("DORMANT", "Letzter Post vor über 6 Monaten", SCORE_SIGNALS.dormant);
    }
  }

  // ---- Reichweite ------------------------------------------------------
  if (profile.followerCount !== null) {
    if (profile.followerCount >= 500 && profile.followerCount <= 15_000) {
      add("FOLLOWER_SWEET_SPOT", `${formatFollowers(profile.followerCount)} Follower`, SCORE_SIGNALS.followerSweetSpot);
    } else if (profile.followerCount < 150) {
      add("TOO_SMALL", "Unter 150 Follower", SCORE_SIGNALS.tooSmall);
    } else if (profile.followerCount > 50_000) {
      add("TOO_BIG", "Über 50.000 Follower — vermutlich Agentur", SCORE_SIGNALS.tooBig);
    }
  }

  // ---- Accounttyp ------------------------------------------------------
  if (profile.isBusinessAccount === true) {
    add("BUSINESS_ACCOUNT", "Business-Account", SCORE_SIGNALS.businessAccount);
  }
  if (profile.isPrivate === true) {
    add("PRIVATE", "Privates / gesperrtes Profil", SCORE_SIGNALS.privateAccount);
  }

  // ---- Standort & Branche ---------------------------------------------
  const cityHint = context.city ? new RegExp(escapeRegExp(context.city.replace(/^\d{4}\s*/, "")), "i") : null;
  if (VIENNA_HINTS.test(bio) || (cityHint && cityHint.test(bio))) {
    add("LOCAL", "Standort in der Bio", SCORE_SIGNALS.standort);
  }

  const industryHit = matchIndustry(bio, context.industry);
  if (industryHit) {
    add("INDUSTRY_MATCH", `Branche erkannt: ${industryHit}`, SCORE_SIGNALS.branchenKeyword);
  }

  // ---- Kette -----------------------------------------------------------
  if (CHAIN_HINTS.test(bio)) {
    add("CHAIN", "Kette / Franchise — Entscheidung nicht lokal", SCORE_SIGNALS.chain);
  }

  const raw = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    reasons,
    tags,
    approximate: profile.incomplete,
  };
}

function formatFollowers(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1).replace(".0", "")}k` : String(count);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchIndustry(bio: string, industry?: string | null): string | null {
  const haystack = bio.toLowerCase();
  if (industry) {
    const first = industry.split(/[&\s]+/)[0]?.toLowerCase();
    if (first && first.length >= 4 && haystack.includes(first)) return industry;
  }
  for (const candidate of INDUSTRIES) {
    const token = candidate.split(/[&\s]+/)[0]?.toLowerCase();
    if (token && token.length >= 4 && haystack.includes(token)) return candidate;
  }
  return null;
}

/** Deutsche Labels fuer die opportunityTags — auch in der UI verwendet. */
export const TAG_LABELS: Record<string, string> = {
  NO_WEBSITE: "Keine Website",
  LINKTREE_ONLY: "Nur Linktree",
  DM_BOOKING: "Buchung per DM",
  ACTIVE_POSTER: "Postet aktiv",
};
