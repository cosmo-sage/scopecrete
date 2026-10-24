import { test } from "node:test";
import assert from "node:assert/strict";
import { slashBlocks, withoutSlash, SLASH_BLOCKS } from "../src/lib/v34/slash-blocks.ts";

test("every block with nothing typed, in the design's order", () => {
  assert.deepEqual(slashBlocks("").map((b) => b.key), ["email", "proposal", "document", "takeoff", "file", "note", "dusty"]);
  assert.equal(SLASH_BLOCKS[0].label, "Email draft");
});
test("what is typed after / filters by a word's start", () => {
  assert.deepEqual(slashBlocks("em").map((b) => b.key), ["email"]);
  assert.deepEqual(slashBlocks("draft").map((b) => b.key), ["email", "dusty"]);
  assert.deepEqual(slashBlocks("pho").map((b) => b.key), ["file"]);
  assert.deepEqual(slashBlocks("zzz"), []);
});
test("the /word comes off the end of the words", () => {
  assert.equal(withoutSlash("Hi Jeremy /em"), "Hi Jeremy");
  assert.equal(withoutSlash("/"), "");
  assert.equal(withoutSlash("a/b stays"), "a/b stays");
});
