// A vendor's bid used on the budget (src/lib/bid-ref.ts) and Dusty's use_bid step — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bidAnswerLines, bidCovers, bidHref, bidLineName, bidRef, markBid, unmarkBid } from "../src/lib/bid-ref.ts";
import { unmark } from "../src/lib/estimate-flag.ts";
import { cleanAction, describe } from "../src/lib/dusty/plan.ts";

const REQ = "2cfeabc4-b16f-43d6-a626-b0dfd88ac2cb";
const REC = "df792bd7-255c-4a2d-8d1f-d2c705510452";
const JOB = "3f25ad9c-e44c-4ae7-b2bf-339c085c60ca";

test("the mark reads back, sits after a note, and comes off for the proposal", () => {
  const d = markBid(null, { label: "Luis, answered Oct 23", request: REQ, recipient: REC });
  assert.equal(d, `Bid — Luis, answered Oct 23 [bid:${REQ}:${REC}]`);
  assert.deepEqual(bidRef(d), { label: "Luis, answered Oct 23", request: REQ, recipient: REC });
  assert.equal(unmarkBid(d), null);
  const n = markBid("Crew of 4", { label: "Luis", request: REQ, recipient: REC });
  assert.equal(unmarkBid(n), "Crew of 4");
  assert.equal(bidRef(markBid(n, { label: "Luis", request: REQ, recipient: REC })).recipient, REC);
  assert.equal((markBid(n, { label: "Luis", request: REQ, recipient: REC }).match(/\[bid:/g) ?? []).length, 1);
  assert.equal(bidRef("Crew of 4"), null);
  assert.equal(unmark(unmarkBid(`${n} · Estimate — going rate`)), "Crew of 4");
  assert.equal(bidHref(JOB, REQ), `/dashboard/scope/${JOB}/summary?bid=${REQ}`);
});

test("what a bid covers: its lines, not the ones we supply, and one cost type", () => {
  const labor = bidCovers([{ lines: [{ key: "a", supplied: false, group: "labor" }, { key: "b", supplied: false, group: "labor" }, { key: "c", supplied: true, group: "materials" }] }]);
  assert.deepEqual(labor, { keys: ["a", "b"], cost_type: "labor" });
  assert.equal(bidCovers([{ lines: [{ key: "a", supplied: false, group: "labor" }, { key: "b", supplied: false, group: "materials" }] }]).cost_type, "subcontract");
  assert.equal(bidLineName("Luis", "labor"), "Labor — Luis's bid");
  assert.equal(bidLineName("Chris", "subcontract"), "Subcontract — Chris's bid");
});

test("Dusty reads each vendor's answer and whether it's on the budget", () => {
  const reqs = [{ id: REQ, created_at: "2026-10-22T15:00:00Z", price_mode: "lump", price_by: "2026-10-24", note: null,
    scopes: [{ title: "16x6 Pad", lines: [{ key: "x", name: "Labor (residential crew)", qty: null, unit: null, supplied: false, group: "labor" }] }],
    recipients: [
      { id: REC, name: "Luis", sent_at: "2026-10-22T15:00:00Z", opened_at: "2026-10-23T18:00:00Z", view_count: 3, answered_at: "2026-10-23T19:37:00Z", price_total: 3500, price_lines: null, answer_note: null, revoked_at: null },
      { id: "11111111-1111-1111-1111-111111111111", name: "Kim", sent_at: "2026-10-22T15:00:00Z", opened_at: null, view_count: 0, answered_at: null, price_total: null, price_lines: null, answer_note: null, revoked_at: null },
    ] }];
  const lines = bidAnswerLines(reqs, new Map());
  assert.match(lines[0], /one lump sum · asked for: 16x6 Pad: Labor \(residential crew\)/);
  assert.match(lines[1], new RegExp(`Luis \\(recipient ${REC}\\): ANSWERED Oct 23: \\$3,500.00 as one total`));
  assert.match(lines[2], /Kim .*sent, not opened/);
  assert.match(bidAnswerLines(reqs, new Map([[REC, "Labor — Luis's bid"]]))[1], /ALREADY ON THE BUDGET/);
});

test("use_bid needs full ids and replaces by default", () => {
  const a = cleanAction({ do: "use_bid", job: JOB, recipient: REC, vendor: "Luis" });
  assert.deepEqual(a, { do: "use_bid", job: JOB, recipient: REC, replace: true, vendor: "Luis" });
  assert.equal(cleanAction({ do: "use_bid", job: JOB, recipient: "df792bd7" }), null);
  assert.equal(cleanAction({ do: "use_bid", job: JOB, recipient: REC, replace: false }).replace, false);
  assert.match(describe(a), /Luis's bid on the budget .* take off the lines it priced/);
});
