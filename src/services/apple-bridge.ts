import * as cheerio from "cheerio";

/**
 * Apple iCloud Bridge for Scale Evo CRM
 * Exclusively enabled for user: canakkus378@gmail.com
 *
 * Capabilities:
 * 1. Synchronizes fixed Lead Follow-ups to:
 *    - Apple Reminders: List "WORKSHIT"
 *    - Apple Calendar: Calendar "Privat" (10-minute blocker)
 * 2. Books custom reminders from the Lead View to:
 *    - Apple Reminders: List "WORKSHIT"
 *    - Apple Calendar: Calendar "Privat" (10-minute blocker)
 *
 * Transport:
 * - Primary: Native iCloud CalDAV (Cloud-ready, runs on Vercel via ICLOUD_APP_PASSWORD)
 * - Local Fallback: macOS AppleScript / osascript (seamless zero-config fallback in local dev)
 */

export const TARGET_USER_EMAIL = (process.env.ICLOUD_USER || "canakkus378@gmail.com").toLowerCase();
const TARGET_REMINDERS_LIST = (process.env.ICLOUD_REMINDERS_LIST || "WORKSHIT").toLowerCase();
const TARGET_CALENDAR_NAME = (process.env.ICLOUD_CALENDAR_NAME || "Privat").toLowerCase();

export interface AppleSyncOptions {
  userEmail?: string | null;
  title: string;
  notes?: string | null;
  dueDate: Date | string;
  leadId?: string | null;
  leadCompany?: string | null;
  leadPhone?: string | null;
  leadAddress?: string | null;
  durationMinutes?: number; // default 10 minutes
}

export interface AppleSyncResult {
  success: boolean;
  method: "caldav" | "applescript" | "skipped" | "none";
  calendarEventCreated?: boolean;
  reminderCreated?: boolean;
  error?: string;
  details?: string;
}

// In-memory cache for discovered CalDAV URLs to avoid repeated discovery requests
interface CalDavCache {
  principalUrl?: string;
  calendarHomeUrl?: string;
  remindersUrl?: string;
  calendarUrl?: string;
  expiresAt: number;
}

let calDavCache: CalDavCache | null = null;

export function isAppleSyncUser(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === TARGET_USER_EMAIL ||
    normalized === "canakkus378@gmail.com"
  );
}

function escapeIcsText(str: string): string {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildIcsDescription(options: {
  notes?: string | null;
  leadCompany?: string | null;
  leadPhone?: string | null;
  leadAddress?: string | null;
  leadId?: string | null;
}): string {
  const parts: string[] = [];

  if (options.notes?.trim()) {
    parts.push(`Notiz: ${options.notes.trim()}`);
  }
  if (options.leadCompany?.trim()) {
    parts.push(`Firma: ${options.leadCompany.trim()}`);
  }
  if (options.leadPhone?.trim()) {
    parts.push(`Tel: ${options.leadPhone.trim()}`);
  }
  if (options.leadAddress?.trim()) {
    parts.push(`Adresse: ${options.leadAddress.trim()}`);
  }
  if (options.leadId) {
    const crmUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scale-evo-crm.vercel.app";
    parts.push(`CRM: ${crmUrl}/leads?search=${encodeURIComponent(options.leadCompany || "")}`);
  }

  return parts.join("\n\n");
}

// ============================================================
// 1. Native iCloud CalDAV Implementation
// ============================================================

async function discoverCalDavEndpoints(
  username: string,
  appPassword: string
): Promise<{ remindersUrl: string; calendarUrl: string }> {
  const now = Date.now();
  if (
    calDavCache &&
    calDavCache.expiresAt > now &&
    calDavCache.remindersUrl &&
    calDavCache.calendarUrl
  ) {
    return {
      remindersUrl: calDavCache.remindersUrl,
      calendarUrl: calDavCache.calendarUrl,
    };
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;

  // Step 1: Discover Principal
  const principalRes = await fetch("https://caldav.icloud.com/", {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader,
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8",
      "User-Agent": "ScaleEvoCRM/1.0",
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <current-user-principal/>
  </prop>
</propfind>`,
    redirect: "follow",
  });

  if (!principalRes.ok) {
    throw new Error(`CalDAV Principal PROPFIND fehlgeschlagen: HTTP ${principalRes.status} ${principalRes.statusText}`);
  }

  const principalXml = await principalRes.text();
  const $p = cheerio.load(principalXml, { xmlMode: true });

  // Extract href inside current-user-principal
  let principalHref = "";
  $p("*").each((_, el) => {
    if (el.type === "tag") {
      const tagName = el.name.split(":").pop()?.toLowerCase();
      if (tagName === "current-user-principal") {
        principalHref = $p(el).find("*").filter((__, child) => {
          const cName = child.type === "tag" ? child.name.split(":").pop()?.toLowerCase() : "";
          return cName === "href";
        }).first().text().trim();
      }
    }
  });

  if (!principalHref) {
    principalHref = $p("href").first().text().trim();
  }

  if (!principalHref) {
    throw new Error("CalDAV current-user-principal href konnte nicht ermittelt werden.");
  }

  const resolvedOrigin = new URL(principalRes.url).origin;
  const principalUrl = new URL(principalHref, resolvedOrigin).toString();

  // Step 2: Discover Calendar-Home-Set
  const homeRes = await fetch(principalUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader,
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8",
      "User-Agent": "ScaleEvoCRM/1.0",
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <prop>
    <c:calendar-home-set/>
  </prop>
</propfind>`,
    redirect: "follow",
  });

  if (!homeRes.ok) {
    throw new Error(`CalDAV Calendar-Home PROPFIND fehlgeschlagen: HTTP ${homeRes.status}`);
  }

  const homeXml = await homeRes.text();
  const $h = cheerio.load(homeXml, { xmlMode: true });

  let homeHref = "";
  $h("*").each((_, el) => {
    if (el.type === "tag") {
      const tagName = el.name.split(":").pop()?.toLowerCase();
      if (tagName === "calendar-home-set") {
        homeHref = $h(el).find("*").filter((__, child) => {
          const cName = child.type === "tag" ? child.name.split(":").pop()?.toLowerCase() : "";
          return cName === "href";
        }).first().text().trim();
      }
    }
  });

  if (!homeHref) {
    homeHref = $h("href").first().text().trim();
  }

  if (!homeHref) {
    throw new Error("CalDAV calendar-home-set href konnte nicht ermittelt werden.");
  }

  const calendarHomeUrl = new URL(homeHref, resolvedOrigin).toString();

  // Step 3: Discover Collections (Calendars & Reminders lists)
  const collectionsRes = await fetch(calendarHomeUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader,
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
      "User-Agent": "ScaleEvoCRM/1.0",
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <prop>
    <displayname/>
    <resourcetype/>
    <c:supported-calendar-component-set/>
  </prop>
</propfind>`,
    redirect: "follow",
  });

  if (!collectionsRes.ok) {
    throw new Error(`CalDAV Collections PROPFIND fehlgeschlagen: HTTP ${collectionsRes.status}`);
  }

  const collectionsXml = await collectionsRes.text();
  const $c = cheerio.load(collectionsXml, { xmlMode: true });

  interface DiscoveredCollection {
    href: string;
    displayName: string;
    supportsTodo: boolean;
    supportsEvent: boolean;
  }

  const collections: DiscoveredCollection[] = [];

  $c("*").each((_, el) => {
    if (el.type === "tag" && el.name.split(":").pop()?.toLowerCase() === "response") {
      const $el = $c(el);
      const href = $el.find("*").filter((__, child) => child.type === "tag" && child.name.split(":").pop()?.toLowerCase() === "href").first().text().trim();
      const displayName = $el.find("*").filter((__, child) => child.type === "tag" && child.name.split(":").pop()?.toLowerCase() === "displayname").first().text().trim();

      const components: string[] = [];
      $el.find("*").each((__, compEl) => {
        if (compEl.type === "tag" && compEl.name.split(":").pop()?.toLowerCase() === "comp") {
          const compName = $c(compEl).attr("name")?.toUpperCase();
          if (compName) components.push(compName);
        }
      });

      const supportsTodo = components.includes("VTODO");
      const supportsEvent = components.includes("VEVENT");

      if (href && (supportsTodo || supportsEvent || displayName)) {
        collections.push({
          href,
          displayName,
          supportsTodo,
          supportsEvent,
        });
      }
    }
  });

  // Find Reminders List (target: WORKSHIT)
  let remindersColl = collections.find(
    (c) => c.displayName.toLowerCase() === TARGET_REMINDERS_LIST && c.supportsTodo
  );
  if (!remindersColl) {
    remindersColl = collections.find((c) => c.displayName.toLowerCase() === TARGET_REMINDERS_LIST);
  }
  if (!remindersColl) {
    remindersColl = collections.find((c) => c.supportsTodo);
  }

  // Find Calendar (target: Privat)
  let calendarColl = collections.find(
    (c) => c.displayName.toLowerCase() === TARGET_CALENDAR_NAME && c.supportsEvent
  );
  if (!calendarColl) {
    calendarColl = collections.find((c) => c.displayName.toLowerCase() === TARGET_CALENDAR_NAME);
  }
  if (!calendarColl) {
    calendarColl = collections.find((c) => c.supportsEvent && !c.supportsTodo);
  }

  if (!remindersColl || !calendarColl) {
    const foundNames = collections.map((c) => `${c.displayName} (${c.supportsTodo ? "VTODO" : ""}${c.supportsEvent ? "VEVENT" : ""})`).join(", ");
    throw new Error(`CalDAV Kalender/Listen nicht vollständig gefunden. Gefunden: [${foundNames}]. Gesucht: Reminders '${TARGET_REMINDERS_LIST}', Kalender '${TARGET_CALENDAR_NAME}'`);
  }

  const finalRemindersUrl = new URL(remindersColl.href, resolvedOrigin).toString();
  const finalCalendarUrl = new URL(calendarColl.href, resolvedOrigin).toString();

  // Cache for 12 hours
  calDavCache = {
    principalUrl,
    calendarHomeUrl,
    remindersUrl: finalRemindersUrl,
    calendarUrl: finalCalendarUrl,
    expiresAt: now + 12 * 60 * 60 * 1000,
  };

  return {
    remindersUrl: finalRemindersUrl,
    calendarUrl: finalCalendarUrl,
  };
}

async function pushViaCalDav(options: AppleSyncOptions): Promise<AppleSyncResult> {
  const username = process.env.ICLOUD_USER || TARGET_USER_EMAIL;
  const appPassword = process.env.ICLOUD_APP_PASSWORD;

  if (!appPassword) {
    throw new Error("ICLOUD_APP_PASSWORD ist nicht gesetzt.");
  }

  const { remindersUrl, calendarUrl } = await discoverCalDavEndpoints(username, appPassword);
  const authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;

  const dueDate = new Date(options.dueDate);
  const duration = options.durationMinutes || 10;
  const endDate = new Date(dueDate.getTime() + duration * 60 * 1000);
  const now = new Date();

  const description = buildIcsDescription(options);
  const eventUid = `crm-evt-${crypto.randomUUID()}@scaleevo.at`;
  const todoUid = `crm-rem-${crypto.randomUUID()}@scaleevo.at`;

  // 1. Create Calendar Event (10-minute blocker in Privat)
  const icsEvent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scale Evo CRM//Apple Bridge//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(dueDate)}`,
    `DTEND:${toIcsUtc(endDate)}`,
    `SUMMARY:${escapeIcsText(options.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    options.leadAddress ? `LOCATION:${escapeIcsText(options.leadAddress)}` : "",
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Erinnerung",
    "TRIGGER:-PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const calPutUrl = `${remindersUrl.endsWith("/") ? remindersUrl : remindersUrl + "/"}${eventUid}.ics`.replace(
    calendarUrl.endsWith("/") ? calendarUrl : calendarUrl + "/",
    calendarUrl.endsWith("/") ? calendarUrl : calendarUrl + "/"
  );
  const finalCalPutUrl = `${calendarUrl.endsWith("/") ? calendarUrl : calendarUrl + "/"}${eventUid}.ics`;

  const calRes = await fetch(finalCalPutUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "text/calendar; charset=utf-8",
      "User-Agent": "ScaleEvoCRM/1.0",
    },
    body: icsEvent,
  });

  if (!calRes.ok && calRes.status !== 201 && calRes.status !== 204) {
    const errText = await calRes.text().catch(() => "");
    throw new Error(`CalDAV Calendar PUT fehlgeschlagen: HTTP ${calRes.status} (${errText.slice(0, 100)})`);
  }

  // 2. Create Reminder (VTODO in WORKSHIT)
  const icsTodo = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scale Evo CRM//Apple Bridge//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTODO",
    `UID:${todoUid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DUE;VALUE=DATE-TIME:${toIcsUtc(dueDate)}`,
    `SUMMARY:${escapeIcsText(options.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:NEEDS-ACTION",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Erinnerung",
    `TRIGGER;VALUE=DATE-TIME:${toIcsUtc(dueDate)}`,
    "END:VALARM",
    "END:VTODO",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const finalTodoPutUrl = `${remindersUrl.endsWith("/") ? remindersUrl : remindersUrl + "/"}${todoUid}.ics`;

  const todoRes = await fetch(finalTodoPutUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "text/calendar; charset=utf-8",
      "User-Agent": "ScaleEvoCRM/1.0",
    },
    body: icsTodo,
  });

  if (!todoRes.ok && todoRes.status !== 201 && todoRes.status !== 204) {
    const errText = await todoRes.text().catch(() => "");
    throw new Error(`CalDAV Reminders PUT fehlgeschlagen: HTTP ${todoRes.status} (${errText.slice(0, 100)})`);
  }

  return {
    success: true,
    method: "caldav",
    calendarEventCreated: true,
    reminderCreated: true,
    details: `iCloud CalDAV: Kalender '${TARGET_CALENDAR_NAME}' & Liste '${TARGET_REMINDERS_LIST}' synchronisiert`,
  };
}

// ============================================================
// 2. Local AppleScript Fallback (macOS Dev Mode)
// ============================================================

async function runAppleScript(script: string): Promise<string> {
  const { execFile } = await import("child_process");
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function pushViaAppleScript(options: AppleSyncOptions): Promise<AppleSyncResult> {
  const dueDate = new Date(options.dueDate);
  const duration = options.durationMinutes || 10;
  const description = buildIcsDescription(options);

  const year = dueDate.getFullYear();
  const month = dueDate.getMonth() + 1;
  const day = dueDate.getDate();
  const hours = dueDate.getHours();
  const minutes = dueDate.getMinutes();

  // Reminder in WORKSHIT
  const reminderScript = `
tell application "Reminders"
  try
    set remList to list "WORKSHIT"
    set targetDate to current date
    set year of targetDate to ${year}
    set month of targetDate to ${month}
    set day of targetDate to ${day}
    set hours of targetDate to ${hours}
    set minutes of targetDate to ${minutes}
    set seconds of targetDate to 0
    tell remList
      make new reminder with properties {name:${JSON.stringify(options.title)}, due date:targetDate, body:${JSON.stringify(description)}}
    end tell
  end try
end tell
`;

  // Event in Privat with 10-minute blocker
  const calendarScript = `
tell application "Calendar"
  try
    set targetCal to first calendar whose name is "Privat"
    set startDate to current date
    set year of startDate to ${year}
    set month of startDate to ${month}
    set day of startDate to ${day}
    set hours of startDate to ${hours}
    set minutes of startDate to ${minutes}
    set seconds of startDate to 0
    set endDate to startDate + (${duration} * 60)
    tell targetCal
      make new event with properties {summary:${JSON.stringify(options.title)}, start date:startDate, end date:endDate, location:${JSON.stringify(options.leadAddress || "")}, description:${JSON.stringify(description)}}
    end tell
  end try
end tell
`;

  await runAppleScript(reminderScript);
  await runAppleScript(calendarScript);

  return {
    success: true,
    method: "applescript",
    calendarEventCreated: true,
    reminderCreated: true,
    details: "macOS AppleScript: Reminder in 'WORKSHIT' und Termin in 'Privat' (10 Min) angelegt",
  };
}

// ============================================================
// 3. Main Exported Dispatcher
// ============================================================

export async function pushToAppleEcosystem(options: AppleSyncOptions): Promise<AppleSyncResult> {
  // Exclusivity Check: Only for canakkus378@gmail.com
  if (!isAppleSyncUser(options.userEmail)) {
    return {
      success: false,
      method: "skipped",
      error: `Apple Bridge ist exklusiv für ${TARGET_USER_EMAIL} aktiviert.`,
    };
  }

  // Priority 1: CalDAV if ICLOUD_APP_PASSWORD is set
  if (process.env.ICLOUD_APP_PASSWORD) {
    try {
      return await pushViaCalDav(options);
    } catch (err: any) {
      console.error("[AppleBridge] CalDAV Error:", err);
      // Invalidate cache on failure to retry fresh discovery next time
      calDavCache = null;

      // If on macOS, try fallback
      if (process.platform === "darwin") {
        console.warn("[AppleBridge] Falling back to macOS AppleScript...");
        try {
          return await pushViaAppleScript(options);
        } catch (asErr: any) {
          console.error("[AppleBridge] AppleScript Fallback Error:", asErr);
          return {
            success: false,
            method: "caldav",
            error: `CalDAV Fehler: ${err?.message || err}. AppleScript Fallback: ${asErr?.message}`,
          };
        }
      }

      return {
        success: false,
        method: "caldav",
        error: err?.message || "Fehler beim CalDAV-Sync zu iCloud",
      };
    }
  }

  // Priority 2: Local macOS AppleScript if running locally on Mac without password
  if (process.platform === "darwin") {
    try {
      return await pushViaAppleScript(options);
    } catch (err: any) {
      console.error("[AppleBridge] AppleScript Error:", err);
      return {
        success: false,
        method: "applescript",
        error: err?.message || "Fehler beim AppleScript Eintrag",
      };
    }
  }

  // Priority 3: Serverless without password
  return {
    success: false,
    method: "none",
    error: "ICLOUD_APP_PASSWORD ist in den Umgebungsvariablen nicht hinterlegt.",
  };
}
