// Feedback and the Roadmap (src/lib/roadmap.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFeedback, readAdmin, sortItems, matchesItem, isPublic, canVote, missing084 } from "../src/lib/roadmap.ts";

test("feedback needs something to say; the first line becomes the title", () => {
  assert.equal(readFeedback({ title: "", body: "" }).ok, false);
  assert.equal(readFeedback({ title: "ok" }).ok, false);
  const one = readFeedback({ body: "Let me add a second phone number" });
  assert.deepEqual(one.ok && one.feedback, { title: "Let me add a second phone number", body: "", kind: "idea", page: null });
  const two = readFeedback({ body: "Dark map\nThe aerial is too bright", kind: "bug", page: "/dashboard/scope" });
  assert.equal(two.ok && two.feedback.title, "Dark map");
  assert.equal(two.ok && two.feedback.body, "Dark map\nThe aerial is too bright");
  assert.equal(two.ok && two.feedback.kind, "bug");
  const odd = readFeedback({ title: "Hello there", kind: "drop table", page: "https://evil" });
  assert.equal(odd.ok && odd.feedback.kind, "idea");
  assert.equal(odd.ok && odd.feedback.page, null);
  const long = readFeedback({ body: "x".repeat(300) });
  assert.equal(long.ok && long.feedback.title.length, 138);
});

test("Coy's changes keep only what's known", () => {
  assert.deepEqual(readAdmin({ status: "planned", title: "  Offline  ", note: "" }), { status: "planned", title: "Offline", note: "" });
  assert.deepEqual(readAdmin({ status: "shipped", title: "x" }), {});
});

test("what's public and what can be voted on", () => {
  assert.equal(isPublic("new"), false);
  assert.equal(isPublic("declined"), false);
  assert.equal(isPublic("planned"), true);
  assert.equal(canVote("released"), false);
  assert.equal(canVote("considering"), true);
});

test("top sorts by votes, then the latest move; search needs every word", () => {
  const a = { id: "a", votes: 2, status_at: "2026-10-01", created_at: "2026-09-01", title: "Offline mode", body: "", admin_note: null };
  const b = { id: "b", votes: 5, status_at: "2026-09-01", created_at: "2026-10-02", title: "Dark map", body: "aerial", admin_note: null };
  const c = { id: "c", votes: 2, status_at: "2026-10-03", created_at: "2026-08-01", title: "Invoices", body: "", admin_note: "next update" };
  assert.deepEqual(sortItems([a, b, c], "top").map((x) => x.id), ["b", "c", "a"]);
  assert.deepEqual(sortItems([a, b, c], "new").map((x) => x.id), ["b", "a", "c"]);
  assert.equal(matchesItem(b, "dark aerial"), true);
  assert.equal(matchesItem(b, "dark offline"), false);
  assert.equal(matchesItem(c, "update"), true);
});

test("a missing 084 is recognised", () => {
  assert.equal(missing084({ code: "PGRST202", message: "Could not find the function public.sc_roadmap_list" }), true);
  assert.equal(missing084({ code: "P0001", message: "item not found" }), false);
});
