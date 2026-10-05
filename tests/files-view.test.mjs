import { test } from "node:test";
import assert from "node:assert/strict";
import { folderPatch, activeFolder, byMonth, bytesLabel, storageLabel, storageLimitBytes, isPhotosView } from "../src/lib/files-view.ts";
import { EMPTY_FILTER } from "../src/lib/files-filter.ts";

const J = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";

test("a folder sets where to look and clears the other places, keeping the words and the type", () => {
  const f = { ...EMPTY_FILTER, q: "Wilson", kind: "image", cat: "plan", vendor: C };
  const n = { ...f, ...folderPatch({ kind: "job", id: J }) };
  assert.equal(n.job, J); assert.equal(n.cat, ""); assert.equal(n.vendor, ""); assert.equal(n.q, "Wilson"); assert.equal(n.kind, "image");
  assert.deepEqual(activeFolder(n), { kind: "job", id: J });
  const r = { ...n, ...folderPatch({ kind: "recent" }) };
  assert.equal(r.since, "30"); assert.equal(r.job, "");
  assert.deepEqual(activeFolder(r), { kind: "recent" });
  assert.deepEqual(activeFolder({ ...r, ...folderPatch({ kind: "all" }) }), { kind: "all" });
  // Emails have no photos: opening them leaves the Photos view.
  assert.equal(isPhotosView({ ...n, ...folderPatch({ kind: "cat", cat: "email" }) }), false);
});

test("a fixed customer (the customer page) is not the open folder", () => {
  const f = { ...EMPTY_FILTER, customer: C };
  assert.deepEqual(activeFolder(f, { customer: C }), { kind: "all" });
  assert.deepEqual(activeFolder(f), { kind: "customer", id: C });
});

test("photos group by month in Central time, newest first", () => {
  const g = byMonth([
    { id: "a", created_at: "2026-10-02T15:00:00Z" },
    { id: "b", created_at: "2026-10-01T03:00:00Z" }, // Sep 30, 10 PM in Baton Rouge
    { id: "c", created_at: "2026-08-12T15:00:00Z" },
    { id: "d", created_at: "nonsense" },
  ]);
  assert.deepEqual(g.map((x) => [x.key, x.label, x.items.map((i) => i.id).join("")]),
    [["2026-10", "October 2026", "a"], ["2026-09", "September 2026", "b"], ["2026-08", "August 2026", "c"]]);
});

test("storage: used of the limit, what's left, and when to worry", () => {
  assert.equal(bytesLabel(512), "512 B");
  assert.equal(bytesLabel(39_216_000), "37.4 MB");
  assert.equal(bytesLabel(1024 ** 3), "1 GB");
  const s = storageLabel(39_216_000, storageLimitBytes(undefined));
  assert.equal(s.used, "37.4 MB used of 1 GB"); assert.equal(s.left, "987 MB left"); assert.equal(s.tone, "ok");
  assert.equal(storageLabel(0.9 * 1024 ** 3, 1024 ** 3).tone, "warn");
  const full = storageLabel(2 * 1024 ** 3, 1024 ** 3);
  assert.equal(full.left, "Full"); assert.equal(full.pct, 1); assert.equal(full.tone, "full");
  assert.equal(storageLimitBytes("8"), 8 * 1024 ** 3);
  assert.equal(storageLimitBytes("nope"), 1024 ** 3);
});
