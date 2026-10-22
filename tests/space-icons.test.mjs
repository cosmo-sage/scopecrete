// Work Space icons drawn by Dusty (migration 117) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readKey, iconFromModel, iconMap, keysToDraw, iconPrompt } from "../src/lib/space-icons.ts";

const ID = "5f02a4d7-1111-4222-8333-944455556666";
const ROAD = `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2E4A62"/><path d="M8 52 L26 18 H38 L56 52 Z" fill="#3B3F45"/><circle cx="46" cy="16" r="6" fill="#F2C230"/></svg>`;

test("keys", () => {
  assert.deepEqual(readKey(`job:${ID}`), { kind: "job", id: ID });
  assert.deepEqual(readKey(`vendor:${ID.toUpperCase()}`), { kind: "vendor", id: ID });
  assert.equal(readKey(`home:${ID}`), null);
  assert.equal(readKey("job:1"), null);
  assert.equal(readKey(null), null);
});

test("a drawn icon is cleaned and kept", () => {
  const r = iconFromModel({ about: "a paved road", svg: ROAD });
  assert.ok(r);
  assert.match(r.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(r.svg, /<title>a paved road<\/title>/);
  assert.equal(r.about, "a paved road");
});

test("scripts, links and outside pictures never survive", () => {
  const r = iconFromModel({ svg: `<svg viewBox="0 0 64 64"><script>alert(1)</script><a href="https://x"><rect width="9" height="9"/></a><image href="https://x/a.png"/><rect width="64" height="64" onclick="x()" fill="red"/></svg>` });
  assert.ok(r);
  assert.doesNotMatch(r.svg, /script|href|image|onclick/i);
});

test("not an icon → null", () => {
  assert.equal(iconFromModel({ svg: "no svg here" }), null);
  assert.equal(iconFromModel({ svg: `<svg viewBox="0 0 400 100"><rect width="400" height="100"/></svg>` }), null, "too wide");
  assert.equal(iconFromModel({ svg: `<svg viewBox="0 0 64 64"></svg>` }), null, "empty");
  assert.equal(iconFromModel("x"), null);
});

test("which rail Spaces still want drawing", () => {
  const icons = iconMap([{ key: `job:${ID}`, source: "dusty", svg: ROAD }, { key: `customer:${ID}`, source: "shape", svg: null }, { key: "bad", source: "dusty" }]);
  assert.equal(icons.size, 2);
  const other = ID.replace("6666", "7777");
  const tried = new Set([`col:${other}`]);
  assert.deepEqual(keysToDraw([`job:${ID}`, `customer:${ID}`, `col:${other}`, `vendor:${other}`, `job:${other}`, `customer:${other}`], icons, tried, 2),
    [`vendor:${other}`, `job:${other}`]);
});

test("the prompt is plain facts", () => {
  const p = iconPrompt("vendor", { name: "Casco", detail: ["Trades: ready mix", ""] });
  assert.match(p, /a vendor/);
  assert.match(p, /- Trades: ready mix/);
  assert.equal(p.split("\n").length, 2);
});
