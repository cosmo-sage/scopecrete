import { test } from "node:test";
import assert from "node:assert/strict";
import { lineColor, eventKind, callIdOf, eventStatus, latencyMs, latencyText, lineOfEvent, otherParty, readLogFilter, logFilterQuery, matchesLog, providerCard } from "../src/lib/lines.ts";

test("colours: a line's own, else in order", () => {
  assert.equal(lineColor({ color_token: null }, 0), "hiviz");
  assert.equal(lineColor({ color_token: null }, 6), "chalk");
  assert.equal(lineColor({ color_token: "teal" }, 0), "teal");
  assert.equal(lineColor({ color_token: "purple" }, 2), "violet");
  assert.equal(providerCard("quo").built, true);
  assert.equal(providerCard("twilio").built, false);
  assert.equal(providerCard(null), null);
});

test("events: kind, call, line and the other party", () => {
  assert.equal(eventKind("call.completed"), "call");
  assert.equal(eventKind("call.transcript.completed"), "call");
  assert.equal(eventKind("message.received"), "text");
  assert.equal(eventKind("webhook.retry"), "webhook");
  assert.equal(callIdOf("call.completed", { id: "AC1" }), "AC1");
  assert.equal(callIdOf("call.summary.completed", { callId: "AC1" }), "AC1");
  assert.equal(callIdOf("message.received", { id: "AC9" }), null);
  const ours = new Map([["+12255550100", "main"], ["+12255550199", "web"]]);
  assert.equal(lineOfEvent({ from_phone: "+12255550111", to_phone: "+12255550199" }, ours), "web");
  assert.equal(lineOfEvent({ from_phone: "+12255550100", to_phone: "+12255550111" }, ours), "main");
  assert.equal(lineOfEvent({ from_phone: "+1", to_phone: "+2" }, ours), null);
  assert.equal(otherParty({ from_phone: "+12255550100", to_phone: "+12255550111" }, ours), "+12255550111");
});

test("status: failed, pending, late, ok — and the latency", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const base = { event_type: "message.received", received_at: "2026-10-04T11:59:30Z", projected_at: null, projection_error: null };
  assert.equal(eventStatus(base, null, now), "pending");
  assert.equal(eventStatus({ ...base, received_at: "2026-10-04T11:50:00Z" }, null, now), "failed");
  assert.equal(eventStatus({ ...base, projected_at: "2026-10-04T11:59:30Z", projection_error: "XX: boom" }, null, now), "failed");
  assert.equal(eventStatus({ ...base, projected_at: "2026-10-04T11:59:31Z" }, null, now), "ok");
  const art = { event_type: "call.transcript.completed", received_at: "2026-10-04T11:30:00Z", projected_at: "2026-10-04T11:30:00Z", projection_error: null };
  assert.equal(eventStatus(art, "2026-10-04T11:10:00Z", now), "late");
  assert.equal(eventStatus(art, "2026-10-04T11:25:00Z", now), "ok");
  assert.equal(latencyMs({ received_at: "2026-10-04T11:30:00Z", projected_at: "2026-10-04T11:30:01.5Z" }), 1500);
  assert.equal(latencyText(1500), "1.5 s");
  assert.equal(latencyText(null), "—");
});

test("Logs' filter lives in the address", () => {
  const f = readLogFilter(new URLSearchParams("line=L1&event=needs&provider=quo"));
  assert.deepEqual(f, { line: "L1", provider: "quo", event: "needs" });
  assert.equal(logFilterQuery(f), "?line=L1&provider=quo&event=needs");
  assert.equal(logFilterQuery(readLogFilter(new URLSearchParams("event=bogus"))), "");
  const row = { line_id: "L1", provider: "quo", kind: "text", status: "ok" };
  assert.equal(matchesLog(row, f), false, "needs you = not ok");
  assert.equal(matchesLog({ ...row, status: "late" }, f), true);
  assert.equal(matchesLog(row, { line: null, provider: null, event: "call" }), false);
});
