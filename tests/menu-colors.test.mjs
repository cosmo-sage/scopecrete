import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMenuColors, presetOf, iconVar, BOOK_PRESETS } from "../src/lib/v34/menu-colors.ts";
import { cleanMenus, DEFAULT_MENUS } from "../src/lib/v34/pages.ts";

test("a saved book keeps only known roles; nothing saved is Suggested", () => {
  assert.deepEqual(cleanMenuColors({ threads: "chalk", map: "#ff0000", logs: "ink", "x y": "red", admin: "red" }), { threads: "chalk", admin: "red" });
  assert.deepEqual(cleanMenuColors(null), BOOK_PRESETS.Suggested);
  assert.deepEqual(cleanMenuColors({}), {});
  assert.deepEqual(cleanMenuColors(["red"]), BOOK_PRESETS.Suggested);
});

test("a book names its preset, and a role reads its theme variable", () => {
  assert.equal(presetOf({}), "Mono");
  assert.equal(presetOf({ ...BOOK_PRESETS["By kind"] }), "By kind");
  assert.equal(presetOf({ threads: "red" }), null);
  assert.equal(iconVar("green"), "var(--sc-green)");
  assert.equal(iconVar(), "var(--sc-rail-ink)");
});

test("Admin is on the menu only for a platform admin", () => {
  assert.ok(!cleanMenus(DEFAULT_MENUS).rail.includes("admin"));
  assert.ok(!cleanMenus({ rail: [...DEFAULT_MENUS.rail], footer: ["admin"] }).footer.includes("admin"));
  const a = cleanMenus(DEFAULT_MENUS, { admin: true }).rail;
  assert.equal(a[a.indexOf("logs") + 1], "admin");
  // A menu saved before Admin existed gets it after Logs.
  const old = cleanMenus({ rail: ["roadmap", "logs", "dashboard"], footer: [] }, { admin: true }).rail;
  assert.equal(old[old.indexOf("logs") + 1], "admin");
});
