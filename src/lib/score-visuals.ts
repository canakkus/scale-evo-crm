/**
 * Einzige Quelle fuer Score-Farben, Tag-Labels und Zeichenzaehler-Schwellen.
 * Alles greift auf bestehende Design-Tokens zurueck — keine neuen Hex-Werte.
 */

export type ScoreTemp = {
  key: "hot" | "warm" | "cold";
  label: string;
  bg: string;
  tx: string;
};

export function scoreTemp(score: number): ScoreTemp {
  if (score >= 70) return { key: "hot", label: "heiß", bg: "var(--score-hot-bg)", tx: "var(--score-hot-tx)" };
  if (score >= 40) return { key: "warm", label: "lauwarm", bg: "var(--score-warm-bg)", tx: "var(--score-warm-tx)" };
  return { key: "cold", label: "kalt", bg: "var(--score-cold-bg)", tx: "var(--score-cold-tx)" };
}

export const TAG_LABELS: Record<string, string> = {
  NO_WEBSITE: "Keine Website",
  LINKTREE_ONLY: "Nur Linktree",
  DM_BOOKING: "Buchung per DM",
  ACTIVE_POSTER: "Postet aktiv",
};

export type CharState = "ok" | "warn" | "over";

export function charState(length: number, limit: number): CharState {
  if (length > limit + 100) return "over";
  if (length > limit) return "warn";
  return "ok";
}

export const CHAR_COLORS: Record<CharState, string> = {
  ok: "var(--count-ok-tx)",
  warn: "var(--count-warn-tx)",
  over: "var(--count-over-tx)",
};

/** Grobe Sprechdauer fuer den Telefon-Kanal. */
export function speakingSeconds(length: number): number {
  return Math.round(length / 17);
}
