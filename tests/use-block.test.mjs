import { test } from "node:test";
import assert from "node:assert/strict";
import { splitUse, useText } from "../src/lib/dusty/use-block.ts";

test("only the boxed words are used", () => {
  const a = "Here's a tighter intro.\n\n```proposal\nWe will replace the driveway.\nAll work cleaned up.\n```\n\nWant it shorter?";
  assert.equal(useText(a), "We will replace the driveway.\nAll work cleaned up.");
  const s = splitUse(a);
  assert.equal(s.before, "Here's a tighter intro.");
  assert.equal(s.after, "Want it shorter?");
});

test("no box uses the whole answer", () => {
  assert.equal(useText("Just text."), "Just text.");
  assert.equal(splitUse("Just text.").box, null);
});

test("a box still being written counts to the end", () => {
  assert.equal(splitUse("Sure.\n```proposal\n- Tear out\n- Pour").box, "- Tear out\n- Pour");
});

test("another code block is not the box", () => {
  assert.equal(splitUse("```js\nx\n```").box, null);
});
