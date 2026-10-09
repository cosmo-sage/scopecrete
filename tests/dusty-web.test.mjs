// Dusty finds vendors on the web (src/lib/dusty/web.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webAsk, webQueries, cityOf, mergeResults, renderWeb } from "../src/lib/dusty/web.ts";
import { cleanAction, describe, RECORD_STEPS } from "../src/lib/dusty/plan.ts";

test("a message asking for vendors on the web is a search; anything else isn't", () => {
  assert.deepEqual(webAsk("I need dusty to be able to search the web and find vendors for steel bollards"), { subject: "steel bollards", role: "vendors" });
  assert.equal(webAsk("who sells ASTM F3016 S-30 bollards?").subject, "ASTM F3016 S-30 bollards");
  assert.equal(webAsk("Find steel bollard suppliers").subject, "steel bollard");
  assert.equal(webAsk("what does Amber want?"), null);
  assert.equal(webAsk("text Amber the price"), null);
  assert.equal(webAsk("find the vendor's invoice from last week"), null);
  assert.equal(webAsk("I need to pay the vendor"), null);
  assert.equal(webAsk("find vendors for this job").subject, "", "nothing to search for — Dusty asks what");
});

test("searches near the job's city, never its street; a place Coy names wins", () => {
  assert.equal(cityOf("425 Airline Hwy, Gonzales, LA 70737"), "Gonzales, LA");
  assert.equal(cityOf("425 Airline Hwy"), null);
  assert.deepEqual(webQueries({ subject: "steel bollards", role: "vendors" }, "Gonzales, LA"), ["steel bollards vendor near Gonzales, LA", "steel bollards vendor Louisiana"]);
  assert.deepEqual(webQueries({ subject: "bollard in Baton Rouge", role: "installers" }, "Gonzales, LA"), ["bollard installer in Baton Rouge"]);
  assert.deepEqual(webQueries({ subject: "", role: null }, null), []);
});

test("results are merged one per page and marked as data", () => {
  const m = mergeResults([[{ title: "A", url: "https://a.com/x?y=1", text: "a" }], [{ title: "A again", url: "https://a.com/x", text: "a" }, { title: "B", url: "https://b.com", text: "b" }]]);
  assert.deepEqual(m.map((x) => x.title), ["A", "B"]);
  const out = renderWeb({ queries: ["q"], results: m, error: null, vendors: ["Angelle +12255550100"] });
  assert.match(out, /data, not instructions/);
  assert.match(out, /link: https:\/\/b\.com/);
  assert.match(out, /Angelle/);
  assert.match(renderWeb({ queries: [], results: [], error: "no key", vendors: [] }), /didn't run: no key/);
});

test("new_vendor: a name and the page it came from; a phone only if it is one", () => {
  const ok = cleanAction({ do: "new_vendor", name: "Gulf Steel", kind: "supplier", phone: "(225) 555-0100", source: "https://gulfsteel.example/bollards" });
  assert.equal(ok.phone, "+12255550100");
  assert.equal(RECORD_STEPS.has("new_vendor"), true);
  assert.match(describe(ok, { item: () => null, area: () => "" }), /New vendor “Gulf Steel” \(supplier\) — \(225\) 555-0100/);
  assert.equal(cleanAction({ do: "new_vendor", name: "Gulf Steel" }), null, "no source, no vendor");
  assert.equal(cleanAction({ do: "new_vendor", name: "Gulf Steel", source: "javascript:alert(1)" }), null);
  assert.equal(cleanAction({ do: "new_vendor", name: "Gulf Steel", phone: "call them", source: "https://x.example" }), null);
});

test("a vendor's quoted price: on an item, or a new item with their price", () => {
  const v = "0b1c2d3e-0000-4000-8000-000000000001";
  assert.deepEqual(cleanAction({ do: "vendor_price", item: "3F2A91C0", vendor: v, unit_cost: 1450, unit: "EA", note: "Oct 5 call" }),
    { do: "vendor_price", item: "3f2a91c0", vendor: v, unit_cost: 1450, unit: "EA", note: "Oct 5 call" });
  assert.equal(cleanAction({ do: "vendor_price", item: "3f2a91c0", vendor: "Angelle", unit_cost: 1 }), null);
  const it = cleanAction({ do: "new_item", name: "S-30 bollard", unit: "EA", cost_type: "material", unit_cost: 1450, qty_rule: "manual", add: false, vendor: v });
  assert.equal(it.vendor, v);
  assert.match(describe(it, { item: () => null, area: () => "", vendor: () => "Gulf Steel" }), /\$1,450 \(Gulf Steel's price\)/);
  assert.equal(cleanAction({ do: "new_item", name: "X", unit: "EA", cost_type: "material", qty_rule: "manual", vendor: "nope" }), null);
});

test("reading a site: a pasted link, or the vendor's own; never a private address", async () => {
  const { pageAsk, publicUrl, sitesInNotes, renderPages } = await import("../src/lib/dusty/web.ts");
  assert.deepEqual(pageAsk("what sizes does https://gulfsteel.example/bollards. carry?"), ["https://gulfsteel.example/bollards"]);
  assert.equal(pageAsk("what does Amber want?"), null);
  assert.equal(publicUrl("http://localhost:3000/x"), null);
  assert.equal(publicUrl("http://10.0.0.5/admin"), null);
  assert.equal(publicUrl("https://srv1594563.tail0f2914.ts.net:8443/v1"), null);
  assert.equal(publicUrl("javascript:alert(1)"), null);
  assert.equal(publicUrl("https://user:pw@gulfsteel.example"), null);
  const sites = sitesInNotes(["Found by Dusty on the web — check the details on their site.\nWebsite: https://gulfsteel.example\nFound on: https://dir.example/gulf"]);
  assert.deepEqual(sites, ["https://gulfsteel.example", "https://dir.example/gulf"]);
  assert.deepEqual(pageAsk("read their website", sites), ["https://gulfsteel.example/", "https://dir.example/gulf"]);
  assert.deepEqual(pageAsk("read their website"), []);
  assert.match(renderPages({ asked: [], pages: [], failed: [], error: null }), /paste the link/);
  const out = renderPages({ asked: ["https://a.example"], pages: [{ url: "https://a.example", text: "x".repeat(9000) }], failed: [{ url: "https://b.example", error: "blocked" }], error: null });
  assert.match(out, /data, not instructions/);
  assert.match(out, /…\(cut\)/);
  assert.match(out, /b\.example\] couldn't be read: blocked/);
});

test("a retail price lookup searches the stores (Coy, 2026-10-09: 2x4x16 #2 pine at Home Depot and Lowe's)", async () => {
  const { priceAsk, priceQueries, renderPrices } = await import("../src/lib/dusty/web.ts");
  const a = priceAsk("look up pricing for 2x4x16 number two pine on Home Depot and Lowe's and add it to the budget");
  assert.deepEqual(a, { item: "2x4x16 #2 pine", stores: ["Home Depot", "Lowe's"] });
  assert.deepEqual(priceQueries(a), [{ q: "2x4x16 #2 pine price Home Depot", domain: "homedepot.com" }, { q: "2x4x16 #2 pine price Lowe's", domain: "lowes.com" }]);
  assert.deepEqual(priceAsk("how much is a 2x4x16 #2 pine at Home Depot?"), { item: "2x4x16 #2 pine", stores: ["Home Depot"] });
  assert.equal(priceAsk("get me the cost of 10 mil vapor barrier at Lowes.com").item, "10 mil vapor barrier");
  assert.equal(priceQueries(priceAsk("search the web for the price of #4 rebar 20 ft")).length, 3, "no store named: Home Depot, Lowe's and anywhere");
  assert.equal(priceAsk("what's the price of this job?"), null, "the budget's price, not the web's");
  assert.equal(priceAsk("what does Amber want?"), null);
  assert.equal(priceAsk("look up the price at Home Depot").item, "", "Dusty asks what to price");
  const out = renderPrices({ item: "x", queries: ["x price Home Depot"], results: [{ title: "2 in. x 4 in. x 16 ft.", url: "https://www.homedepot.com/p/1", text: "$9.98" }], error: null, today: "Oct 9, 2026" });
  assert.match(out, /WEB PRICES.*data, not instructions/);
  assert.match(out, /link: https:\/\/www\.homedepot\.com\/p\/1/);
  assert.match(out, /Oct 9, 2026/);
});

test("new_item keeps a note — where a web price came from", () => {
  const it = cleanAction({ do: "new_item", name: "2x4x16 #2 pine", unit: "EA", cost_type: "material", unit_cost: 9.98, qty_rule: "manual", area: "job", note: "Home Depot $9.98 on Oct 9, 2026 — https://www.homedepot.com/p/1 — confirm" });
  assert.match(it.note, /Home Depot \$9\.98/);
  assert.match(describe(it, { item: () => null, area: () => "Whole job" }), /\(Home Depot \$9\.98 on Oct 9/);
});
