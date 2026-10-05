import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSwipe, isHorizontal, clampDrag, TRAY_PX, ACTIONS_PX } from "../src/lib/swipe.ts";

test("right opens the buckets; a nudge springs back", () => {
  assert.equal(decideSwipe(90), "open");
  assert.equal(decideSwipe(40), "close");
});

test("left opens Spam and Archive; a nudge springs back", () => {
  assert.equal(decideSwipe(-90), "actions");
  assert.equal(decideSwipe(-40), "close");
});

test("vertical scrolling is never taken for a swipe", () => {
  assert.equal(isHorizontal(8, 0), false);
  assert.equal(isHorizontal(30, 25), false);
  assert.equal(isHorizontal(40, 10), true);
});

test("the row follows the finger within limits", () => {
  assert.equal(clampDrag(900), TRAY_PX + 24);
  assert.equal(clampDrag(-900), -(ACTIONS_PX + 24));
  assert.equal(clampDrag(-50), -50);
});
