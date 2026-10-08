// The Map page's model (src/lib/map.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layerForJob, visiblePins, layerCounts, cleanFilters, DEFAULT_FILTERS, clusterPins, clipPlan, validClipSize, feetPerPixel, scaleReadout, nearestJobs, distanceLabel, bidNote, CLIP_MIN, CLIP_MAX } from "../src/lib/map.ts";

const pin = (o) => ({ id: o.id ?? "j", kind: "job", layer: "lead", lat: 30.45, lng: -91.15, name: "x", addr: "", ...o });

test("a job's layer comes from its status; a sent proposal moves estimating to Proposals sent", () => {
  assert.equal(layerForJob("in_progress", false), "active");
  assert.equal(layerForJob("won", true), "active");
  assert.equal(layerForJob("lead", false), "lead");
  assert.equal(layerForJob("consultation", false), "lead");
  assert.equal(layerForJob(null, false), "lead");
  assert.equal(layerForJob("invited", false), "bid");
  assert.equal(layerForJob("scoping", false), "est");
  assert.equal(layerForJob("quoted", true), "sent");
  assert.equal(layerForJob("complete", false), "done");
  assert.equal(layerForJob("lost", true), "lost");
});

test("filters: layers, job type, city and created date; vendors follow only their layer", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  const pins = [
    pin({ id: "a", layer: "active", type: "residential", city: "Zachary", createdAt: "2026-10-01T00:00:00Z" }),
    pin({ id: "b", layer: "lost", type: "commercial", city: "Baton Rouge", createdAt: "2025-01-01T00:00:00Z" }),
    pin({ id: "v", kind: "vendor", layer: "vendor" }),
  ];
  assert.deepEqual(visiblePins(pins, DEFAULT_FILTERS, now).map((p) => p.id), ["a", "v"]);
  const f = { ...DEFAULT_FILTERS, layers: ["active", "lost", "vendor"], jobTypes: ["commercial"] };
  assert.deepEqual(visiblePins(pins, f, now).map((p) => p.id), ["b", "v"]);
  assert.deepEqual(visiblePins(pins, { ...f, jobTypes: [], city: "zachary" }, now).map((p) => p.id), ["a", "v"]);
  assert.deepEqual(visiblePins(pins, { ...f, jobTypes: [], created: "90d" }, now).map((p) => p.id), ["a", "v"]);
  const c = layerCounts(pins, DEFAULT_FILTERS, now);
  assert.equal(c.lost, 1); assert.equal(c.active, 1); assert.equal(c.vendor, 1);
});

test("a saved filter is cleaned", () => {
  assert.deepEqual(cleanFilters({ layers: ["active", "nope", "active"], jobTypes: ["public", "x"], city: "Baker", created: "1y" }),
    { layers: ["active"], jobTypes: ["public"], city: "Baker", created: "1y" });
  assert.deepEqual(cleanFilters(null).layers, DEFAULT_FILTERS.layers);
});

test("pins cluster below zoom 11 and stand alone from 11", () => {
  const pins = [pin({ id: "1" }), pin({ id: "2", lat: 30.4501 }), pin({ id: "3", lat: 31.5 })];
  const far = clusterPins(pins, 8);
  assert.equal(far.length, 2);
  assert.equal(far.find((c) => c.pins.length === 2)?.pins.length, 2);
  assert.equal(clusterPins(pins, 11).length, 3);
});

test("scale: about 0.42 ft a pixel at zoom 20 in Baton Rouge; the readout is per inch", () => {
  assert.ok(Math.abs(feetPerPixel(30.4515, 20) - 0.42224) < 1e-4);
  assert.equal(scaleReadout(30.4515, 20), "1 in ≈ 41 ft · zoom 20");
});

test("a clip is saved at a zoom that makes it a drawing, never bigger than the cap", () => {
  // 334 × 296 on a phone at zoom 19.4 → zoom 20 is 507 px; closer until it's a drawing.
  const p = clipPlan(334, 296, 19.4);
  assert.ok(p && Math.max(p.w, p.h) >= CLIP_MIN && Math.max(p.w, p.h) <= CLIP_MAX, JSON.stringify(p));
  assert.equal(p.z, 22);
  // A desktop frame at zoom 19: 720 × 520 → zoom 20 is 1,440 × 1,040.
  assert.deepEqual(clipPlan(720, 520, 19), { z: 20, w: 1440, h: 1040 });
  // Too far out to clip.
  assert.equal(clipPlan(720, 520, 14), null);
  // At the closest zoom and still small: more ground around the same centre.
  const s = clipPlan(100, 50, 22);
  assert.equal(s.z, 22); assert.equal(s.w, CLIP_MIN); assert.equal(s.h, CLIP_MIN / 2);
  assert.ok(validClipSize(1440, 1040)); assert.equal(validClipSize(900, 600), null); assert.equal(validClipSize(3000, 1200), null); assert.equal(validClipSize(1440.5, 1040), null);
});

test("jobs nearest the spot first, those with no address last", () => {
  const at = { lat: 30.45, lng: -91.15 };
  const l = nearestJobs([
    { id: "far", title: "B", lat: 30.5, lng: -91.15, customer: null, addr: null, stage: "" },
    { id: "none", title: "A", lat: null, lng: null, customer: null, addr: null, stage: "" },
    { id: "here", title: "C", lat: 30.45, lng: -91.15, customer: null, addr: null, stage: "" },
  ], at);
  assert.deepEqual(l.map((j) => j.id), ["here", "far", "none"]);
  assert.equal(distanceLabel(l[0].mi), "at this spot");
  assert.equal(distanceLabel(l[1].mi), "3.5 mi");
});

test("a bid's due note is urgent under 48 hours", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  assert.deepEqual(bidNote("2026-10-09T12:00:00Z", now), { note: "Due in 36 h", urgent: true });
  assert.deepEqual(bidNote("2026-10-13T00:00:00Z", now), { note: "Due in 5 days", urgent: false });
  assert.equal(bidNote(null, now), null);
});
