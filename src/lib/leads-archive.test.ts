import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVED_STATUSES,
  NOT_RELEVANT_PRIORITY_RESET,
  buildLeadsWhereClause,
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

  it("excludes archived leads by default and scopes archive view to ARCHIVED_STATUSES", () => {
    const scope = { createdById: "user-1" };

    const activeWhere = buildLeadsWhereClause(scope, {});
    assert.deepEqual(activeWhere.status, { notIn: ARCHIVED_STATUSES });

    const archiveWhere = buildLeadsWhereClause(scope, { archived: true });
    assert.deepEqual(archiveWhere.status, { in: ARCHIVED_STATUSES });

    const explicitStatusWhere = buildLeadsWhereClause(scope, { status: "NOT_RELEVANT" });
    assert.equal(explicitStatusWhere.status, "NOT_RELEVANT");
  });

  it("excludes NOT_RELEVANT leads when filtering by priority even in archive or includeArchived mode", () => {
    const scope = { createdById: "user-1" };

    const lowPriorityArchive = buildLeadsWhereClause(scope, {
      archived: true,
      priority: "LOW",
    });
    assert.equal(lowPriorityArchive.priority, "LOW");
    assert.deepEqual(lowPriorityArchive.AND, [
      scope,
      { status: { not: "NOT_RELEVANT" } },
    ]);
  });

  it("preserves both manual source filter and null industry filter without OR collision", () => {
    const scope = { createdById: "user-1" };
    const where = buildLeadsWhereClause(scope, {
      source: "manual",
      industry: "Friseur,Keine Angabe",
    });
    const andList = where.AND as unknown[];
    assert.equal(andList.length, 3);
  });
});

