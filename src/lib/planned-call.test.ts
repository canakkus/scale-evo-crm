import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardColumnFor,
  monthCells,
  parseCreatePlannedCall,
  parseReminderMinutes,
  parseUpdatePlannedCall,
  phoneToTelUri,
  weekCells,
} from "./planned-call";

describe("parseCreatePlannedCall", () => {
  it("defaults to a cold call with a 15 minute reminder", () => {
    const parsed = parseCreatePlannedCall({
      leadId: "lead_1",
      startsAt: "2026-10-24T09:00:00.000Z",
      note: "  nach 17 Uhr, Tür links ",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.leadId, "lead_1");
    assert.equal(parsed.value.type, "COLD_CALL");
    assert.equal(parsed.value.reminderMinutes, 15);
    assert.equal(parsed.value.durationMinutes, 15);
    assert.equal(parsed.value.note, "nach 17 Uhr, Tür links");
    assert.equal(parsed.value.startsAt.toISOString(), "2026-10-24T09:00:00.000Z");
  });

  it("rejects a missing lead, a bad date, and an oversized reminder", () => {
    assert.equal(parseCreatePlannedCall({ startsAt: "2026-10-24T09:00:00.000Z" }).ok, false);
    assert.equal(parseCreatePlannedCall({ leadId: "lead_1", startsAt: "gestern" }).ok, false);
    assert.deepEqual(parseReminderMinutes(2000), {
      ok: false,
      error: "Erinnerung muss zwischen 0 und 1440 Minuten liegen.",
    });
    const custom = parseCreatePlannedCall({
      leadId: "lead_1",
      startsAt: "2026-10-24T09:00:00.000Z",
      type: "MEETING",
      reminderMinutes: 0,
    });
    assert.equal(custom.ok, true);
    if (!custom.ok) return;
    assert.equal(custom.value.type, "MEETING");
    assert.equal(custom.value.reminderMinutes, 0);
  });
});

describe("parseUpdatePlannedCall", () => {
  it("accepts a status change and rejects an empty patch", () => {
    const parsed = parseUpdatePlannedCall({ status: "DONE" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.status, "DONE");
    assert.equal(parseUpdatePlannedCall({}).ok, false);
    assert.equal(parseUpdatePlannedCall({ status: "WON" }).ok, false);
  });
});

describe("phoneToTelUri", () => {
  it("keeps a leading plus and drops separators", () => {
    assert.equal(phoneToTelUri("+43 660 123 45 67"), "tel:+436601234567");
    assert.equal(phoneToTelUri("0660/1234567"), "tel:06601234567");
    assert.equal(phoneToTelUri("123"), null);
    assert.equal(phoneToTelUri("  "), null);
  });
});

describe("calendar grid", () => {
  it("builds Monday-Sunday month and week cells", () => {
    const anchor = new Date(2026, 9, 15);
    const month = monthCells(anchor);
    const week = weekCells(anchor);
    assert.equal(month.length % 7, 0);
    assert.ok(month.length >= 28);
    assert.equal(month[0]!.getDay(), 1);
    assert.equal(month[month.length - 1]!.getDay(), 0);
    assert.ok(month.some((day) => day.getDate() === 1 && day.getMonth() === 9));
    assert.ok(month.some((day) => day.getDate() === 31 && day.getMonth() === 9));
    assert.equal(week.length, 7);
    assert.equal(week[0]!.getDay(), 1);
    assert.equal(week[6]!.getDay(), 0);
  });
});

describe("boardColumnFor", () => {
  const now = new Date(2026, 9, 23, 15, 0, 0);

  it("derives today and overdue from the time and keeps done separate", () => {
    assert.equal(boardColumnFor({ status: "PLANNED", startsAt: new Date(2026, 9, 23, 18, 0) }, now), "today");
    assert.equal(boardColumnFor({ status: "PLANNED", startsAt: new Date(2026, 9, 22, 9, 0) }, now), "overdue");
    assert.equal(boardColumnFor({ status: "PLANNED", startsAt: new Date(2026, 9, 30, 9, 0) }, now), "planned");
    assert.equal(boardColumnFor({ status: "DONE", startsAt: new Date(2026, 9, 22, 9, 0) }, now), "done");
    assert.equal(boardColumnFor({ status: "CANCELLED", startsAt: new Date(2026, 9, 23, 9, 0) }, now), "cancelled");
  });
});
