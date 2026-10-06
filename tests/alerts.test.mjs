import { test } from "node:test";
import assert from "node:assert/strict";
import { messageAlert, emailAlert, mergeAlerts, unreadCount, liveCallFor, liveLabel, who, isFiledSpam } from "../src/lib/alerts.ts";

const person = (o = {}) => ({ id: "c1", name: "Dylan Ordoyne", phone: "+12255551234", contact_type: "customer", classification_confirmed_at: null, auto_classified_at: null, ...o });

test("a text names who sent it and opens their thread", () => {
  const a = messageAlert({ id: "m1", contact_id: "c1", channel: "sms", body_text: "Can you  look at the\nbridge plans?", summary: null, created_at: "2026-10-06T12:00:00Z" }, person());
  assert.equal(a.title, "Text from Dylan Ordoyne");
  assert.equal(a.body, "Can you look at the bridge plans?");
  assert.equal(a.href, "/dashboard/messages/c1");
  assert.equal(a.id, "m:m1");
});

test("a photo with no words says so; an unnamed number shows the number", () => {
  const a = messageAlert({ id: "m2", contact_id: "c2", channel: "sms", body_text: "", summary: null, created_at: "x", media: 2 }, person({ id: "c2", name: "+12255551234" }));
  assert.equal(a.title, "Text from (225) 555-1234");
  assert.equal(a.body, "Sent 2 photos or files");
});

test("a call carries the first line of Quo's summary", () => {
  const a = messageAlert({ id: "m3", contact_id: "c1", channel: "call", body_text: null, summary: "\nWants a driveway quote.\nNext week.", created_at: "x" }, person());
  assert.equal(a.kind, "call");
  assert.equal(a.title, "Call from Dylan Ordoyne");
  assert.equal(a.body, "Wants a driveway quote.");
});

test("spam filed by Coy or Dusty raises nothing; a guess still does", () => {
  assert.equal(isFiledSpam(person({ contact_type: "spam", auto_classified_at: "x" })), true);
  assert.equal(messageAlert({ id: "m", contact_id: "c1", channel: "sms", body_text: "hi", summary: null, created_at: "x" }, person({ contact_type: "spam", classification_confirmed_at: "x" })), null);
  assert.ok(messageAlert({ id: "m", contact_id: "c1", channel: "sms", body_text: "hi", summary: null, created_at: "x" }, person({ contact_type: "spam" })));
});

test("an email names the original writer, drops Fwd:, and opens in Files", () => {
  const a = emailAlert({ id: "e1", created_at: "x", original_from_name: "Dylan Ordoyne", original_from_address: "dylano@la-cont.com", from_name: null, from_address: "admin@saccobuilt.com", subject: "Fwd: Melvin Kip Holden Pedestrian Bridge", contact_id: "c1", status: "filed" });
  assert.equal(a.title, "Email from Dylan Ordoyne");
  assert.equal(a.body, "Melvin Kip Holden Pedestrian Bridge");
  assert.equal(a.href, "/dashboard/files?email=e1");
  assert.match(emailAlert({ id: "e2", created_at: "x", original_from_name: null, original_from_address: null, from_name: null, from_address: "a@b.c", subject: "", contact_id: null, status: "unfiled" }).body, /not filed yet/);
});

test("alerts merge newest first with no doubles, and count what is unseen", () => {
  const mk = (id, at) => ({ id, kind: "text", at, title: id, body: "", href: null, contact_id: null });
  const m = mergeAlerts([mk("a", "2026-10-06T10:00:00Z"), mk("b", "2026-10-06T12:00:00Z")], [mk("a", "2026-10-06T10:00:00Z"), mk("c", "2026-10-06T11:00:00Z")]);
  assert.deepEqual(m.map((x) => x.id), ["b", "c", "a"]);
  assert.equal(unreadCount(m, "2026-10-06T10:30:00Z"), 2);
  assert.equal(unreadCount(m, null), 3);
});

const call = (o = {}) => ({ id: "l1", call_id: "AC1", contact_id: "c1", phone: "+12255551234", name: "Dylan", direction: "inbound", status: "ringing", started_at: "2026-10-06T12:00:00Z", answered_at: null, line: "Main", href: null, ...o });

test("a live call is found by person, and by number on a channel", () => {
  assert.equal(liveCallFor([call()], "c1")?.id, "l1");
  assert.equal(liveCallFor([call()], "c1", "(225) 555-1234")?.id, "l1");
  assert.equal(liveCallFor([call()], "c1", "+12259999999"), null);
  assert.equal(liveCallFor([call({ contact_id: null })], null, "2255551234")?.id, "l1");
  assert.equal(liveCallFor([call()], "c9"), null);
});

test("ringing, then on a call with its length", () => {
  const t0 = Date.parse("2026-10-06T12:00:00Z");
  assert.equal(liveLabel(call(), t0 + 10_000), "Ringing");
  assert.equal(liveLabel(call({ direction: "outbound" }), t0 + 10_000), "Calling…");
  assert.equal(liveLabel(call(), t0 + 187_000), "On a call · 3:07");
  assert.equal(liveLabel(call({ status: "answered", answered_at: "2026-10-06T12:00:20Z" }), t0 + 30_000), "On a call · 0:10");
});

test("a name that is only a number is no name", () => {
  assert.equal(who("+1 225 555 1234", "+12255551234"), "(225) 555-1234");
  assert.equal(who(null, null), "Unknown number");
});
