import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildColdCallCalendar,
  calendarFeedUrls,
  generateCalendarFeedToken,
  isCalendarFeedToken,
  plannedCallUid,
  type FeedCall,
} from "./calendar-feed";
import { parseIcs } from "./ics";

function call(overrides: Partial<FeedCall> = {}): FeedCall {
  return {
    id: "ckcall123",
    startsAt: new Date("2026-10-24T08:00:00.000Z"),
    durationMinutes: 15,
    reminderMinutes: 15,
    type: "COLD_CALL",
    status: "PLANNED",
    note: "Kurz anrufen",
    sequence: 0,
    updatedAt: new Date("2026-10-23T12:00:00.000Z"),
    lead: { id: "cklead123", companyName: "Salon Adler", phone: "+43 1 2345678" },
    ...overrides,
  };
}

describe("cold call feed", () => {
  it("uses a stable UID and a 15 minute display alarm by default", () => {
    const first = call();
    const moved = call({
      startsAt: new Date("2026-10-24T10:00:00.000Z"),
      sequence: 1,
      updatedAt: new Date("2026-10-23T13:00:00.000Z"),
      reminderMinutes: 30,
    });
    const parsed = parseIcs(buildColdCallCalendar([first, moved], "https://scale-evo-crm.vercel.app"));
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0]!.UID, plannedCallUid("ckcall123"));
    assert.equal(parsed.events[1]!.UID, parsed.events[0]!.UID);
    assert.equal(parsed.events[0]!.DTSTART, "20261024T080000Z");
    assert.equal(parsed.events[1]!.DTSTART, "20261024T100000Z");
    assert.equal(parsed.events[0]!.SEQUENCE, "0");
    assert.equal(parsed.events[1]!.SEQUENCE, "1");
    assert.equal(parsed.events[0]!.alarms[0]!.TRIGGER, "-PT15M");
    assert.equal(parsed.events[1]!.alarms[0]!.TRIGGER, "-PT30M");
    assert.match(parsed.events[0]!.DESCRIPTION, /tel:\+4312345678/);
    assert.match(parsed.events[0]!.DESCRIPTION, /leads\?lead=cklead123/);
    assert.match(parsed.events[0]!.SUMMARY, /Salon Adler/);
  });

  it("omits the alarm when the reminder is off or the call is done", () => {
    const ics = buildColdCallCalendar(
      [
        call({ id: "a", reminderMinutes: 0 }),
        call({ id: "b", status: "DONE", sequence: 3 }),
      ],
      "https://crm.example",
    );
    const events = parseIcs(ics).events;
    assert.equal(events[0]!.alarms.length, 0);
    assert.equal(events[1]!.alarms.length, 0);
    assert.equal(events[1]!.STATUS, "CONFIRMED");
    assert.match(events[1]!.SUMMARY, /^Erledigt:/);
    assert.equal(events[0]!.UID, plannedCallUid("a"));
    assert.equal(events[1]!.UID, plannedCallUid("b"));
  });

  it("issues an unguessable token and a webcal url", () => {
    const token = generateCalendarFeedToken();
    assert.equal(isCalendarFeedToken(token), true);
    assert.equal(token.length >= 43, true);
    assert.equal(isCalendarFeedToken("short"), false);
    assert.equal(isCalendarFeedToken(`${token}.ics`), false);
    const urls = calendarFeedUrls("https://scale-evo-crm.vercel.app", token);
    assert.equal(urls.httpsUrl, `https://scale-evo-crm.vercel.app/api/calendar/feed/${token}`);
    assert.equal(urls.webcalUrl, `webcal://scale-evo-crm.vercel.app/api/calendar/feed/${token}`);
    assert.notEqual(generateCalendarFeedToken(), token);
  });
});
