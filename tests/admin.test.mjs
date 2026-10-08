// The ScopeCrete admin (src/lib/admin.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sinceFor, readRange, setupCount, stepDone, companyStatus, companyHealth, riskLine, workerState, alarms,
  readParts, readScreen, cleanSlug, bytes, ago, dayGap, dropPct, missing091, readReason, PARTS,
} from "../src/lib/admin.ts";

const now = new Date("2026-10-08T15:00:00Z"); // 10 AM Central
const iso = (daysBack) => new Date(now.getTime() - daysBack * 864e5).toISOString();
const fullSetup = { quo: iso(90), email: iso(90), lines: iso(90), logo: null, logo_set: true, tax: iso(80), pricebook: iso(80), assemblies: iso(70), people: iso(90), proposal: iso(60) };
const co = (o = {}) => ({ id: "a", name: "Acme", slug: "acme", plan: "solo", created_at: iso(100), members: 2, invited: 0, owner: "Coy",
  last_active: iso(0.1), inbound: 0, outbound: 0, emails: 0, dusty_questions: 0, jobs_open: 0, jobs_made: 0, bids_filed: 0,
  proposals_sent: 0, proposals_opened: 0, proposals_30d: 0, drift: 0, intake_errors_24h: 0, bids_stuck: 0, file_bytes: 0,
  spark: [0, 0, 0, 0, 0, 0, 0], setup: fullSetup, first_inbound: null, first_job: null, ...o });

test("ranges start at Central midnight, or 7 / 30 days back", () => {
  assert.equal(sinceFor("today", now), "2026-10-08T05:00:00.000Z");
  assert.equal(sinceFor("d7", now), "2026-10-01T15:00:00.000Z");
  assert.equal(readRange("d30"), "d30");
  assert.equal(readRange("forever"), "today");
});

test("setup: a logo set before the audit counts with no date", () => {
  assert.equal(stepDone(fullSetup, "logo"), true);
  assert.equal(setupCount(fullSetup), 9);
  assert.equal(setupCount({ ...fullSetup, logo_set: false, proposal: null }), 7);
  assert.equal(setupCount(null), 0);
});

test("status: setting up while young, then quiet and at risk by last activity", () => {
  assert.equal(companyStatus(co(), now), "active");
  assert.equal(companyStatus(co({ created_at: iso(5), setup: { ...fullSetup, proposal: null } }), now), "setup");
  assert.equal(companyStatus(co({ created_at: iso(5) }), now), "active");
  assert.equal(companyStatus(co({ last_active: iso(4) }), now), "quiet");
  assert.equal(companyStatus(co({ last_active: iso(9) }), now), "risk");
  assert.equal(companyStatus(co({ last_active: null }), now), "risk");
});

test("health: red when something didn't get through, amber when slipping", () => {
  assert.equal(companyHealth(co(), now), "g");
  assert.equal(companyHealth(co({ drift: 2 }), now), "r");
  assert.equal(companyHealth(co({ bids_stuck: 1 }), now), "r");
  assert.equal(companyHealth(co({ last_active: iso(4) }), now), "a");
});

test("risk line says why", () => {
  assert.equal(riskLine(co({ last_active: iso(9) }), now), "No sign-in or Dusty question in 9 d");
  assert.equal(riskLine(co({ last_active: null }), now), "Nobody has signed in yet");
  assert.equal(riskLine(co({ created_at: iso(10), setup: { ...fullSetup, tax: null, pricebook: null, assemblies: null, people: null } }), now), "Setup stalled at 5 of 9");
  assert.equal(riskLine(co(), now), null);
});

test("workers: dreams may wait 3 h, the rest 15 min", () => {
  assert.equal(workerState({ worker: "dusty-dream", status: "ok", detail: null, at: iso(2 / 24) }, now), "ok");
  assert.equal(workerState({ worker: "read-files", status: "ok", detail: null, at: iso(20 / 1440) }, now), "silent");
  assert.equal(workerState({ worker: "read-files", status: "error", detail: "x", at: iso(0) }, now), "error");
  assert.equal(workerState({ worker: "bid-intake", status: "not_configured", detail: null, at: iso(0) }, now), "not_configured");
});

test("alarms: reds first, platform limits at 80%", () => {
  const a = alarms([co({ last_active: iso(10) }), co({ id: "b", drift: 3 })],
    [{ worker: "read-files", status: "ok", detail: null, at: iso(1) }],
    { db_bytes: 450 * 1024 ** 2, storage: [{ bucket: "job-files", bytes: 100, objects: 1 }] }, now);
  assert.deepEqual(a.map((x) => x.sev), ["r", "r", "a", "a"]);
  assert.equal(a[0].org_id, "b");
  assert.match(a[0].msg, /3 events landed/);
  assert.equal(a.at(-1).link, "costs");
  assert.deepEqual(alarms([co()], [], null, now), []);
});

test("parts and screens are whitelisted", () => {
  assert.deepEqual(readParts("companies,log,drop table,platform"), ["companies", "platform", "log"]);
  assert.deepEqual(readParts(null), []);
  assert.equal(readScreen("company"), "company");
  assert.equal(readScreen("nope"), "pulse");
  for (const v of Object.values(PARTS)) assert.ok(v.length > 0);
});

test("small formatters", () => {
  assert.equal(cleanSlug("Cypress Concrete!"), "cypressconcrete");
  assert.equal(bytes(139 * 1024 ** 2), "139 MB");
  assert.equal(bytes(1.5 * 1024 ** 3), "1.5 GB");
  assert.equal(ago(iso(0.5 / 1440), now), "just now");
  assert.equal(ago(iso(3 / 24), now), "3 h ago");
  assert.equal(ago(null, now), "never");
  assert.equal(dayGap(iso(10), iso(4)), 6);
  assert.equal(dayGap(null, iso(1)), null);
  assert.equal(dropPct(100, 58), 42);
  assert.equal(dropPct(0, 0), null);
  assert.equal(missing091({ code: "PGRST202" }), true);
  assert.equal(missing091({ message: "permission denied" }), false);
  assert.equal(readReason("  ok "), null);
  assert.equal(readReason("customer asked"), "customer asked");
});
