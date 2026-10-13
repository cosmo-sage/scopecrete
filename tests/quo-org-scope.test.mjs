// The env Quo key is Sacco Enterprises' alone (Coy, 2026-10-12). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quoKeyFor, quoKeyOrg, quoLineRefusal, sendQuoText } from "../src/lib/quo.ts";

const SACCO = "61e26b09-da88-4c9f-bd0c-a47054b86234";
const GULF = "8c38d396-af17-446b-8fe0-6db099614758";

test("the key is used only for the org it belongs to", () => {
  const before = { key: process.env.QUO_API_KEY, org: process.env.QUO_ORG_ID };
  process.env.QUO_API_KEY = "k_test";
  delete process.env.QUO_ORG_ID;
  try {
    assert.equal(quoKeyOrg(), SACCO);
    assert.equal(quoKeyFor(SACCO), "k_test");
    assert.equal(quoKeyFor(GULF), null);
    assert.equal(quoKeyFor(""), null);
    process.env.QUO_ORG_ID = GULF;
    assert.equal(quoKeyFor(GULF), "k_test");
    assert.equal(quoKeyFor(SACCO), null);
  } finally {
    if (before.key === undefined) delete process.env.QUO_API_KEY; else process.env.QUO_API_KEY = before.key;
    if (before.org === undefined) delete process.env.QUO_ORG_ID; else process.env.QUO_ORG_ID = before.org;
  }
});

test("another company can't mark a line Quo, Sacco can, other providers are untouched", () => {
  assert.equal(quoLineRefusal(SACCO, "quo"), null);
  assert.match(quoLineRefusal(GULF, "quo") ?? "", /isn't connected/);
  assert.equal(quoLineRefusal(GULF, "telnyx"), null);
  assert.equal(quoLineRefusal(GULF, null), null);
});

test("another company's text is refused before Quo is asked", async () => {
  const r = await sendQuoText(GULF, "+12253782458", "+12255550100", "hi");
  assert.equal(r.ok, false);
  assert.equal(r.ok ? 0 : r.status, 409);
});
