/** Gemeinsame Konventionen fuer den Outreach-Flow. */

/** Titel-Praefix, an dem der Warm-up-Schritt erkannt wird. */
export const WARMUP_TASK_PREFIX = "Warm-up: ";

/** Titel-Praefix fuer Follow-ups der DM-Sequenz. */
export const FOLLOWUP_TASK_PREFIX = "Follow-up: ";

/** Tage zwischen Folgen/Liken und der eigentlichen DM. */
export const WARMUP_WAIT_DAYS = 2;

/** Sequenz: Tag 3 und Tag 7 nach dem Erstkontakt. Danach ist Schluss. */
export const FOLLOWUP_DAYS = [3, 7] as const;

export type WarmupState = "todo" | "waiting" | "ready";

export function warmupStateFrom(dueAt: Date | string | null | undefined): WarmupState {
  if (!dueAt) return "todo";
  return new Date(dueAt).getTime() > Date.now() ? "waiting" : "ready";
}
