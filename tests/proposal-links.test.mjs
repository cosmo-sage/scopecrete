import { test } from "node:test";
import assert from "node:assert/strict";
import { linkAssets, newToken, linkTokensIn, linkMessage, smsHref, mailtoHref, viewLine, publicSnapshot } from "../src/lib/proposal-links.ts";

const ORG = "11111111-1111-1111-1111-111111111111";

test("a link lists only paths in the org's own folder", () => {
  const a = linkAssets(ORG, { logo: `${ORG}/logo.png`, cover: "22222222-0000/other.jpg", maps: { a1: `${ORG}/proposal/d/map-a1.jpg`, a2: `${ORG}/../x` }, photos: { a1: [`${ORG}/p1.jpg`, "x/p2.jpg"] } });
  assert.deepEqual(a.paths.sort(), [`${ORG}/logo.png`, `${ORG}/p1.jpg`, `${ORG}/proposal/d/map-a1.jpg`].sort());
  assert.equal(a.cover, null);
  assert.deepEqual(Object.keys(a.maps), ["a1"]);
});

test("a token is 32 url-safe characters", () => {
  const t = newToken(new Uint8Array(24).fill(255));
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
});

test("the words, the sms and the email", () => {
  const m = linkMessage({ customer: "Jane Example", org: "Example Concrete", title: "Example Driveway", url: "https://x/p/abc", options: 3 });
  assert.match(m.body, /^Hi Jane, here is the proposal for Example Driveway\. It has 3 options/);
  assert.ok(m.body.includes("https://x/p/abc"));
  assert.ok(smsHref("(225) 555-0100", "hi there").startsWith("sms:2255550100?&body=hi%20there"));
  assert.ok(mailtoHref("jane@example.com", "S", "B").startsWith("mailto:jane@example.com?subject=S&body=B"));
  assert.equal(viewLine({ view_count: 0, last_viewed_at: null }), "not opened yet");
  assert.equal(viewLine({ view_count: 3, last_viewed_at: new Date(Date.now() - 2 * 3600e3).toISOString() }), "opened 3 times · last 2h ago");
});

test("the customer's copy carries no cost, profit, hidden lines or notes", () => {
  const snap = {
    number: "J-1", made_at: "2026-10-03T00:00:00Z", job: { title: "Drive", address: "1 Example St", job_type: "residential" },
    customer: { id: "c", name: "Jane", address_formatted: "1 Example St", status_summary: "secret" }, contact: { id: "p", name: "Jane", phone: "1", email: "e", notes: "x" },
    org: { name: "Example Concrete", logo_light_path: "x" }, prepared_by: { name: "Pat Example", phone: "(225) 555-0100", email: "pat@example.com", user_id: "u-secret" },
    display: { linesOff: { l2: true }, groupsOff: { g2: true }, show_item_prices: true }, draws: [{ pct: 100, when: "Done" }],
    sections: [{ id: "a1", name: "Drive", prep_notes: "Tear out the old drive", access_notes: "gate code 1234", length_ft: 20, width_ft: 30 }],
    price: { ok: true, cost: 5000, overhead: 750, calc: 7187, rounded: 7200, profit: 1450, margin: 0.2, by_type: { material: 5000 },
      groups: [
        { key: "a1", name: "Drive", sell: 7200, hidden: false, price_hidden: false, items: [
          { id: "l1", name: "Pour", sell: 7200, hidden: false, price_hidden: false, addon: false },
          { id: "l2", name: "Secret line", sell: 0, hidden: true, price_hidden: false, addon: false },
          { id: "l3", name: "Hidden price", sell: 99, hidden: false, price_hidden: true, addon: false },
        ] },
        { key: "g2", name: "Hidden group", sell: 10, hidden: true, items: [] },
      ], subtotal: 7200, tax: 0, tax_shown: false, discount: 0, total: 7200, addons_total: 0 },
  };
  const out = publicSnapshot(snap, { project_type: "residential", type_label: "Residential" });
  const text = JSON.stringify(out);
  for (const bad of ["Secret line", "Hidden group", "gate code", "secret", "logo_light_path", "notes", "linesOff", "groupsOff", "5000", "1450", "7187"]) assert.ok(!text.includes(bad), `leaked ${bad}`);
  assert.equal(out.price.total, 7200);
  assert.equal(out.sections[0].scope, "Tear out the old drive");
  assert.deepEqual(out.prepared_by, { name: "Pat Example", phone: "(225) 555-0100", email: "pat@example.com" });
  assert.ok(!text.includes("u-secret"));
  assert.equal(publicSnapshot({ ...snap, prepared_by: undefined }, { project_type: null, type_label: "" }).prepared_by, null);
  assert.equal(out.price.groups[0].items.find((i) => i.id === "l3").sell, 0);
  const withCover = publicSnapshot({ ...snap, display: { ...snap.display, cover: { style: "pour", dark: "#01224b", lines: ["Licensed"], junk: 1 } } }, { project_type: null, type_label: "" });
  assert.deepEqual(withCover.display.cover, { style: "pour", dark: "#01224B", lines: ["Licensed"] });
});

test("signedLine names who signed and when, only for a signed link", async () => {
  const { signedLine, SIGN_CONSENT } = await import("../src/lib/proposal-links.ts");
  assert.equal(signedLine({ status: "viewed", decided_name: "A", decided_at: null }), null);
  assert.equal(signedLine({ status: "accepted", decided_name: " Johnette Wilson ", decided_at: "2026-10-09T23:24:00Z" }), "Signed by Johnette Wilson · Oct 9, 6:24 PM");
  assert.equal(signedLine({ status: "accepted", decided_name: null, decided_at: null }), "Signed by the customer");
  assert.ok(SIGN_CONSENT.length > 10);
});

test("pickedAddons keeps only shown add-ons, once each, and sums them", async () => {
  const { pickedAddons } = await import("../src/lib/proposal-links.ts");
  const price = { ok: true, groups: [{ items: [
    { id: "a", addon: true, sell: 450 }, { id: "b", addon: false, sell: 900 }, { id: "c", addon: true, hidden: true, sell: 50 }, { id: "d", addon: true, sell: 120.5 },
  ] }] };
  assert.deepEqual(pickedAddons(price, ["a", "b", "c", "x", "a", "d"]), { ids: ["a", "d"], total: 570.5 });
  assert.deepEqual(pickedAddons(price, []), { ids: [], total: 0 });
  assert.deepEqual(pickedAddons({ ok: false }, ["a"]), { ids: [], total: 0 });
});

test("a text or email names the proposal links it carries", () => {
  const t = "a".repeat(32), u = "B_-".repeat(10) + "zz";
  assert.deepEqual(linkTokensIn(`Hi Jeremy, here it is: https://scopecrete.ai/p/${t} and again https://scopecrete.ai/p/${t}.`), [t]);
  assert.deepEqual(linkTokensIn(`/p/${u}\n/p/${"c".repeat(33)}`), [u]);
  assert.deepEqual(linkTokensIn("no link here, /p/short"), []);
});

test("the owner's own pages reach the customer's copy, switched-off ones don't, and their files are signed", async () => {
  const { pageFileIds } = await import("../src/lib/proposal-links.ts");
  const pages = [
    { id: "p1", kind: "title", label: "Title" },
    { id: "p2", kind: "photos", label: "Site", photos: [{ id: "f1" }, { id: "f2" }] },
    { id: "p3", kind: "pdf", label: "Plans", file: "f3" },
    { id: "p4", kind: "pdf", label: "Hidden", file: "f4", off: true },
  ];
  assert.deepEqual(pageFileIds(pages), ["f1", "f2", "f3"]);
  const shown = publicSnapshot({ display: { pages, ifind: [{ id: "i1", name: "Soft spot", unit: "SY", sell: 18 }], valid_until: "2026-11-30" }, price: { ok: false } }, { project_type: null, type_label: "", cover_stamp: "Oct 2 · 30.45, -91.18" });
  assert.deepEqual(shown.display.pages.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.equal(shown.display.ifind[0].sell, 18);
  assert.equal(shown.display.valid_until, "2026-11-30");
  assert.equal(shown.cover_stamp, "Oct 2 · 30.45, -91.18");
  const a = linkAssets("org1", { files: { f1: "org1/x/a.jpg", f9: "org2/x/b.jpg" } });
  assert.deepEqual(a.files, { f1: "org1/x/a.jpg" });
  assert.ok(a.paths.includes("org1/x/a.jpg") && !a.paths.includes("org2/x/b.jpg"));
});
