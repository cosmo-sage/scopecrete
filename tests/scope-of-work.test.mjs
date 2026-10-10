import { test } from "node:test";
import assert from "node:assert/strict";
import { sowLines, sowText } from "../src/lib/scope-of-work.ts";

test("one bullet a line, markers and blanks taken off", () => {
  assert.deepEqual(sowLines("• Saw cut and remove 398 LF of curb\n\n- Haul off debris\n2. Form and pour 6\" curb\n  * Clean up  "),
    ["Saw cut and remove 398 LF of curb", "Haul off debris", "Form and pour 6\" curb", "Clean up"]);
  assert.deepEqual(sowLines(null), []);
  assert.deepEqual(sowLines("-5 degrees is fine"), ["-5 degrees is fine"]);
});

test("stored text round-trips; nothing is null", () => {
  assert.equal(sowText(["  A ", "", "B"]), "A\nB");
  assert.equal(sowText(["", " "]), null);
  assert.deepEqual(sowLines(sowText(["• A", "B"])), ["A", "B"]);
});
