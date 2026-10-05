// Dusty's Markdown → a tree, never HTML — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, inline } from "../src/lib/markdown.ts";

test("inline bold, italic, code", () => {
  assert.deepEqual(inline("Total **$4,200** is `per cy` *about*"), [
    { t: "text", v: "Total " }, { t: "b", v: "$4,200" }, { t: "text", v: " is " }, { t: "code", v: "per cy" }, { t: "text", v: " " }, { t: "i", v: "about" }]);
});

test("a calculation table, numbers right-aligned", () => {
  const b = parseMarkdown("Here:\n\n| Area | Cost | Price |\n|---|---|---|\n| Drive | $1,000 | $1,437.50 |\n| **Total** | $1,000 | $1,437.50 |\n\nDone.");
  assert.equal(b[0].k, "p");
  assert.equal(b[1].k, "table");
  assert.deepEqual(b[1].align, ["left", "right", "right"]);
  assert.equal(b[1].rows.length, 2);
  assert.deepEqual(b[1].rows[1][0], [{ t: "b", v: "Total" }]);
  assert.equal(b[2].k, "p");
});

test("lists, headings, code; HTML stays text", () => {
  const b = parseMarkdown("## Next\n- one\n- two\n1. a\n2. b\n```\nx = 1\n```\n<script>alert(1)</script>");
  assert.deepEqual(b.map((x) => x.k), ["h", "ul", "ol", "code", "p"]);
  assert.equal(b[4].text[0].v, "<script>alert(1)</script>");
});
