import { randomBytes } from "node:crypto";
import { buildIcsCalendar, type IcsEventInput } from "./ics";
import {
  DEFAULT_DURATION_MINUTES,
  phoneToTelUri,
  PLANNED_CALL_TYPE_LABELS,
  type PlannedCallStatus,
  type PlannedCallType,
} from "./planned-call";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export function generateCalendarFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isCalendarFeedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function appBaseUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }
  return "https://scale-evo-crm.vercel.app";
}

export function leadDeepLink(base: string, leadId: string): string {
  return `${base}/leads?lead=${encodeURIComponent(leadId)}`;
}

export function calendarFeedUrls(base: string, token: string): { httpsUrl: string; webcalUrl: string } {
  const httpsUrl = `${base}/api/calendar/feed/${token}`;
  const webcalUrl = httpsUrl.replace(/^https:/i, "webcal:").replace(/^http:/i, "webcal:");
  return { httpsUrl, webcalUrl };
}

export type FeedCall = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  reminderMinutes: number;
  type: PlannedCallType;
  status: PlannedCallStatus;
  note: string | null;
  sequence: number;
  updatedAt: Date;
  lead: { id: string; companyName: string; phone: string | null } | null;
};

export function plannedCallUid(id: string): string {
  return `planned-call-${id}@scaleevo.crm`;
}

export function plannedCallSummary(call: FeedCall): string {
  const kind = PLANNED_CALL_TYPE_LABELS[call.type];
  const company = call.lead?.companyName?.trim() || "Lead";
  const prefix = call.status === "DONE" ? "Erledigt: " : call.status === "CANCELLED" ? "Abgesagt: " : "";
  const phone = call.lead?.phone?.trim();
  return `${prefix}${kind}: ${company}${phone ? ` · ${phone}` : ""}`;
}

export function plannedCallDescription(call: FeedCall, baseUrl: string): string {
  const lines: string[] = [];
  const company = call.lead?.companyName?.trim();
  if (company) lines.push(company);
  const phone = call.lead?.phone?.trim();
  if (phone) {
    lines.push(`Telefon: ${phone}`);
    const tel = phoneToTelUri(phone);
    if (tel) lines.push(tel);
  }
  if (call.lead?.id) lines.push(leadDeepLink(baseUrl, call.lead.id));
  if (call.note?.trim()) lines.push(`Notiz: ${call.note.trim()}`);
  if (call.status === "PLANNED" && call.reminderMinutes > 0) {
    lines.push(`Erinnerung: ${call.reminderMinutes} Min. vorher`);
  }
  return lines.join("\n") || "Cold Call";
}

export function toIcsEvent(call: FeedCall, baseUrl: string): IcsEventInput {
  const duration = call.durationMinutes > 0 ? call.durationMinutes : DEFAULT_DURATION_MINUTES;
  const startsAt = new Date(call.startsAt);
  const summary = plannedCallSummary(call);
  return {
    uid: plannedCallUid(call.id),
    startsAt,
    endsAt: new Date(startsAt.getTime() + duration * 60_000),
    summary,
    description: plannedCallDescription(call, baseUrl),
    url: call.lead ? leadDeepLink(baseUrl, call.lead.id) : null,
    status: call.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    sequence: call.sequence,
    stamp: new Date(call.updatedAt),
    alarm:
      call.status === "PLANNED" && call.reminderMinutes > 0
        ? { minutesBefore: call.reminderMinutes, description: summary }
        : null,
  };
}

export function buildColdCallCalendar(calls: FeedCall[], baseUrl: string): string {
  return buildIcsCalendar(
    calls.map((call) => toIcsEvent(call, baseUrl)),
    {
      name: "ScaleEvo Cold Calls",
      description: "Geplante Cold Calls aus dem ScaleEvo CRM",
    },
  );
}
