// What Dusty made in a chat, for the artifacts column (Coy, 2026-10-19). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactsOf, planSummary, tablesIn, linksIn } from "../src/lib/dusty/artifacts.ts";

const table = "| Area | Qty | Price |\n|---|---|---|\n| Drive | 900 SF | $8,100 |\n| Apron | 120 SF | $1,080 |";

test("tables: header, rule and rows", () => {
  const t = tablesIn(`Here it is.\n\n${table}\n\nThat's it.`);
  assert.equal(t.length, 1);
  assert.equal(t[0].split("\n").length, 4);
  assert.deepEqual(tablesIn("| not | a table |"), []);
});

test("links: markdown and bare, each once, punctuation trimmed", () => {
  const l = linksIn("See [Casco](https://casco.com/rebar) and https://homedepot.com/p/123. Also https://homedepot.com/p/123, and [the job](/dashboard/scope/x/summary).");
  assert.deepEqual(l.map((x) => x.href), ["https://casco.com/rebar", "/dashboard/scope/x/summary", "https://homedepot.com/p/123"]);
  assert.equal(l[0].label, "Casco");
});

test("plan summary by kind", () => {
  assert.equal(planSummary(["add", "add", "new_item"]), "budget line ×2 · new item");
});

test("a chat's artifacts, newest first, the streaming turn left out", () => {
  const items = [
    { role: "user", content: "Price it", files: [{ id: "f1", name: "drive.jpg", kind: "image", url: "https://x/y.jpg" }] },
    { role: "assistant", content: `Done.\n\n${table}\n\n\`\`\`scopecrete-plan\n[{"do":"new_group","name":"Concrete","cost_type":"material"}]\n\`\`\`` },
    { role: "user", content: "Scope?" },
    { role: "assistant", content: "```proposal\n- Tear out the old drive\n- Pour 4\" slab\n```" },
    { role: "user", content: "More" },
    { role: "assistant", content: "| a | b |\n|---|---|\n| 1 | 2 |" },
  ];
  const a = artifactsOf(items, { streaming: 5 });
  assert.deepEqual(a.map((x) => x.kind), ["words", "table", "plan", "file"]);
  assert.equal(a[0].sub, "Tear out the old drive");
  assert.equal(a[1].title, "Area · Qty · Price");
  assert.equal(a[1].sub, "2 rows");
  assert.equal(a[2].title, "Plan · 1 step");
  assert.equal(a[3].href, "/dashboard/files?file=f1");
  assert.equal(a[3].thumb, "https://x/y.jpg");
  assert.equal(artifactsOf(items).length, 5);
});
