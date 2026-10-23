import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pagesOf, cleanPages, cleanIfFind, sellOf, insertAfter, movePage, stepPage, duplicatePage, removePage, missingBuilt,
  makePage, paymentLine, validLabel, sendCheck, textBlocks, stampText, inlineRuns, BUILT, sourceOf,
} from "../src/lib/proposal-pages.ts";

const U = "11111111-2222-4333-8444-555555555555";

test("an old proposal reads as its old sections, At a glance and If we find… off", () => {
  const p = pagesOf({ off: { scope: true } });
  assert.deepEqual(p.map((x) => x.kind), BUILT.map((b) => b.kind));
  assert.equal(p.find((x) => x.kind === "scope").off, true);
  assert.equal(p.find((x) => x.kind === "glance").off, true);
  assert.equal(p.find((x) => x.kind === "ifind").off, true);
  assert.equal(p.find((x) => x.kind === "pricing").off, undefined);
  // The title page is off only when both the cover and the header were.
  assert.equal(pagesOf({ off: { cover: true } }).find((x) => x.kind === "title").off, undefined);
  assert.equal(pagesOf({ off: { cover: true, header: true } }).find((x) => x.kind === "title").off, true);
  // Opened in the builder, At a glance is on.
  assert.equal(pagesOf({}, { fresh: true }).find((x) => x.kind === "glance").off, undefined);
});

test("saved pages are cleaned: known kinds, a built page once, real file ids", () => {
  const p = cleanPages([
    { id: "title", kind: "title", label: "Title" },
    { id: "title", kind: "title", label: "Again" },
    { id: "a", kind: "bogus", label: "x" },
    { id: "b", kind: "text", label: "Why\nus", body: "hi", off: true },
    { id: "c", kind: "photos", label: "Site", photos: [{ id: U, caption: "Front" }, { id: "nope" }], across: 5 },
    { id: "d", kind: "pdf", label: "Spec", file: U, skip: [3, 1, 3, -2] },
  ]);
  assert.deepEqual(p.map((x) => x.kind), ["title", "text", "photos", "pdf"]);
  assert.equal(p[1].label, "Why us");
  assert.equal(p[1].off, true);
  assert.deepEqual(p[2].photos, [{ id: U, caption: "Front" }]);
  assert.equal(p[2].across, 2);
  assert.deepEqual(p[3].skip, [1, 3]);
  assert.equal(cleanPages([]), undefined);
  assert.equal(cleanPages("x"), undefined);
});

test("If we find… lines need a name and a price", () => {
  const l = cleanIfFind([{ name: "Remove buried slab", unit: "SF", sell: 4.256 }, { name: "", sell: 3 }, { name: "x", sell: -1 }, { name: "Root", sell: "12", item_id: U, note: "per stump" }]);
  assert.equal(l.length, 2);
  assert.equal(l[0].sell, 4.26);
  assert.equal(l[1].item_id, U);
  assert.equal(l[1].note, "per stump");
});

test("a Price book item's sell price is cost with O.H. then margin, up to the cent", () => {
  assert.equal(sellOf(10, 15, 20), 14.38);
  assert.equal(sellOf(10, null, 20), null);
  assert.equal(sellOf(10, 15, 100), null);
});

test("pages move, step, copy and go", () => {
  const p = cleanPages([{ id: "a", kind: "text", label: "A" }, { id: "b", kind: "text", label: "B" }, { id: "c", kind: "photos", label: "C" }]);
  assert.deepEqual(movePage(p, "c", "a").map((x) => x.id), ["c", "a", "b"]);
  assert.deepEqual(movePage(p, "a", null).map((x) => x.id), ["b", "c", "a"]);
  assert.deepEqual(stepPage(p, "a", -1).map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(stepPage(p, "a", 1).map((x) => x.id), ["b", "a", "c"]);
  const d = duplicatePage(p, "c");
  assert.equal(d.pages.length, 4);
  assert.equal(d.pages[3].label, "C (copy)");
  assert.equal(d.pages[3].isNew, true);
  assert.equal(duplicatePage(pagesOf({}), "title").id, null);
  assert.deepEqual(removePage(p, "b").map((x) => x.id), ["a", "c"]);
  assert.equal(insertAfter(p, "a", makePage("pdf", ["a", "b", "c"])).at(1).kind, "pdf");
  assert.deepEqual(missingBuilt(cleanPages([{ id: "t", kind: "title", label: "T" }])).map((b) => b.kind).slice(0, 2), ["glance", "scope"]);
  assert.equal(sourceOf({ kind: "pricing" }).tint, "live");
});

test("the payment line and Valid until", () => {
  assert.equal(paymentLine([{ when: "On completion", pct: 100 }]), "Nothing due until it's done");
  assert.equal(paymentLine([{ when: "To start", pct: 30 }, { when: "On completion", pct: 70 }]), "2 payments — 30% To start");
  assert.equal(paymentLine([]), "Payment terms on the Payments page");
  assert.equal(validLabel("2026-11-22"), "Nov 22, 2026");
  assert.equal(validLabel("soon"), null);
});

test("the check before sending names what to look at", () => {
  const pages = cleanPages([
    { id: "t", kind: "title", label: "Title" },
    { id: "n", kind: "text", label: "New page", body: "" },
    { id: "f", kind: "pdf", label: "Spec" },
    { id: "pr", kind: "pricing", label: "Pricing" },
    { id: "x", kind: "text", label: "Off one", body: "", off: true },
  ]);
  const f = sendCheck({ pages, lines: [{ name: "Concrete", qty: 12, unit: "" }], valid_until: "2026-10-01", today: "2026-10-23" });
  const what = f.map((x) => x.what).join(" | ");
  assert.match(what, /starting name/);
  assert.match(what, /empty/);
  assert.match(what, /has no file/);
  assert.match(what, /"Concrete" has a quantity and no unit/);
  assert.match(what, /already passed/);
  assert.ok(!what.includes("Off one"));
  assert.equal(sendCheck({ pages: cleanPages([{ id: "t", kind: "title", label: "T" }]), valid_until: "2026-12-01", today: "2026-10-23" }).length, 0);
});

test("a text page's words become headings, bullets and paragraphs", () => {
  const b = textBlocks("# Why us\nWe pour.\nEvery day.\n\n- one\n- two\n\nLast");
  assert.deepEqual(b, [{ t: "h", text: "Why us" }, { t: "p", text: "We pour. Every day." }, { t: "ul", items: ["one", "two"] }, { t: "p", text: "Last" }]);
  assert.deepEqual(inlineRuns("a **bold** and _soft_ word"), [{ t: "a " }, { t: "bold", b: true }, { t: " and " }, { t: "soft", i: true }, { t: " word" }]);
  assert.deepEqual(inlineRuns("snake_case_name"), [{ t: "snake_case_name" }]);
});

test("the camera stamp", () => {
  assert.equal(stampText("2026-10-14T15:00:00Z", 30.38641, -91.071), "Oct 14, 2026 · 30.3864° N, 91.0710° W");
  assert.equal(stampText(null, null, null), null);
  assert.equal(stampText("2026-10-14T15:00:00Z", null, null), "Oct 14, 2026");
});
