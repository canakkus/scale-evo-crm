import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const PLANNED_CALL_TYPES = ["COLD_CALL", "MEETING", "FOLLOW_UP"] as const;
export type PlannedCallType = (typeof PLANNED_CALL_TYPES)[number];

export const PLANNED_CALL_STATUSES = ["PLANNED", "DONE", "CANCELLED"] as const;
export type PlannedCallStatus = (typeof PLANNED_CALL_STATUSES)[number];

export const PLANNED_CALL_TYPE_LABELS: Record<PlannedCallType, string> = {
  COLD_CALL: "Cold Call",
  MEETING: "Meeting",
  FOLLOW_UP: "Follow-up",
};

export const PLANNED_CALL_STATUS_LABELS: Record<PlannedCallStatus, string> = {
  PLANNED: "Geplant",
  DONE: "Erledigt",
  CANCELLED: "Abgesagt",
};

export const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120] as const;
export const DEFAULT_REMINDER_MINUTES = 15;
export const DEFAULT_DURATION_MINUTES = 15;
export const NOTE_MAX = 500;

export const FEED_PAST_DAYS = 90;
export const FEED_FUTURE_DAYS = 365;

export type PlannedCallDto = {
  id: string;
  leadId: string;
  startsAt: string;
  durationMinutes: number;
  reminderMinutes: number;
  type: PlannedCallType;
  status: PlannedCallStatus;
  note: string | null;
  sequence: number;
  lead: { id: string; companyName: string; phone: string | null } | null;
};

export type CreatePlannedCallInput = {
  leadId: string;
  startsAt: Date;
  type: PlannedCallType;
  note: string | null;
  durationMinutes: number;
  reminderMinutes: number;
};

export type UpdatePlannedCallInput = {
  leadId?: string;
  startsAt?: Date;
  type?: PlannedCallType;
  note?: string | null;
  durationMinutes?: number;
  reminderMinutes?: number;
  status?: PlannedCallStatus;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

type Fail = { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): Fail {
  return { ok: false, error };
}

function isFail(value: unknown): value is Fail {
  return typeof value === "object" && value !== null && "ok" in value && (value as Fail).ok === false;
}

export function parseReminderMinutes(value: unknown, fallback = DEFAULT_REMINDER_MINUTES): number | Fail {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 24 * 60) {
    return fail("Erinnerung muss zwischen 0 und 1440 Minuten liegen.");
  }
  return n;
}

function parseDuration(value: unknown, fallback = DEFAULT_DURATION_MINUTES): number | Fail {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 5 || n > 180) {
    return fail("Dauer muss zwischen 5 und 180 Minuten liegen.");
  }
  return n;
}

function parseType(value: unknown, fallback: PlannedCallType = "COLD_CALL"): PlannedCallType | Fail {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && (PLANNED_CALL_TYPES as readonly string[]).includes(value)) {
    return value as PlannedCallType;
  }
  return fail("Unbekannte Art.");
}

function parseNote(value: unknown): string | null | Fail {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return fail("Notiz muss Text sein.");
  const trimmed = value.trim();
  if (trimmed.length > NOTE_MAX) {
    return fail(`Notiz darf höchstens ${NOTE_MAX} Zeichen haben.`);
  }
  return trimmed.length ? trimmed : null;
}

function parseStartsAt(value: unknown): Date | Fail {
  if (typeof value !== "string" || !value.trim()) {
    return fail("Datum und Uhrzeit sind erforderlich.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fail("Ungültiges Datum.");
  return date;
}

function parseLeadId(value: unknown): string | Fail {
  if (typeof value !== "string" || !value.trim()) {
    return fail("Bitte einen Lead wählen.");
  }
  return value.trim();
}

export function parseCreatePlannedCall(body: unknown): ParseResult<CreatePlannedCallInput> {
  if (!isRecord(body)) return { ok: false, error: "Ungültige Anfrage." };
  const leadId = parseLeadId(body.leadId);
  if (isFail(leadId)) return leadId;
  const startsAt = parseStartsAt(body.startsAt);
  if (isFail(startsAt)) return startsAt;
  const type = parseType(body.type);
  if (isFail(type)) return type;
  const note = parseNote(body.note);
  if (isFail(note)) return note;
  const durationMinutes = parseDuration(body.durationMinutes);
  if (isFail(durationMinutes)) return durationMinutes;
  const reminderMinutes = parseReminderMinutes(body.reminderMinutes);
  if (isFail(reminderMinutes)) return reminderMinutes;
  return { ok: true, value: { leadId, startsAt, type, note, durationMinutes, reminderMinutes } };
}

export function parseUpdatePlannedCall(body: unknown): ParseResult<UpdatePlannedCallInput> {
  if (!isRecord(body)) return { ok: false, error: "Ungültige Anfrage." };
  const value: UpdatePlannedCallInput = {};
  if ("leadId" in body) {
    const leadId = parseLeadId(body.leadId);
    if (isFail(leadId)) return leadId;
    value.leadId = leadId;
  }
  if ("startsAt" in body) {
    const startsAt = parseStartsAt(body.startsAt);
    if (isFail(startsAt)) return startsAt;
    value.startsAt = startsAt;
  }
  if ("type" in body) {
    const type = parseType(body.type);
    if (isFail(type)) return type;
    value.type = type;
  }
  if ("note" in body) {
    const note = parseNote(body.note);
    if (isFail(note)) return note;
    value.note = note;
  }
  if ("durationMinutes" in body) {
    const durationMinutes = parseDuration(body.durationMinutes);
    if (isFail(durationMinutes)) return durationMinutes;
    value.durationMinutes = durationMinutes;
  }
  if ("reminderMinutes" in body) {
    const reminderMinutes = parseReminderMinutes(body.reminderMinutes);
    if (isFail(reminderMinutes)) return reminderMinutes;
    value.reminderMinutes = reminderMinutes;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !(PLANNED_CALL_STATUSES as readonly string[]).includes(body.status)) {
      return { ok: false, error: "Unbekannter Status." };
    }
    value.status = body.status as PlannedCallStatus;
  }
  if (Object.keys(value).length === 0) return { ok: false, error: "Nichts zu ändern." };
  return { ok: true, value };
}

export function phoneToTelUri(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 5) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultPlanTime(from = new Date()): Date {
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

export function defaultTimeOnDay(day: Date, now = new Date()): Date {
  if (isSameLocalDay(day, now)) return defaultPlanTime(now);
  const next = new Date(day);
  next.setHours(9, 0, 0, 0);
  return next;
}

export function monthCells(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function weekCells(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function visibleRange(anchor: Date, mode: "month" | "week"): { from: Date; to: Date } {
  const days = mode === "month" ? monthCells(anchor) : weekCells(anchor);
  const from = new Date(days[0]!);
  from.setHours(0, 0, 0, 0);
  const to = new Date(days[days.length - 1]!);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function feedWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - FEED_PAST_DAYS * 86_400_000),
    to: new Date(now.getTime() + FEED_FUTURE_DAYS * 86_400_000),
  };
}

/** Range that covers the visible grid and the board (overdue through next year). */
export function loadWindow(cursor: Date, mode: "month" | "week" | "board", now = new Date()): { from: Date; to: Date } {
  const feed = feedWindow(now);
  if (mode === "board") return feed;
  const visible = visibleRange(cursor, mode);
  return {
    from: new Date(Math.min(visible.from.getTime(), feed.from.getTime())),
    to: new Date(Math.max(visible.to.getTime(), feed.to.getTime())),
  };
}

export type BoardColumnId = "overdue" | "today" | "planned" | "done" | "cancelled";

export const BOARD_COLUMNS: { id: BoardColumnId; label: string; dropStatus: PlannedCallStatus }[] = [
  { id: "overdue", label: "Überfällig", dropStatus: "PLANNED" },
  { id: "today", label: "Heute", dropStatus: "PLANNED" },
  { id: "planned", label: "Geplant", dropStatus: "PLANNED" },
  { id: "done", label: "Erledigt", dropStatus: "DONE" },
  { id: "cancelled", label: "Abgesagt", dropStatus: "CANCELLED" },
];

/**
 * Heute und Überfällig sind keine gespeicherten Status, sondern folgen aus
 * dem Zeitpunkt. Erledigt und Abgesagt sind der Status des Anrufs — nicht
 * der Status des Leads.
 */
export function boardColumnFor(
  call: { status: PlannedCallStatus; startsAt: Date | string },
  now = new Date(),
): BoardColumnId {
  if (call.status === "DONE") return "done";
  if (call.status === "CANCELLED") return "cancelled";
  const start = new Date(call.startsAt);
  if (isSameLocalDay(start, now)) return "today";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (start.getTime() < startOfToday.getTime()) return "overdue";
  return "planned";
}
