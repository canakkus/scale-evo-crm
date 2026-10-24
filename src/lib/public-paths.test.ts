import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicCrmPath } from "./public-paths";

describe("isPublicCrmPath", () => {
  it("keeps the token calendar feed public and the rest of the CRM private", () => {
    assert.equal(isPublicCrmPath("/api/calendar/feed/abcDEF_123-token"), true);
    assert.equal(isPublicCrmPath("/api/calendar/subscribe"), false);
    assert.equal(isPublicCrmPath("/api/planned-calls"), false);
    assert.equal(isPublicCrmPath("/calendar"), false);
    assert.equal(isPublicCrmPath("/api/agent/leads"), true);
    assert.equal(isPublicCrmPath("/leads"), false);
  });
});
