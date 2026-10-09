import { test } from "node:test";
import assert from "node:assert/strict";
import { switchRows, roleLabel } from "../src/lib/org-switch.ts";

test("open org first, others by name, each with its own address", () => {
  const rows = switchRows([
    { id: "b", name: "Sacco Enterprises", slug: "sbuild", role: "field" },
    { id: "a", name: "Gulfline Paving", slug: "gulfline", role: "owner" },
    { id: "a", name: "dup", slug: "x", role: "owner" },
    { id: "c", name: null, slug: "Bad Slug", role: "member" },
  ], "a");
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c"]);
  assert.equal(rows[0].current, true);
  assert.equal(rows[1].href, "https://sbuild.app.scopecrete.ai/dashboard");
  assert.equal(rows[1].role, "Onsite estimator");
  assert.equal(rows[2].href, null);
  assert.equal(rows[2].name, "Unnamed company");
});

test("role labels", () => {
  assert.equal(roleLabel("owner"), "Owner");
  assert.equal(roleLabel(null), "Member");
});
