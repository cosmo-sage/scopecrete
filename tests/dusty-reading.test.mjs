// What Dusty is reading on a job (src/lib/dusty/reading.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileRow, fileRows, readingSummary, sheetLine, sheetProgress, stillReading } from "../src/lib/dusty/reading.ts";

const now = Date.parse("2026-10-12T15:00:00Z");
const at = (min) => new Date(now - min * 60_000).toISOString();
const f = (o) => ({ id: o.id ?? "f", name: o.name ?? "Specs.pdf", category: "spec", kind: "pdf", read_state: "waiting", read_at: null,
  read_attempts: 0, read_error: null, page_count: null, byte_size: 11_378_433, fetch_state: "fetched", created_at: at(60), ...o });

test("a file being read says since when and which try", () => {
  const r = fileRow(f({ read_state: "reading", read_at: at(1), read_attempts: 1 }), now);
  assert.equal(r.tone, "now");
  assert.match(r.status, /Reading now · started 1 min ago/);
  assert.match(r.detail, /11 MB/);
  const slow = fileRow(f({ read_state: "reading", read_at: at(5), read_attempts: 2 }), now);
  assert.equal(slow.tone, "warn");
  assert.match(slow.detail, /try 2 of 3 — longer than usual/);
});

test("a read that stopped mid-way says it, and what happens next", () => {
  const r = fileRow(f({ read_state: "reading", read_at: at(12), read_attempts: 3 }), now);
  assert.match(r.status, /Stopped mid-read 12 min ago/);
  assert.match(r.detail, /marked not read on the next pass/);
  assert.match(fileRow(f({ read_state: "reading", read_at: at(12), read_attempts: 1 }), now).detail, /tried again/);
});

test("skipped and failed carry the reason; plan files point to the sheets", () => {
  const s = fileRow(f({ read_state: "skipped", read_error: "stopped the reader 3 times mid-read" }), now);
  assert.equal(s.tone, "stop");
  assert.equal(s.detail, "stopped the reader 3 times mid-read");
  assert.equal(fileRow(f({ read_state: "skipped", category: "plan" }), now).tone, "done");
  assert.match(fileRow(f({ read_state: "failed", read_attempts: 1, read_at: at(5) }), now).status, /tries again 30 min/);
  assert.equal(fileRow(f({ fetch_state: "waiting" }), now).status, "Still being copied in");
});

test("waiting files know their place in line, and rows sort reading first", () => {
  const rows = fileRows([
    f({ id: "a", read_state: "read", read_at: at(30), page_count: 4 }),
    f({ id: "b", created_at: at(5) }),
    f({ id: "c", created_at: at(10) }),
    f({ id: "d", read_state: "reading", read_at: at(0) }),
  ], now);
  assert.deepEqual(rows.map((r) => r.id), ["d", "c", "b", "a"]);
  assert.equal(rows[1].status, "Next in line");
  assert.equal(rows[2].status, "Waiting · 1 ahead of it");
  assert.equal(rows[3].detail, "4 pages");
  assert.equal(readingSummary(rows), "1 reading · 2 waiting · 1 read");
  assert.ok(stillReading(rows));
  assert.ok(!stillReading([rows[3]]));
});

test("plan sheets: counts of scanned drawings, live label while the browser reads", () => {
  const sh = (o) => ({ file_id: "p", number: null, title: null, number_source: "read", page_w: 2448, page_h: 1584,
    scale_ft_per_pt: null, scale_method: null, ocr_title_at: null, ocr_at: null, ...o });
  const sheets = [sh({}), sh({ ocr_title_at: at(3), ocr_at: at(2) }), sh({ number: "C-1", title: "Site" }), sh({ page_w: 612, page_h: 792 }), sh({ file_id: "out" })];
  const p = sheetProgress(sheets, new Set(["p"]));
  assert.deepEqual(p, { drawings: 3, scans: 2, titles: 1, read: 1 });
  assert.match(sheetLine(p, null).status, /1 of 2 scanned sheets read/);
  assert.match(sheetLine(p, null).detail, /Read the rest/);
  const live = sheetLine(p, "Reading the plans · Reserve · 3 · sheet 2 of 12 · 4 of 9");
  assert.equal(live.tone, "now");
  assert.match(live.detail, /1 of 2/);
  assert.equal(sheetLine({ drawings: 0, scans: 0, titles: 0, read: 0 }, null), null);
  assert.match(sheetLine({ drawings: 5, scans: 0, titles: 0, read: 0 }, null).status, /came with the PDF/);
});
