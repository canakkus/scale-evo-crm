export type IcsAlarm = {
  minutesBefore: number;
  description: string;
};

export type IcsEventInput = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  url: string | null;
  status: "CONFIRMED" | "CANCELLED";
  sequence: number;
  stamp: Date;
  alarm: IcsAlarm | null;
};

const TEXT_PROPS = new Set(["SUMMARY", "DESCRIPTION", "X-WR-CALNAME", "X-WR-CALDESC"]);

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

export function escapeIcsText(value: string): string {
  return sanitizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function unescapeIcsText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === "n" || next === "N") out += "\n";
      else if (next === "\\") out += "\\";
      else if (next === ",") out += ",";
      else if (next === ";") out += ";";
      else out += next;
      i++;
    } else {
      out += value[i];
    }
  }
  return out;
}

export function formatIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Relative TRIGGER before the event, e.g. 15 → -PT15M, 90 → -PT1H30M. */
export function formatTrigger(minutesBefore: number): string {
  const hours = Math.floor(minutesBefore / 60);
  const mins = minutesBefore % 60;
  if (hours && mins) return `-PT${hours}H${mins}M`;
  if (hours) return `-PT${hours}H`;
  return `-PT${mins}M`;
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let budget = 75;
  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    if (end <= start) end = Math.min(start + budget, bytes.length);
    const chunk = bytes.subarray(start, end).toString("utf8");
    parts.push(start === 0 ? chunk : ` ${chunk}`);
    start = end;
    budget = 74;
  }
  return parts.join("\r\n");
}

function contentLine(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

export function buildIcsCalendar(events: IcsEventInput[], meta: { name: string; description: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScaleEvo//Cold Call Calendar//DE",
    "CALSCALE:GREGORIAN",
    contentLine("X-WR-CALNAME", escapeIcsText(meta.name)),
    contentLine("X-WR-CALDESC", escapeIcsText(meta.description)),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(contentLine("UID", event.uid));
    lines.push(contentLine("DTSTAMP", formatIcsUtc(event.stamp)));
    lines.push(contentLine("DTSTART", formatIcsUtc(event.startsAt)));
    lines.push(contentLine("DTEND", formatIcsUtc(event.endsAt)));
    lines.push(contentLine("SUMMARY", escapeIcsText(event.summary)));
    lines.push(contentLine("DESCRIPTION", escapeIcsText(event.description)));
    if (event.url) lines.push(contentLine("URL", event.url));
    lines.push(contentLine("STATUS", event.status));
    lines.push(contentLine("SEQUENCE", String(event.sequence)));
    if (event.alarm && event.alarm.minutesBefore > 0) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(contentLine("DESCRIPTION", escapeIcsText(event.alarm.description)));
      lines.push(`TRIGGER:${formatTrigger(event.alarm.minutesBefore)}`);
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export type ParsedComponent = Record<string, string> & {
  alarms: Array<Record<string, string>>;
};

export function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

export function parseIcs(ics: string): { props: Record<string, string>; events: ParsedComponent[] } {
  const rawLines = unfoldIcs(ics)
    .split(/\r\n|\n/)
    .filter((line) => line.length > 0);
  const props: Record<string, string> = {};
  const events: ParsedComponent[] = [];
  let fields: Record<string, string> | null = null;
  let alarms: Array<Record<string, string>> = [];
  let alarm: Record<string, string> | null = null;
  let inCalendar = false;

  for (const raw of rawLines) {
    if (raw === "BEGIN:VCALENDAR") {
      inCalendar = true;
      continue;
    }
    if (raw === "END:VCALENDAR") {
      inCalendar = false;
      continue;
    }
    if (raw === "BEGIN:VEVENT") {
      fields = {};
      alarms = [];
      continue;
    }
    if (raw === "END:VEVENT") {
      if (fields) events.push(Object.assign(fields, { alarms }));
      fields = null;
      alarms = [];
      continue;
    }
    if (raw === "BEGIN:VALARM") {
      alarm = {};
      continue;
    }
    if (raw === "END:VALARM") {
      if (alarm) alarms.push(alarm);
      alarm = null;
      continue;
    }

    const separator = raw.indexOf(":");
    if (separator <= 0) continue;
    const name = raw.slice(0, separator).split(";")[0]!.toUpperCase();
    const value = raw.slice(separator + 1);
    const stored = TEXT_PROPS.has(name) ? unescapeIcsText(value) : value;
    if (alarm) alarm[name] = stored;
    else if (fields) fields[name] = stored;
    else if (inCalendar) props[name] = stored;
  }

  return { props, events };
}

export function icsLineOctetLengths(ics: string): number[] {
  return ics.split("\r\n").filter((line) => line.length > 0).map((line) => Buffer.byteLength(line, "utf8"));
}
