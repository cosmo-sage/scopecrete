import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSwipe, isHorizontal, clampDrag, TRAY_PX } from "../src/lib/swipe.ts";

test("right opens the buckets; a nudge springs back", () => {
  assert.equal(decideSwipe(90, 390, false), "open");
  assert.equal(decideSwipe(40, 390, true), "close");
});

test("all the way left accepts Dusty's guess — only when there is one", () => {
  assert.equal(decideSwipe(-250, 390, true), "accept");
  assert.equal(decideSwipe(-150, 390, true), "close");
  assert.equal(decideSwipe(-380, 390, false), "close");
});

test("vertical scrolling is never taken for a swipe", () => {
  assert.equal(isHorizontal(8, 0), false);
  assert.equal(isHorizontal(30, 25), false);
  assert.equal(isHorizontal(40, 10), true);
});

test("the row follows the finger within limits", () => {
  assert.equal(clampDrag(900, 390, true), TRAY_PX + 24);
  assert.equal(clampDrag(-900, 390, true), -390);
  assert.equal(clampDrag(-900, 390, false), -24);
});
