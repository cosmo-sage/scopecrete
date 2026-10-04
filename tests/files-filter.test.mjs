import { test } from "node:test";
import assert from "node:assert/strict";
import { readFilter, filterQuery, dateWindow, namePattern, activeChips, EMPTY_FILTER } from "../src/lib/files-filter.ts";

const J = "11111111-1111-4111-8111-111111111111";

test("a filter survives the address, and nonsense is dropped", () => {
  const f = readFilter(new URLSearchParams(`q=Wilson&job=${J}&kind=pdf&source=fax&vendor=nope&since=9&from=2026-09-01`));
  assert.equal(f.q, "Wilson"); assert.equal(f.job, J); assert.equal(f.kind, "pdf");
  assert.equal(f.source, ""); assert.equal(f.vendor, ""); assert.equal(f.since, ""); assert.equal(f.from, "2026-09-01");
  assert.equal(filterQuery(f), `q=Wilson&kind=pdf&job=${J}&from=2026-09-01`);
  assert.equal(filterQuery(EMPTY_FILTER), "");
  // A date range wins over "last N days".
  assert.equal(readFilter(new URLSearchParams("since=30&to=2026-10-01")).since, "");
});

test("dates: last N days, and a to-day counts through its end", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  assert.equal(dateWindow({ since: "7", from: "", to: "" }, now).from, "2026-09-26T12:00:00.000Z");
  const w = dateWindow({ since: "", from: "", to: "2026-10-01" }, now);
  assert.equal(w.from, null);
  assert.ok(Date.parse(w.to) - Date.parse(new Date("2026-10-01T00:00:00").toISOString()) === 86400_000);
});

test("a typed name can't carry wildcards or break the filter list", () => {
  assert.equal(namePattern("Wilson"), "%Wilson%");
  assert.equal(namePattern("50%, (x)"), "%50 x%");
  assert.equal(namePattern("a"), null);
});

test("chips name each filter that is set", () => {
  const f = { ...EMPTY_FILTER, q: "angelle", vendor: J, from: "2026-09-01", to: "2026-09-30" };
  assert.deepEqual(activeChips(f, { [J]: "Angelle Concrete" }, (c) => c).map((c) => c.label), ["“angelle”", "Vendor: Angelle Concrete", "2026-09-01 – 2026-09-30"]);
});
