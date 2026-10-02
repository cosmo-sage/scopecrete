// The bid reader's rules — `npm test`. Made-up names, addresses and links only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boxLinks, projectKey, sanitizeBid, monthDay, centralToUtc, docRole, skipBoxFile, concretePage } from "../supabase/functions/bid-intake/rules.ts";
import * as copy from "../supabase/functions/bid-intake/sheets.ts";
import * as sheets from "../src/lib/plan-sheets.ts";
import * as takeoff from "../src/lib/takeoff.ts";

test("Box links in every shape a bid email carries them", () => {
  const text = `Plans: https://app.box.com/s/AbC123xyz
  Mirror https://acmegc.app.box.com/s/Q9w8e7r6/folder/224466 and again https://app.box.com/s/AbC123xyz.
  Vanity: https://acmegc.box.com/v/plant3bid
  Safelink: https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fapp.box.com%2Fs%2FZzz999&data=x
  Not box: https://dropbox.com/s/abc and https://box.example.com/s/x`;
  assert.deepEqual(boxLinks(text), [
    { url: "https://app.box.com/s/AbC123xyz", folderId: null },
    { url: "https://acmegc.app.box.com/s/Q9w8e7r6", folderId: "224466" },
    { url: "https://acmegc.box.com/v/plant3bid", folderId: null },
    { url: "https://app.box.com/s/Zzz999", folderId: null },
  ]);
  assert.deepEqual(boxLinks(null), []);
});

test("an addendum matches its project", () => {
  assert.equal(projectKey("Fwd: ITB — Plant 3 Expansion, Addendum #2"), projectKey("Plant 3 expansion"));
  assert.notEqual(projectKey("Plant 3 Expansion"), projectKey("Plant 4 Expansion"));
  assert.equal(projectKey("Re: Bid"), null);
});

const SOURCE = `---------- Forwarded message ---------
From: Pat Doe <pat@example-gc.com>
Subject: ITB - Oak Street Clinic

Pat Doe | Estimator | Example GC Builders
(225) 555-0199  pat@example-gc.com
Bids are due Tuesday, October 14, 2026 at 2:00 PM. Pre-bid meeting October 7 at 10:00 AM on site.
Project: Oak Street Clinic, 1400 Oak Street, Baton Rouge, LA 70806
[Specs.pdf · p.12] 03 30 00 Cast-in-place concrete. Slab on grade: 5" thick, 4000 psi, #4 @ 18" O.C.E.W.
[Plans.pdf · p.3 · S-101 FOUNDATION PLAN] Continuous footing 24" wide, 3,000 PSI.`;

test("the model's reading is kept only where it is written", () => {
  const raw = {
    is_bid: true, project_name: "Oak Street Clinic", job_title: "Oak St Clinic",
    address: { line: "1400 Oak Street", city: "Baton Rouge", state: "la", zip: "70806" },
    gc_company: "Example GC Builders",
    estimator: { name: "Pat Doe", email: "pat@example-gc.com", phone: "(225) 555-0199" },
    bid_due_text: "October 14, 2026 at 2:00 PM", bid_due_iso: "2026-10-14T14:00",
    prebid_text: "Pre-bid meeting October 7 at 10:00 AM on site",
    scope_summary: "Slab on grade and footings.",
    items: [
      { name: "Slab on grade", work_type: "slab", psi: 4000, thickness_in: 5, reinforcement: "#4 @ 18\" O.C.E.W.", spec_section: "03 30 00", sheets: ["S-101", "S-999"], quote: "Slab on grade: 5\" thick, 4000 psi" },
      { name: "Footings", work_type: "footing", psi: 3000, thickness_in: 24, sheets: ["S101"], quote: "Continuous footing 24\" wide, 3,000 PSI." },
      { name: "Curb and gutter", work_type: "curb", psi: 3500, quote: "Curb and gutter 3500 psi along Oak Street" },
    ],
  };
  const r = sanitizeBid(raw, SOURCE, ["S-101", "C-1"], ["Sacco"]);
  assert.ok(r);
  const f = r.facts;
  assert.equal(f.project_name, "Oak Street Clinic");
  assert.equal(f.gc_company, "Example GC Builders");
  assert.deepEqual(f.estimator, { name: "Pat Doe", email: "pat@example-gc.com", phone: "(225) 555-0199" });
  assert.equal(f.address.state, "LA");
  assert.equal(f.bid_due_at, "2026-10-14T19:00:00.000Z", "2 PM in Baton Rouge in October is 19:00 UTC");
  assert.equal(f.items.length, 2, "curb and gutter has no line that shows it");
  assert.deepEqual(f.items[0].sheets, ["S-101"], "an unknown sheet is dropped");
  assert.equal(f.items[0].psi, 4000);
  assert.equal(f.items[1].psi, 3000, "3,000 written with a comma counts");
  assert.equal(f.items[1].thickness_in, 24);
  assert.match(r.dropped.join("\n"), /Curb and gutter/);
});

test("a straight quote mark matches a curly one in the email", () => {
  const src = "706-01-00100 \u2013 Concrete Walk (4\u201d Thick) \u2013 1,769.80 SY";
  const r = sanitizeBid({ items: [{ name: "Concrete Walk", work_type: "sidewalk", thickness_in: 4, quote: '706-01-00100 \u2013 Concrete Walk (4" Thick) \u2013 1,769.80 SY' }] }, src, []);
  assert.equal(r.facts.items.length, 1);
  assert.equal(r.facts.items[0].thickness_in, 4);
});

test("numbers, names and dates that aren't written are dropped", () => {
  const r = sanitizeBid({
    gc_company: "Sacco Enterprises", estimator: { name: "Jordan Smith", email: "x@nowhere.test", phone: "225-555-0000" },
    bid_due_text: "October 14, 2026 at 2:00 PM", bid_due_iso: "2026-10-15T14:00",
    items: [{ name: "Slab on grade", psi: 5000, thickness_in: 6, quote: "Slab on grade: 5\" thick, 4000 psi" }],
  }, SOURCE, [], ["Sacco"]);
  assert.equal(r.facts.gc_company, null, "we are never the GC");
  assert.equal(r.facts.estimator.name, null);
  assert.equal(r.facts.estimator.email, null);
  assert.equal(r.facts.estimator.phone, null);
  assert.equal(r.facts.bid_due_at, null, "the ISO date disagrees with the words");
  assert.equal(r.facts.items[0].psi, null);
  assert.equal(r.facts.items[0].thickness_in, null);
  assert.equal(sanitizeBid(null, SOURCE, []), null);
});

test("dates: month and day as written, Central time to UTC", () => {
  assert.deepEqual(monthDay("Tuesday, Oct. 14th @ 2pm"), { m: 10, d: 14 });
  assert.deepEqual(monthDay("due 1/9/2027 by noon"), { m: 1, d: 9 });
  assert.equal(monthDay("next week"), null);
  assert.equal(centralToUtc("2027-01-09T12:00"), "2027-01-09T18:00:00.000Z", "CST is UTC−6");
  assert.equal(centralToUtc("2026-10-14"), "2026-10-14T22:00:00.000Z", "no time written → 5 PM local");
  assert.equal(centralToUtc("nonsense"), null);
});

test("what a file is, and what is skipped", () => {
  assert.equal(docRole("Oak St Clinic - Project Manual.pdf", null), "spec");
  assert.equal(docRole("03 30 00 Cast in Place.pdf", null), "spec");
  assert.equal(docRole("ITB Oak Street.pdf", null), "itb");
  assert.equal(docRole("Addendum 2.pdf", null), "itb");
  assert.equal(docRole("C-101 Site Plan.pdf", "application/pdf"), "drawings");
  assert.equal(docRole("bid form.xlsx", null), "other");
  assert.equal(docRole("_h.015211_proposal.pdf", null), "spec", "a DOTD proposal is the bid book, not drawings");
  assert.equal(docRole("PLANS.pdf", null), "drawings");
  assert.match(skipBoxFile(".DS_Store", 10), /system/);
  assert.match(skipBoxFile("Plans.pdf", 200 * 1024 * 1024), /100 MB/);
  assert.equal(skipBoxFile("Plans.pdf", 5e6), null);
  assert.equal(concretePage("GENERAL NOTES: all concrete shall be 4000 psi"), true);
  assert.equal(concretePage("DOOR SCHEDULE"), false);
});

test("the function's title-block reader is the app's (src/lib/plan-sheets.ts)", () => {
  const W = 2592, H = 1728;
  const pages = [
    [{ str: "S-101", x: 2400, y: 1650, w: 80, h: 28 }, { str: "FOUNDATION PLAN", x: 2300, y: 1600, w: 200, h: 14 }, { str: "SCALE: 1/8\" = 1'-0\"", x: 2300, y: 1560, w: 160, h: 8 }],
    [{ str: "C-5", x: 2450, y: 1660, w: 50, h: 24 }, { str: "PAVING PLAN", x: 2300, y: 1610, w: 150, h: 12 }, { str: "1\" = 20'", x: 2300, y: 1580, w: 60, h: 8 }],
    [{ str: "DETAILS", x: 100, y: 100, w: 80, h: 12 }, { str: "N.T.S.", x: 300, y: 300, w: 40, h: 8 }],
  ];
  for (const items of pages) assert.deepEqual(copy.readSheet(items, W, H), sheets.readSheet(items, W, H));
  for (const t of ["1/8\" = 1'-0\"", "1 1/2\" = 1'-0\"", "1:100", "NOT TO SCALE", "SCALE: AS NOTED", "nothing"]) {
    assert.deepEqual(copy.parsePrintedScale(t), takeoff.parsePrintedScale(t), t);
  }
});

test("the function's file rules match the app's and email-intake's", async () => {
  const bid = await import("../supabase/functions/bid-intake/rules.ts");
  const mail = await import("../supabase/functions/email-intake/rules.ts");
  for (const [mime, name] of [["application/pdf", "S-101 Foundation.pdf"], [null, "Spec 03 30 00.pdf"], ["image/jpeg", "site.JPG"], [null, "bid form.xlsx"]]) {
    assert.equal(bid.fileKind(mime, name), mail.fileKind(mime, name));
    assert.equal(bid.safeName(name), mail.safeName(name));
    assert.equal(bid.categoryGuess(bid.fileKind(mime, name), name), mail.categoryGuess(mail.fileKind(mime, name), name));
  }
  assert.equal(bid.matchableDomain("pat@example-gc.com"), "example-gc.com");
  assert.equal(bid.matchableDomain("pat@gmail.com"), null);
});

test("a bid item's own quantity comes off its written line", async () => {
  const { itemQuantity } = await import("../supabase/functions/bid-intake/rules.ts");
  assert.deepEqual(itemQuantity("706-01-00100 – Concrete Walk (4” Thick) – 1,769.80 SY"), { qty: 1769.8, unit: "SY", sqft: 15928.2 });
  assert.deepEqual(itemQuantity("706-02-00200 – Concrete Drive (6” Thick) – 450 SY"), { qty: 450, unit: "SY", sqft: 4050 });
  assert.deepEqual(itemQuantity("NS-MSC-00080 – Detectable Warning Surface – 8 EA"), { qty: 8, unit: "EA", sqft: null });
  assert.equal(itemQuantity("Concrete walk, 4 inch")?.unit, undefined);
  assert.equal(itemQuantity("4000 psi slab"), null);
});
