import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVED_STATUSES,
  NOT_RELEVANT_PRIORITY_RESET,
  isArchivedStatus,
  systemPriorityForScore,
} from "./leads-list";

describe("leads archive & priority invariants", () => {
  it("classifies NOT_RELEVANT, LOST, and VISITED_NO_INTEREST as archived statuses", () => {
    assert.deepEqual(ARCHIVED_STATUSES, ["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"]);
    assert.equal(isArchivedStatus("NOT_RELEVANT"), true);
    assert.equal(isArchivedStatus("LOST"), true);
    assert.equal(isArchivedStatus("VISITED_NO_INTEREST"), true);
    assert.equal(isArchivedStatus("NEW"), false);
    assert.equal(isArchivedStatus("CALLED"), false);
    assert.equal(isArchivedStatus("WON"), false);
    assert.equal(isArchivedStatus(null), false);
    assert.equal(isArchivedStatus(undefined), false);
  });

  it("defines complete priority & focus reset payload for NOT_RELEVANT leads", () => {
    assert.deepEqual(NOT_RELEVANT_PRIORITY_RESET, {
      priority: "LOW",
      prioritySource: "SYSTEM",
      priorityRatedAt: null,
      priorityRatedById: null,
      priorityRatedByName: null,
      isFocus: false,
    });
  });

  it("recalculates system priority from score when restoring from NOT_RELEVANT", () => {
    assert.equal(systemPriorityForScore(90), "HIGH");
    assert.equal(systemPriorityForScore(70), "HIGH");
    assert.equal(systemPriorityForScore(69), "MEDIUM");
    assert.equal(systemPriorityForScore(40), "MEDIUM");
    assert.equal(systemPriorityForScore(39), "LOW");
    assert.equal(systemPriorityForScore(0), "LOW");
    assert.equal(systemPriorityForScore(null), "LOW");
    assert.equal(systemPriorityForScore(undefined), "LOW");
    assert.equal(systemPriorityForScore(Number.NaN), "LOW");
  });
});
