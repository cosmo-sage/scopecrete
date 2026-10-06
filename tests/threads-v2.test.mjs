// Threads v2 (src/lib/v34/threads.ts) — `npm test`. Made-up people and numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleOf, initials, sortRows, nextSort, buildChannels, inChannel, isSystemKey } from "../src/lib/v34/threads.ts";

test("roles: the primary person is the customer, anyone else on it a customer's contact; subs are subs", () => {
  const base = { subtype: null, customer_id: "c1", is_primary_on_customer: true, customer_people: 2 };
  assert.equal(roleOf({ ...base, bucket: "customer" }), "customer");
  assert.equal(roleOf({ ...base, bucket: "customer", is_primary_on_customer: false }), "contact");
  assert.equal(roleOf({ ...base, bucket: "customer", is_primary_on_customer: false, customer_people: 1 }), "customer", "the only person is the customer");
  assert.equal(roleOf({ ...base, bucket: "vendor", subtype: "subcontractor" }), "sub");
  assert.equal(roleOf({ ...base, bucket: "vendor", subtype: "supplier" }), "vendor");
  assert.equal(roleOf({ ...base, bucket: null }), "unsorted");
});

test("initials and system keys", () => {
  assert.equal(initials("Wilson Driveway Repair"), "WD");
  assert.equal(initials("Phase 2 sidewalks"), "P2");
  assert.equal(initials("Amber"), "AM");
  assert.equal(initials(""), "#");
  assert.equal(isSystemKey("customers"), true);
  assert.equal(isSystemKey("3f2a…"), false);
});

test("sorting: recent, A–Z with numbers last, by role", () => {
  const rows = [
    { display_name: "Zed", name_is_phone: false, occurred_at: "2026-10-01", role: "vendor" },
    { display_name: "(225) 555-0100", name_is_phone: true, occurred_at: "2026-10-03", role: "unsorted" },
    { display_name: "amy", name_is_phone: false, occurred_at: "2026-09-01", role: "customer" },
  ];
  assert.deepEqual(sortRows(rows, "recent").map((r) => r.display_name), ["(225) 555-0100", "Zed", "amy"]);
  assert.deepEqual(sortRows(rows, "az").map((r) => r.display_name), ["amy", "Zed", "(225) 555-0100"]);
  assert.deepEqual(sortRows(rows, "role").map((r) => r.display_name), ["amy", "Zed", "(225) 555-0100"]);
  assert.equal(nextSort("recent"), "az"); assert.equal(nextSort("role"), "recent");
});

test("channels: one per number (from the contact or their messages), then email, then chat", () => {
  const ch = buildChannels({
    phones: [{ phone: "+12255550100", label: null, is_primary: true }],
    emails: [],
    messages: [
      { channel: "call", counterparty: "+12255550100" }, { channel: "sms", counterparty: "+12255550100" },
      { channel: "voicemail", counterparty: "+12255550101" }, { channel: "sms", counterparty: null },
    ],
    emailCount: 0,
  });
  assert.deepEqual(ch.map((c) => [c.key, c.label, c.calls, c.texts, c.reachable]), [
    ["phone:+12255550100", "Cell", 1, 1, true],
    ["phone:+12255550101", "Phone 2", 1, 0, true],
    ["email", "Email", 0, 0, false],
    ["chat", "AI Chat", 0, 0, false],
  ]);
  const m = (channel, counterparty) => ({ channel, counterparty });
  assert.equal(inChannel(m("sms", "+12255550100"), ch[0], "all"), true);
  assert.equal(inChannel(m("sms", "+12255550101"), ch[0], "all"), false, "another number is another channel");
  assert.equal(inChannel(m("voicemail", "+12255550100"), ch[0], "call"), true, "calls include voicemails");
  assert.equal(inChannel(m("call", "+12255550100"), ch[0], "text"), false);
  assert.equal(inChannel(m("sms", null), ch[0], "all"), true, "a message with no number stays on the first channel's view");
});

test("thread search reads a kind of thing out of the words", async () => {
  const { readThreadQuery } = await import("../src/lib/v34/threads.ts");
  assert.deepEqual(readThreadQuery("photos of the driveway"), { words: "of the driveway", type: "photo" });
  assert.deepEqual(readThreadQuery("voicemail"), { words: "", type: "vm" });
  assert.deepEqual(readThreadQuery("price for the patio"), { words: "price for the patio", type: "all" });
  assert.deepEqual(readThreadQuery("pdf quote, calls"), { words: "quote, calls", type: "file" }, "only the first kind word picks the type");
});

test("initialsHue: one colour per person, none without a name", async () => {
  const { initialsHue, INITIALS_HUES } = await import("../src/lib/v34/threads.ts");
  assert.equal(initialsHue(null), null);
  assert.equal(initialsHue("  "), null);
  assert.equal(initialsHue("Jeremy Wright"), initialsHue("jeremy  wright"));
  assert.ok(INITIALS_HUES.includes(initialsHue("Amber")));
  const names = ["Amber", "Luis", "Jeremy Wright", "Johnette Wilson", "Dylan Ordoyne", "John Freeling", "Gary Davis", "Maurice Watkins"];
  assert.ok(new Set(names.map(initialsHue)).size >= 4, "a variety of colours");
});
