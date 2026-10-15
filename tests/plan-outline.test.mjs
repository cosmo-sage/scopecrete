import test from "node:test";
import assert from "node:assert/strict";
import { outline } from "../src/lib/dusty/plan.ts";
test("items nest under the area or item they go on", () => {
  const a = ["new_area", "new_item", "add", "new_group", "update_item", "set_tax", "add"].map((d) => ({ do: d }));
  assert.deepEqual(outline(a), [{ main: 0, subs: [1, 2] }, { main: 3, subs: [4] }, { main: 5, subs: [] }, { main: 6, subs: [] }]);
  assert.deepEqual(outline([{ do: "new_item" }, { do: "vendor_price" }, { do: "new_item" }]), [{ main: 0, subs: [1] }, { main: 2, subs: [] }]);
});
