/** Gemeinsame Konventionen fuer den Outreach-Flow. */

/** Titel-Praefix, an dem der Warm-up-Schritt erkannt wird. */
export const WARMUP_TASK_PREFIX = "Warm-up: ";

/** Titel-Praefix fuer Follow-ups der DM-Sequenz. */
export const FOLLOWUP_TASK_PREFIX = "Follow-up: ";

/** Tage zwischen Folgen/Liken und der eigentlichen DM. */
export const WARMUP_WAIT_DAYS = 2;

/** Sequenz: Tag 3 und Tag 7 nach dem Erstkontakt. Danach ist Schluss. */
export const FOLLOWUP_DAYS = [3, 7] as const;

/**
 * Apify-Preis pro Profil in USD — EINZIGE Stelle fuer Kostenvorschauen.
 * Stand 2026-09-11 gegen das Apify-Pricing verifiziert (FREE-Tier).
 * Die aeltere Angabe "$1,60 / 1.000" galt fuer den GOLD-Tier.
 */
export const APIFY_PRICE_PER_PROFILE_USD = 0.0026;

/** "≈ 1,8 Cent" — US-Cent, eine Nachkommastelle, de-AT. */
export function formatProfileCost(profiles: number): string {
  const cents = profiles * APIFY_PRICE_PER_PROFILE_USD * 100;
  return `≈ ${cents.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cent`;
}

export const APIFY_PRICE_TOOLTIP = `Apify, $${APIFY_PRICE_PER_PROFILE_USD.toLocaleString("de-AT", { maximumFractionDigits: 4 })} pro Profil (USD)`;

export type WarmupState = "todo" | "waiting" | "ready";

export function warmupStateFrom(dueAt: Date | string | null | undefined): WarmupState {
  if (!dueAt) return "todo";
  return new Date(dueAt).getTime() > Date.now() ? "waiting" : "ready";
}
