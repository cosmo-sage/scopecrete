import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOpenJob, monogram, spaceOf, jobTree, activeTreeRow, fmtPhone, phoneThreads, internalThreads, stageColor, shortWhen,
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
  assert.deepEqual(t.map((r) => r.k), ["summary", "plans", "market", "proposed", "tracker", "proposal", "schedule", "locations", "files"]);
  assert.equal(t.some((r) => r.sub), false);
});

test("the tree row a page is on", () => {
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}/summary`, ""), "summary");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=market"), "market");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=actuals"), "tracker");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, ""), "proposed");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}/schedule`, ""), "schedule");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}/locations`, ""), "locations");
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

import { DEFAULT_SHELVES, SPACES_HREF, cleanShelves, homeShelves, moveToShelf, nudge, emailThreads } from "../src/lib/v34/spaces.ts";

test("Home's default shelves; Logs and Roadmap left for Settings; the rest on More", () => {
  const pages = ["dashboard", "scopebuilder", "scope", "map", "camera", "contacts", "customers", "pricebook", "vendors", "files", "logs", "admin", "roadmap"];
  const s = homeShelves(null, pages);
  assert.deepEqual(s.map((x) => x.name), ["Collections", "Toolbox", "More"]);
  assert.deepEqual(s[0].pages, ["customers", "contacts", "vendors", "scope"]);
  assert.deepEqual(s[1].pages, ["map", "camera", "pricebook", "files"]);
  assert.deepEqual(s[2].pages, ["dashboard", "admin"]);
  assert.ok(!s.flatMap((x) => x.pages).includes("logs"));
  // The Jobs bucket is the Scope Builder layout now (Coy, 2026-10-18): no Scope Builder row.
  assert.ok(!s.flatMap((x) => x.pages).includes("scopebuilder"));
  assert.equal(homeShelves([{ id: "a", name: "A", pages: ["scopebuilder", "map"] }], pages)[0].pages.join(), "map");
  assert.equal(SPACES_HREF.scope, "/dashboard/scope-builder");
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
  assert.ok(!m[1].pages.includes("map"));
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
  const p = cleanPins([{ kind: "customer", id: ID, name: " Art " }, { kind: "customer", id: ID, name: "Again" }, { kind: "lead", id: ID }, { kind: "vendor", id: "nope" }, null]);
  assert.deepEqual(p, [{ kind: "customer", id: ID, name: "Art" }]);
  assert.deepEqual(cleanPins([{ kind: "job", id: ID }]), [{ kind: "job", id: ID, name: "Job" }]);
  assert.equal(addPin(p, { kind: "customer", id: ID, name: "Art Apartments" }).length, 1);
  assert.equal(addPin(p, { kind: "vendor", id: ID, name: "Casco" }).length, 2);
  assert.deepEqual(removePin(p, "customer", ID), []);
  assert.deepEqual(cleanPins("x"), []);
});

test("a collection's jobs, customers and vendors are cleaned, set and ticked", async () => {
  const { cleanMembers, setMembers, toggleItem } = await import("../src/lib/v34/spaces.ts");
  const job = { kind: "job", id: ID, name: "Wilson Driveway" };
  const ven = { kind: "vendor", id: ID, name: "Casco" };
  assert.deepEqual(cleanMembers({ [ID]: [job, job, { kind: "x", id: ID }], nope: [job] }), { [ID]: [job] });
  assert.deepEqual(cleanMembers([]), {});
  let items = toggleItem([], job, true);
  items = toggleItem(items, ven, true);
  assert.equal(toggleItem(items, job, true).length, 2);
  assert.deepEqual(toggleItem(items, job, false), [ven]);
  assert.deepEqual(setMembers({}, ID, items), { [ID]: [job, ven] });
  assert.deepEqual(setMembers({ [ID]: items }, ID, []), {});
});

test("a customer Space is Account and Toolbox; a vendor's Supply and Toolbox, linking tabs", () => {
  assert.deepEqual(customerShelves(ID).map((s) => s.name), ["Customer Account", "Toolbox"]);
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
  assert.deepEqual(cleanRail({ order: [a, a, "nope", 5], hidden: "x" }), { order: [a], hidden: [], groups: [] });
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

test("rail groups: drop a tile on a tile to group, join, leave, move and rename", async () => {
  const { cleanRail, orderTiles, railItems, groupTiles, ungroupTile, placeKeys, renameGroup, dissolveGroup, hideTile, groupName } = await import("../src/lib/v34/spaces.ts");
  const j = (n) => "job:aaaaaaaa-0000-4000-8000-00000000000" + n;
  const v = "vendor:bbbbbbbb-0000-4000-8000-000000000001";
  const keys = [j(1), j(2), j(3), v];
  let p = cleanRail(null);
  let shown = orderTiles(keys, p);
  // v dropped on job 1: a group of the two, v right after job 1
  p = groupTiles(p, shown, v, j(1), "g1");
  shown = orderTiles(keys, p);
  assert.deepEqual(shown, [j(1), v, j(2), j(3)]);
  assert.deepEqual(p.groups, [{ id: "g1", name: "Group", keys: [j(1), v] }]);
  assert.deepEqual(railItems(shown, p.groups).map((i) => i.kind), ["group", "tile", "tile"]);
  // job 3 dropped on the group joins it
  p = groupTiles(p, shown, j(3), "group:g1", "g2");
  shown = orderTiles(keys, p);
  assert.deepEqual(shown, [j(1), v, j(3), j(2)]);
  assert.equal(p.groups.length, 1);
  assert.deepEqual(p.groups[0].keys, [j(1), v, j(3)]);
  // the whole group moves after job 2
  p = placeKeys(p, shown, p.groups[0].keys, j(2), true);
  shown = orderTiles(keys, p);
  assert.deepEqual(shown, [j(2), j(1), v, j(3)]);
  p = renameGroup(p, "g1", "  Fort   Polk ");
  assert.equal(p.groups[0].name, "Fort Polk");
  // leaving: two left is still a group; one left is none
  p = ungroupTile(p, j(3));
  assert.deepEqual(p.groups[0].keys, [j(1), v]);
  p = hideTile(p, v);
  assert.deepEqual(p.groups, []);
  // a hidden member leaves; a group with one shown reads as a tile
  const two = { order: [], hidden: [], groups: [{ id: "g9", name: "X", keys: [j(1), j(2)] }] };
  assert.deepEqual(railItems([j(1), j(3)], two.groups), [{ kind: "tile", key: j(1) }, { kind: "tile", key: j(3) }]);
  assert.deepEqual(dissolveGroup(two, "g9").groups, []);
  // cleaning: a key in two groups counts once, bad ids and one-tile groups go
  const c = cleanRail({ groups: [{ id: "g1", name: "A", keys: [j(1), j(2)] }, { id: "g2", keys: [j(2), j(3)] }, { id: "bad id", keys: [j(1), j(3)] }] });
  assert.deepEqual(c.groups, [{ id: "g1", name: "A", keys: [j(1), j(2)] }]);
  assert.equal(groupName([j(1), j(2)]), "Jobs");
  assert.equal(groupName([j(1), v]), "Group");
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

test("the Channels shelf's Email threads: one per address, then filed mail from no one", () => {
  const people = [{ id: "p1", name: "Jeremy", phones: [], email: "J@Gulf.com", emails: ["j@gulf.com", "jw@home.net"] }];
  const emails = [{ key: "c1", subject: "Bid", at: null, address: "j@gulf.com" }, { key: "c2", subject: "Re", at: null, address: "j@gulf.com" }, { key: "c3", subject: "PO", at: null, address: "ap@other.com" }];
  const rows = emailThreads(people, emails);
  assert.deepEqual(rows.map((r) => r.title), ["j@gulf.com", "jw@home.net", "ap@other.com"]);
  assert.match(rows[0].href, /\/dashboard\/messages\/p1\?channel=email%3Aj%40gulf\.com/);
  assert.match(rows[0].sub ?? "", /2 conversations/);
  assert.equal(rows[2].href, "/dashboard/messages/email/c3");
});

test("a Phone thread previews its last call or text, with when", () => {
  const now = new Date("2026-10-19T18:00:00Z");
  const rows = phoneThreads([{ id: "a", name: "Jeremy Wright", email: null,
    phones: [{ phone: "+12255550118", label: null, last: { text: "On my way", at: "2026-10-19T15:05:00Z", out: true } }, { phone: "+12255550119", label: "Office" }] }]);
  assert.equal(rows[0].sub, "You: On my way");
  assert.equal(rows[1].sub, "(225) 555-0119");
  assert.equal(rows[1].when ?? null, null);
  assert.equal(shortWhen("2026-10-19T15:05:00Z", now), "10:05 AM");
  assert.equal(shortWhen("2026-10-17T15:05:00Z", now), "Sat");
  assert.equal(shortWhen("2026-09-30T15:05:00Z", now), "Sep 30");
  assert.equal(shortWhen(null, now), null);
});

test("customers with an open job are Work Spaces; Buckets shelf reads Collections", async () => {
  const { openJobCustomers, homeShelves } = await import("../src/lib/v34/spaces.ts");
  const jobs = [
    { status: "estimating", customer_id: "c1", customer: "Gulfline Paving" },
    { status: "lost", customer_id: "c2", customer: "Wilson" },
    { status: "new", customer_id: "c1", customer: "Gulfline Paving" },
    { status: "new", customer_id: null, customer: null },
    { status: "won", customer_id: "c3", customer: "  " },
  ];
  assert.deepEqual(openJobCustomers(jobs), [{ id: "c1", name: "Gulfline Paving" }]);
  const sh = homeShelves([{ id: "buckets", name: "Buckets", pages: ["customers"] }], ["customers"]);
  assert.equal(sh[0].name, "Collections");
  assert.equal(homeShelves([{ id: "buckets", name: "My lists", pages: [] }], [])[0].name, "My lists");
});

test("a job's, customer's or vendor's drawer: default, cleaned, pages moved and shelves removed", async () => {
  const { defaultLayout, cleanLayout, placeRow, removeKindShelf, kindRows, CHANNELS_SHELF, JOBS_SHELF } = await import("../src/lib/v34/spaces.ts");
  const job = defaultLayout("job");
  assert.deepEqual(job.shelves.map((s) => s.name), ["Job", "Contacts"]);
  assert.deepEqual(job.shelves[0].rows, kindRows("job", ID).map((r) => r.k));
  assert.deepEqual(defaultLayout("customer").shelves.map((s) => s.id), ["account", JOBS_SHELF, CHANNELS_SHELF, "toolbox"]);
  assert.deepEqual(defaultLayout("vendor").shelves.map((s) => s.name), ["Supply", "Jobs", "Contacts", "Toolbox"]);
  // a saved Channels shelf reads Contacts, and a customer drawer saved before Jobs gets it before Contacts
  const old = cleanLayout("customer", { shelves: [{ id: "account", name: "Customer Account", rows: ["overview", "threads", "payments"] }, { id: CHANNELS_SHELF, name: "Channels", rows: [] }], hidden: [] });
  assert.deepEqual(old.shelves.slice(0, 3).map((s) => s.name), ["Customer Account", "Jobs", "Contacts"]);
  assert.deepEqual(old.shelves[0].rows, ["overview", "files"], "gone tabs dropped, a page with no shelf goes on the first");
  assert.ok(!cleanLayout("job", { shelves: [{ id: JOBS_SHELF, name: "Jobs", rows: [] }], hidden: [] }).shelves.some((s) => s.id === JOBS_SHELF), "a job has no Jobs shelf");
  // junk falls back; unknown pages dropped; a page twice kept once; a forgotten page goes on the first shelf
  assert.deepEqual(cleanLayout("job", "nope"), job);
  const c = cleanLayout("job", { shelves: [{ id: "a", name: "Mine", rows: ["summary", "summary", "nonsense"] }, { id: "b", name: "Rest", rows: ["files"] }], hidden: ["proposal"] });
  assert.equal(c.shelves[0].rows[0], "summary");
  assert.equal(c.shelves[0].rows.filter((k) => k === "summary").length, 1);
  assert.ok(!c.shelves.some((s) => s.rows.includes("nonsense")));
  assert.ok(!c.shelves.some((s) => s.rows.includes("proposal")));
  assert.ok(c.hidden.includes("proposal"));
  assert.ok(c.shelves.some((s) => s.id === CHANNELS_SHELF), "channels come back unless taken out");
  // move a page, hide a page, remove a shelf
  const moved = placeRow(job, "files", null);
  assert.ok(moved.hidden.includes("files") && !moved.shelves[0].rows.includes("files"));
  const back = placeRow(moved, "files", "job");
  assert.ok(back.shelves[0].rows.includes("files") && !back.hidden.includes("files"));
  const gone = removeKindShelf(job, CHANNELS_SHELF);
  assert.ok(!gone.shelves.some((s) => s.id === CHANNELS_SHELF) && gone.hidden.includes(CHANNELS_SHELF));
  assert.ok(!cleanLayout("job", gone).shelves.some((s) => s.id === CHANNELS_SHELF));
});

test("pickers name the four lists Collections, apart from tools — no thread lists", async () => {
  const { pickSections, CHANNELS } = await import("../src/lib/v34/spaces.ts");
  const s = pickSections(["map", "customers", "scope", "pricebook", "vendors", "contacts"]);
  assert.deepEqual(s.map((x) => x.title), ["Collections", "Tools"]);
  assert.deepEqual(s[0].keys, ["customers", "contacts", "vendors", "scope"]);
  assert.deepEqual(s[1].keys, ["map", "pricebook"]);
  assert.ok(CHANNELS.every((c) => !/people/i.test(c.label)));
});

test("holdsSpace: a Work Space keeps its drawer on its members' own pages", async () => {
  const { holdsSpace } = await import("../src/lib/v34/spaces.ts");
  const m = [{ kind: "customer", id: "c1", name: "Icon" }, { kind: "job", id: "j1", name: "Lot" }];
  assert.equal(holdsSpace(m, { kind: "customer", id: "c1" }), true);
  assert.equal(holdsSpace(m, { kind: "job", id: "j1" }), true);
  assert.equal(holdsSpace(m, { kind: "vendor", id: "c1" }), false);
  assert.equal(holdsSpace(m, { kind: "job", id: "j2" }), false);
  assert.equal(holdsSpace(m, { kind: "home" }), false);
});

test("a Work Space's own shelves: members on them, renamed, moved, removed", async () => {
  const { cleanColShelves, addColShelf, renameColShelf, moveColShelf, removeColShelf, setMemberShelf, membersByShelf, cleanMembers } = await import("../src/lib/v34/spaces.ts");
  const C = "0123abcd-0000-4000-8000-000000000001";
  const J = "0123abcd-0000-4000-8000-000000000002";
  const K = "0123abcd-0000-4000-8000-000000000003";
  let sh = addColShelf({}, C, " North BR ", "s1");
  sh = addColShelf(sh, C, "South", "s2");
  assert.deepEqual(sh[C].map((s) => s.name), ["North BR", "South"]);
  assert.equal(addColShelf(sh, C, "  ", "s3"), sh);
  sh = renameColShelf(sh, C, "s2", "Gonzales");
  sh = moveColShelf(sh, C, "s2", -1);
  assert.deepEqual(sh[C].map((s) => s.id), ["s2", "s1"]);
  assert.deepEqual(cleanColShelves({ [C]: [{ id: "s1", name: "A" }, { id: "BAD ID", name: "x" }, { id: "s1", name: "dup" }], nope: [] }), { [C]: [{ id: "s1", name: "A" }] });
  let items = [{ kind: "job", id: J, name: "Drive" }, { kind: "customer", id: K, name: "Icon" }];
  items = setMemberShelf(items, "job", J, "s1");
  const mem = cleanMembers({ [C]: items });
  assert.equal(mem[C][0].shelf, "s1");
  const by = membersByShelf(mem[C], sh[C]);
  assert.equal(by.loose.length, 1);
  assert.equal(by.shelves.find((s) => s.id === "s1").items[0].id, J);
  const r = removeColShelf(sh, mem, C, "s1");
  assert.deepEqual(r.shelves[C].map((s) => s.id), ["s2"]);
  assert.equal(r.members[C][0].shelf, undefined);
  // the member cap is the Work Space's, not the rail's 40
  const many = Array.from({ length: 60 }, (_, i) => ({ kind: "job", id: `0123abcd-0000-4000-8000-${String(i).padStart(12, "0")}`, name: "J" }));
  assert.equal(cleanMembers({ [C]: many })[C].length, 60);
});

test("a tool from Home on a job's shelf: kept, taken off without hiding", async () => {
  const { cleanLayout, placeRow, removeKindShelf, defaultLayout } = await import("../src/lib/v34/spaces.ts");
  const d = defaultLayout("job");
  let l = placeRow(d, "p:map", d.shelves[0].id);
  l = cleanLayout("job", JSON.parse(JSON.stringify({ ...l, shelves: l.shelves.map((s, i) => (i === 0 ? { ...s, rows: [...s.rows, "p:Bad!"] } : s)) })));
  assert.ok(l.shelves[0].rows.includes("p:map"));
  assert.ok(!l.shelves[0].rows.includes("p:Bad!"));
  const off = placeRow(l, "p:map", null);
  assert.ok(!off.hidden.includes("p:map"));
  assert.ok(!removeKindShelf(l, l.shelves[0].id).hidden.includes("p:map"));
});

test("shelf icons: standard shelves keep theirs, a custom shelf takes the one picked", async () => {
  const { shelfIcon, cleanShelfIcon, isStandardShelf, cleanShelves, iconColShelf } = await import("../src/lib/v34/spaces.ts");
  assert.equal(shelfIcon({ id: "toolbox", icon: "star" }), "toolbox");
  assert.equal(isStandardShelf("buckets"), true);
  assert.equal(isStandardShelf("s123"), false);
  assert.equal(shelfIcon({ id: "s123", icon: "camera" }), "camera");
  assert.equal(shelfIcon({ id: "s123" }), "folder");
  assert.equal(cleanShelfIcon("<script>"), undefined);
  assert.equal(cleanShelfIcon("pin"), "pin");
  const kept = cleanShelves([{ id: "s9", name: "Mine", pages: [], icon: "star" }, { id: "s8", name: "Bad", pages: [], icon: "nope" }]);
  assert.equal(kept.find((s) => s.id === "s9")?.icon, "star");
  assert.equal(kept.find((s) => s.id === "s8")?.icon, undefined);
  const C = "11111111-1111-4111-8111-111111111111";
  const next = iconColShelf({ [C]: [{ id: "s1", name: "A" }] }, C, "s1", "map");
  assert.equal(next[C][0].icon, "map");
});

test("contactThreads: one row per person, opening their one thread page", async () => {
  const { contactThreads } = await import("../src/lib/v34/spaces.ts");
  const rows = contactThreads([
    { id: "p1", name: "Amber Lee", phones: [{ phone: "+12255550118", label: null, last: { text: "Old", at: "2026-10-01T10:00:00Z", out: false } }, { phone: "+12255550119", label: "Office", last: { text: "Newer", at: "2026-10-02T10:00:00Z", out: true } }], email: null },
    { id: "p2", name: null, phones: [], email: "a@b.co" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].href, "/dashboard/messages/p1");
  assert.equal(rows[0].sub, "You: Newer");
  assert.equal(rows[1].title, "a@b.co");
});

import { collectionListAt, collectionRecordAt, collectionListRows, filterListRows, homeLooseGroups } from "../src/lib/v34/spaces.ts";

test("collection list pages and the records opened from them", () => {
  assert.equal(collectionListAt("/dashboard/customers"), "customers");
  assert.equal(collectionListAt("/dashboard/scope-builder"), "scope");
  assert.equal(collectionListAt("/dashboard/customers/abc"), null);
  assert.equal(collectionRecordAt("customers", "/dashboard/customers/11111111-1111-1111-1111-111111111111"), "11111111-1111-1111-1111-111111111111");
  assert.equal(collectionRecordAt("customers", "/dashboard/vendors/11111111-1111-1111-1111-111111111111"), null);
  assert.equal(collectionRecordAt("contacts", "/dashboard/messages/11111111-1111-1111-1111-111111111111"), "11111111-1111-1111-1111-111111111111");
  assert.equal(collectionRecordAt("contacts", "/dashboard/vendors/11111111-1111-1111-1111-111111111111"), null);
  assert.equal(collectionRecordAt("scope", "/dashboard/scope/11111111-1111-1111-1111-111111111111/budget"), "11111111-1111-1111-1111-111111111111");
});

test("list rows: vendors by name, contacts' phone and hrefs, search by every word", () => {
  const v = collectionListRows("vendors", { vendors: [{ id: "b", name: "Zed" }, { id: "a", name: "Acme" }] });
  assert.deepEqual(v.map((r) => r.id), ["a", "b"]);
  const c = collectionListRows("contacts", { contacts: [{ id: "x", name: "Amber", phones: [{ number: "(225) 555-0100" }], role: "vendor" }] });
  assert.equal(c[0].href, "/dashboard/messages/x?person=1");
  const n = collectionListRows("contacts", { contacts: [{ id: "y", name: null, phones: [{ number: "(225) 555-0100" }], role: "unsorted" }] });
  assert.equal(n[0].name, "(225) 555-0100");
  assert.equal(n[0].href, "/dashboard/messages/y?person=1");
  const j = collectionListRows("scope", { jobs: [{ id: "j", title: "Wilson Driveway", status: "won", contact_name: "Johnette", city: "Baton Rouge" }] });
  assert.equal(j[0].href, "/dashboard/scope/j/summary");
  assert.equal(filterListRows(j, "wilson baton").length, 1);
  assert.equal(filterListRows(j, "wilson patio").length, 0);
});

test("Home keeps only the More group below its shelves", () => {
  assert.deepEqual(homeLooseGroups(homeShelves(null, ["customers", "contacts", "vendors", "map", "files", "dashboard"])).filter((k) => k !== "ch:more"), []);
});

test("shelf lines: a colour from the book is kept on every kind of shelf, anything else is the accent", async () => {
  const { shelfLine, cleanShelfColor, cleanShelves, cleanLayout, cleanColShelves, colorColShelf, SHELF_LINE_DEFAULT } = await import("../src/lib/v34/spaces.ts");
  assert.equal(SHELF_LINE_DEFAULT, "hiviz");
  assert.equal(shelfLine({}), "hiviz");
  assert.equal(shelfLine({ color: "teal" }), "teal");
  assert.equal(shelfLine({ color: "#ff0000" }), "hiviz");
  assert.equal(cleanShelfColor("red; background:url(x)"), undefined);
  const home = cleanShelves([{ id: "s9", name: "Mine", pages: [], color: "violet" }, { id: "s8", name: "Bad", pages: [], color: "pink" }]);
  assert.equal(home.find((s) => s.id === "s9")?.color, "violet");
  assert.equal(home.find((s) => s.id === "s8")?.color, undefined);
  const job = cleanLayout("job", null);
  const colored = cleanLayout("job", { ...job, shelves: job.shelves.map((s, i) => (i === 0 ? { ...s, color: "green" } : s)) });
  assert.equal(colored.shelves[0].color, "green");
  const C = "11111111-1111-4111-8111-111111111111";
  const col = colorColShelf({ [C]: [{ id: "s1", name: "A" }] }, C, "s1", "chalk");
  assert.equal(col[C][0].color, "chalk");
  assert.equal(cleanColShelves(col)[C][0].color, "chalk");
  assert.deepEqual(colorColShelf(col, C, "s1", "nope"), col);
});
