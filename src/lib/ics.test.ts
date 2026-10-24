import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIcsCalendar, formatTrigger, icsLineOctetLengths, parseIcs, type IcsEventInput } from "./ics";

const base: IcsEventInput = {
  uid: "planned-call-abc@scaleevo.crm",
  startsAt: new Date("2026-10-24T07:30:00.000Z"),
  endsAt: new Date("2026-10-24T07:45:00.000Z"),
  summary: "Cold Call: Müller, GmbH · +43 660 1112233",
  description: "Müller, GmbH\nTelefon: +43 660 1112233\ntel:+436601112233\nhttps://scale-evo-crm.vercel.app/leads?lead=abc\nNotiz: Rückruf, Tür links\nund zweite Zeile",
  url: "https://scale-evo-crm.vercel.app/leads?lead=abc",
  status: "CONFIRMED",
  sequence: 0,
  stamp: new Date("2026-10-23T18:00:00.000Z"),
  alarm: { minutesBefore: 15, description: "Cold Call: Müller, GmbH · +43 660 1112233" },
};

describe("iCalendar feed", () => {
  it("parses a folded calendar and keeps the alarm, phone, and lead link", () => {
    const longNote = `${"ä".repeat(80)}, Semikolon; und\\Pfad`;
    const ics = buildIcsCalendar(
      [{ ...base, description: `${base.description}\n${longNote}` }],
      { name: "ScaleEvo Cold Calls", description: "Geplante Cold Calls" },
    );

    assert.match(ics, /\r\n/);
    assert.equal(ics.endsWith("\r\n"), true);
    assert.equal(ics.includes("\r\n"), true);
    assert.ok(icsLineOctetLengths(ics).every((length) => length <= 75));

    const parsed = parseIcs(ics);
    assert.equal(parsed.props.VERSION, "2.0");
    assert.equal(parsed.props.PRODID, "-//ScaleEvo//Cold Call Calendar//DE");
    assert.equal(parsed.props.CALSCALE, "GREGORIAN");
    assert.equal(parsed.props.METHOD, undefined);
    assert.equal(parsed.props["X-WR-CALNAME"], "ScaleEvo Cold Calls");
    assert.equal(parsed.events.length, 1);

    const event = parsed.events[0]!;
    assert.equal(event.UID, "planned-call-abc@scaleevo.crm");
    assert.equal(event.DTSTART, "20261024T073000Z");
    assert.equal(event.DTEND, "20261024T074500Z");
    assert.match(event.DTSTAMP, /^\d{8}T\d{6}Z$/);
    assert.equal(event.STATUS, "CONFIRMED");
    assert.equal(event.SEQUENCE, "0");
    assert.match(event.SUMMARY, /Müller, GmbH/);
    assert.match(event.SUMMARY, /\+43 660 1112233/);
    assert.match(event.DESCRIPTION, /Telefon: \+43 660 1112233/);
    assert.match(event.DESCRIPTION, /tel:\+436601112233/);
    assert.match(event.DESCRIPTION, /https:\/\/scale-evo-crm\.vercel\.app\/leads\?lead=abc/);
    assert.match(event.DESCRIPTION, /Rückruf, Tür links/);
    assert.match(event.DESCRIPTION, new RegExp(longNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(event.URL, "https://scale-evo-crm.vercel.app/leads?lead=abc");
    assert.equal(event.alarms.length, 1);
    assert.equal(event.alarms[0]!.ACTION, "DISPLAY");
    assert.equal(event.alarms[0]!.TRIGGER, "-PT15M");
    assert.match(event.alarms[0]!.DESCRIPTION, /Müller, GmbH/);
  });

  it("keeps the UID when a call is cancelled and drops the alarm", () => {
    const updated = buildIcsCalendar(
      [{ ...base, status: "CANCELLED", sequence: 2, alarm: null, summary: "Abgesagt: Cold Call: Müller, GmbH" }],
      { name: "ScaleEvo Cold Calls", description: "Geplante Cold Calls" },
    );
    const event = parseIcs(updated).events[0]!;
    assert.equal(event.UID, base.uid);
    assert.equal(event.STATUS, "CANCELLED");
    assert.equal(event.SEQUENCE, "2");
    assert.equal(event.alarms.length, 0);
  });

  it("formats reminder offsets", () => {
    assert.equal(formatTrigger(15), "-PT15M");
    assert.equal(formatTrigger(60), "-PT1H");
    assert.equal(formatTrigger(90), "-PT1H30M");
  });
});
