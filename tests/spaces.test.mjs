import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOpenJob, monogram, spaceOf, jobTree, activeTreeRow, fmtPhone, phoneThreads, internalThreads, stageColor,
} from "../src/lib/v34/spaces.ts";

const ID = "0123abcd-0000-4000-8000-123456789abc";

test("open jobs are on the rail; complete, closed and lost are not", () => {
  for (const s of ["lead", "invited", "scoping", "quoted", "won", "scheduled", "in_progress", null]) assert.equal(isOpenJob(s), true, String(s));
  for (const s of ["complete", "closed", "lost"]) assert.equal(isOpenJob(s), false, s);
});

test("monogram takes two words' letters", () => {
  assert.equal(monogram("Wilson Driveway Repair"), "WD");
  assert.equal(monogram("Gulfline"), "GU");
  assert.equal(monogram("2635 Walker High"), "WH");
  assert.equal(monogram(""), "#");
});

test("a job's pages are its Space; everything else is Home", () => {
  assert.deepEqual(spaceOf(`/dashboard/scope/${ID}/plans`), { kind: "job", id: ID });
  assert.deepEqual(spaceOf(`/dashboard/scope/${ID}`), { kind: "job", id: ID });
  assert.deepEqual(spaceOf("/dashboard/scope"), { kind: "home" });
  assert.deepEqual(spaceOf("/dashboard/messages"), { kind: "home" });
});

test("Market rate, Proposed budget and Actual costs are tools of their own", () => {
  const t = jobTree(ID);
  assert.equal(t.find((r) => r.k === "tracker")?.href, `/dashboard/scope/${ID}?tab=actuals`);
  assert.deepEqual(t.map((r) => r.k), ["summary", "plans", "market", "proposed", "tracker", "proposal", "files"]);
  assert.equal(t.some((r) => r.sub), false);
});

test("the tree row a page is on", () => {
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}/summary`, ""), "summary");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=market"), "market");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=actuals"), "tracker");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, ""), "proposed");
  assert.equal(activeTreeRow("/dashboard/messages", ""), "");
});

test("one Phone thread per number", () => {
  const rows = phoneThreads([
    { id: "a", name: "Jeremy Wright", phones: [{ phone: "+12255550118", label: null }, { phone: "+12255550119", label: "Office" }], email: null },
    { id: "b", name: null, phones: [{ phone: "+12255550120", label: null }], email: null },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ["Jeremy Wright · Cell", "Jeremy Wright · Office", "(225) 555-0120"]);
  assert.equal(rows[1].href, `/dashboard/messages/a?channel=${encodeURIComponent("phone:+12255550119")}`);
  assert.equal(fmtPhone("+12255550118"), "(225) 555-0118");
  assert.equal(internalThreads([{ id: "a", name: "Jeremy Wright", phones: [], email: null }])[0].href, "/dashboard/messages/a?channel=notes");
});

test("stage colours are theme variables", () => {
  assert.match(stageColor("won"), /^var\(--sc-/);
  assert.match(stageColor("lead"), /^var\(--sc-hiviz\)$/);
});

import { DEFAULT_SHELVES, cleanShelves, homeShelves, moveToShelf, nudge } from "../src/lib/v34/spaces.ts";

test("Home's default shelves; Logs and Roadmap left for Settings; the rest on More", () => {
  const pages = ["dashboard", "scopebuilder", "scope", "map", "camera", "contacts", "customers", "pricebook", "vendors", "files", "logs", "admin", "roadmap"];
  const s = homeShelves(null, pages);
  assert.deepEqual(s.map((x) => x.name), ["Buckets", "Scope Builder", "Toolbox", "More"]);
  assert.deepEqual(s[0].pages, ["customers", "contacts", "vendors", "scope"]);
  assert.deepEqual(s[2].pages, ["map", "camera", "pricebook", "files"]);
  assert.deepEqual(s[3].pages, ["dashboard", "admin"]);
  assert.ok(!s.flatMap((x) => x.pages).includes("logs"));
});

test("Coy's own shelves: renamed, added, a page only once, unknown pages dropped", () => {
  const saved = [{ id: "buckets", name: " People ", pages: ["customers", "customers", "nope"] }, { id: "s1", name: "Field", pages: ["camera", "map"] }, { id: "s1", name: "dup", pages: [] }, { name: "no id" }];
  const s = homeShelves(saved, ["customers", "camera", "map", "files"]);
  assert.deepEqual(s, [{ id: "buckets", name: "People", pages: ["customers"] }, { id: "s1", name: "Field", pages: ["camera", "map"] }, { id: "more", name: "More", pages: ["files"] }]);
  assert.equal(cleanShelves("x"), null);
  assert.deepEqual(cleanShelves([]), []);
});

test("moving a page between shelves, and nudging order", () => {
  const m = moveToShelf(DEFAULT_SHELVES, "map", "buckets");
  assert.deepEqual(m[0].pages.at(-1), "map");
  assert.ok(!m[2].pages.includes("map"));
  assert.deepEqual(nudge([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(nudge([1, 2, 3], 0, -1), [1, 2, 3]);
});

// Customer and vendor Spaces, New Space and shelf channels (Coy, 2026-10-18).
import {
  cleanPins, addPin, removePin, customerShelves, vendorShelves, activeTab, looseChannels, offShelf, CHANNELS, SPACE_KINDS,
} from "../src/lib/v34/spaces.ts";

test("a customer's or vendor's page is its own Space", () => {
  assert.deepEqual(spaceOf(`/dashboard/customers/${ID}`), { kind: "customer", id: ID });
  assert.deepEqual(spaceOf(`/dashboard/vendors/${ID}/x`), { kind: "vendor", id: ID });
  assert.deepEqual(spaceOf("/dashboard/customers"), { kind: "home" });
});

test("pins are cleaned, deduped, added once and removed", () => {
  const p = cleanPins([{ kind: "customer", id: ID, name: " Art " }, { kind: "customer", id: ID, name: "Again" }, { kind: "job", id: ID }, { kind: "vendor", id: "nope" }, null]);
  assert.deepEqual(p, [{ kind: "customer", id: ID, name: "Art" }]);
  assert.equal(addPin(p, { kind: "customer", id: ID, name: "Art Apartments" }).length, 1);
  assert.equal(addPin(p, { kind: "vendor", id: ID, name: "Casco" }).length, 2);
  assert.deepEqual(removePin(p, "customer", ID), []);
  assert.deepEqual(cleanPins("x"), []);
});

test("a customer Space is Account and Toolbox; a vendor's Supply and Toolbox, linking tabs", () => {
  assert.deepEqual(customerShelves(ID).map((s) => s.name), ["Account", "Toolbox"]);
  assert.deepEqual(vendorShelves(ID).map((s) => s.name), ["Supply", "Toolbox"]);
  assert.equal(customerShelves(ID)[0].rows[0].href, `/dashboard/customers/${ID}?tab=overview`);
  assert.ok(vendorShelves(ID)[0].rows.some((r) => r.k === "prices"));
  assert.equal(activeTab("?tab=jobs"), "jobs");
  assert.equal(activeTab(""), "overview");
});

test("New Space offers four kinds", () => {
  assert.deepEqual(SPACE_KINDS.map((k) => k.kind), ["job", "customer", "vendor", "collection"]);
});

test("channels can sit on a shelf; the rest stay loose", () => {
  const sh = homeShelves([{ id: "a", name: "Mine", pages: ["map", "ch:vendor"] }], ["map", "files"]);
  assert.deepEqual(sh[0].pages, ["map", "ch:vendor"]);
  assert.ok(sh.some((s) => s.id === "more" && s.pages.includes("files")));
  assert.deepEqual(looseChannels(sh), CHANNELS.map((c) => c.key).filter((k) => k !== "ch:vendor"));
  assert.deepEqual(offShelf(sh, "ch:vendor")[0].pages, ["map"]);
});

test("the rail keeps Coy's order, hides what he took off, and places new tiles beside their kind", async () => {
  const { cleanRail, orderTiles, moveTile, hideTile, showTile } = await import("../src/lib/v34/spaces.ts");
  const a = "job:" + "a".repeat(8) + "-0000-4000-8000-000000000001";
  const b = "job:" + "a".repeat(8) + "-0000-4000-8000-000000000002";
  const c = "job:" + "a".repeat(8) + "-0000-4000-8000-000000000003";
  const v = "vendor:" + "b".repeat(8) + "-0000-4000-8000-000000000001";
  assert.deepEqual(cleanRail({ order: [a, a, "nope", 5], hidden: "x" }), { order: [a], hidden: [] });
  const none = cleanRail(null);
  assert.deepEqual(orderTiles([a, b, v], none), [a, b, v]);
  let p = moveTile(none, [a, b, v], v, 0);
  assert.deepEqual(orderTiles([a, b, v], p), [v, a, b]);
  // a new job lands after the job before it by default
  assert.deepEqual(orderTiles([a, b, c, v], p), [v, a, b, c]);
  p = hideTile(p, a);
  assert.deepEqual(orderTiles([a, b, c, v], p), [v, b, c]);
  p = showTile(p, a);
  assert.deepEqual(orderTiles([a, b, v], p), [v, a, b]);
  // a tile gone from the rail (job finished) is just skipped
  assert.deepEqual(orderTiles([b, v], p), [v, b]);
});

test("a collection keeps the tools and channels picked for it", async () => {
  const { cleanCollectionPicks, setPicks, togglePick } = await import("../src/lib/v34/spaces.ts");
  const id = "0a30aea5-8258-461c-b457-643926b4f1cc";
  assert.deepEqual(cleanCollectionPicks(null), {});
  assert.deepEqual(cleanCollectionPicks({ nope: ["map"], [id]: ["map", "map", 3, "ch:vendor"] }), { [id]: ["map", "ch:vendor"] });
  let p = togglePick([], "map", true);
  p = togglePick(p, "ch:customer", true);
  p = togglePick(p, "map", true);
  assert.deepEqual(p, ["map", "ch:customer"]);
  assert.deepEqual(togglePick(p, "map", false), ["ch:customer"]);
  assert.deepEqual(setPicks({}, id, p), { [id]: p });
  assert.deepEqual(setPicks({ [id]: p }, id, []), {});
});
