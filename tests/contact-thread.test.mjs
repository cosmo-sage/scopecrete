// The contact thread under Spaces (src/lib/v34/contact-thread.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReading, toggleFilter, searchPlaceholder, matches, scoped, roleWord, firstLine, readSize, READ_DEFAULT } from "../src/lib/v34/contact-thread.ts";

test("reading settings: anything unknown is the default, M is 1.15×", () => {
  assert.deepEqual(cleanReading(null), READ_DEFAULT);
  assert.deepEqual(cleanReading({ size: "xl", font: "serif", bg: "dots" }), { size: "xl", font: "serif", bg: "dots" });
  assert.deepEqual(cleanReading({ size: "huge", font: 3, bg: "grid" }), { size: "m", font: "plex", bg: "grid" });
  assert.equal(readSize(READ_DEFAULT).z, 1.15);
});

test("one filter at a time; tapping the one on turns it off", () => {
  assert.equal(toggleFilter("all", "phone"), "phone");
  assert.equal(toggleFilter("phone", "email"), "email");
  assert.equal(toggleFilter("email", "email"), "all");
  assert.equal(searchPlaceholder("phone"), "Search calls & texts…");
  assert.equal(searchPlaceholder("all"), "Search texts, emails, calls, notes…");
});

test("search is every word, any case, scoped to the filter", () => {
  assert.ok(matches("Pour is Friday at 7", "friday pour"));
  assert.ok(!matches("Pour is Friday", "friday mesh"));
  const items = {
    messages: [{ body_text: "Mesh price?" }, { summary: "Talked about the pour", body_text: null }, { voicemail: { text: "call me about mesh" } }],
    emails: [{ subject: "Mesh reprice", body: "attached" }, { subject: "Plans", body: "see sheet" }],
    notes: [{ body: "mesh is 6x6" }],
  };
  assert.equal(scoped("all", "mesh", items).count, 4);
  assert.equal(scoped("phone", "mesh", items).count, 2);
  assert.equal(scoped("email", "mesh", items).count, 1);
  assert.equal(scoped("phone", "", items).notes.length, 0);
  assert.equal(scoped("all", "", items).count, 6);
});

test("the role word and an email's first line", () => {
  assert.equal(roleWord("vendor", "c1"), "Vendor");
  assert.equal(roleWord("customer", "c1"), "Customer");
  assert.equal(roleWord("unsorted", null), null);
  assert.equal(firstLine("\n\n> quoted\nHi Coy,\nmore"), "Hi Coy,");
  assert.equal(firstLine(""), "");
});
