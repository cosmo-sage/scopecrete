// A section's sheets, from the bid reader's reference — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetsFor } from "../src/lib/section-sheets.ts";

const sheets = [
  { id: "a", number: "A2.1" }, { id: "b", number: "A2.2" }, { id: "c", number: "A2.10" },
  { id: "d", number: "A1.8" }, { id: "e", number: null }, { id: "f", number: "C-5" },
];

test("the sheets a section's bid line names, in order, only when such a sheet exists", () => {
  const ids = (r) => sheetsFor(r, sheets).map((s) => s.id);
  assert.deepEqual(ids('A2.2, A2.1 · 03 30 00 · "Slabs (5")"'), ["b", "a"]);
  assert.deepEqual(ids("A2.10"), ["c"], "A2.1 is not A2.10");
  assert.deepEqual(ids("see A1.8."), ["d"], "a full stop after the number");
  assert.deepEqual(ids("XA2.1 · A3.4"), [], "no partial match, no sheet that wasn't read");
  assert.deepEqual(ids("c-5"), ["f"]);
  assert.deepEqual(ids(null), []);
});
