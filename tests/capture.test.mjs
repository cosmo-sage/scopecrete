import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM, nearRadius, matchPlace, fitWithin, shotName, siteLabel, cleanCapture, extFor, NEAR_M } from "../src/lib/capture.ts";

const here = { lat: 30.4515, lng: -91.1871 };
// ~111 m per 0.001° of latitude.
const north = (m) => ({ lat: here.lat + m / 111_195, lng: here.lng });

test("distance is in metres", () => {
  assert.ok(Math.abs(distanceM(here, north(100)) - 100) < 1);
  assert.equal(distanceM(here, here), 0);
});

test("the radius is 150 m, or twice a poor GPS fix, never over 500", () => {
  assert.equal(nearRadius(null), NEAR_M);
  assert.equal(nearRadius(20), 150);
  assert.equal(nearRadius(120), 240);
  assert.equal(nearRadius(900), 500);
});

test("one job in range is picked; two close ones are offered; far ones are left out", () => {
  const a = { kind: "job", id: "a", label: "Wilson Driveway", ...north(40) };
  const b = { kind: "job", id: "b", label: "Sacco Patio", ...north(60) };
  const far = { kind: "job", id: "c", label: "Far", ...north(2000) };
  let m = matchPlace(here, 10, [a, far]);
  assert.equal(m.pick?.id, "a");
  assert.equal(m.near.length, 1);
  m = matchPlace(here, 10, [b, a, far]);
  assert.equal(m.pick, null);
  assert.deepEqual(m.near.map((p) => p.id), ["a", "b"]);
  // Clearly nearer: under half the next one's distance.
  m = matchPlace(here, 10, [{ ...a, ...north(20) }, b]);
  assert.equal(m.pick?.id, "a");
  assert.equal(matchPlace(here, 10, [far]).pick, null);
});

test("a site made into a job counts as that job, once", () => {
  const job = { kind: "job", id: "j1", label: "LaRochelle Driveway", ...north(30) };
  const site = { kind: "site", id: "s1", label: "8812 David Dr", job_id: "j1", ...north(35) };
  const m = matchPlace(here, 10, [site, job]);
  assert.equal(m.near.length, 1);
  assert.equal(m.pick?.kind, "job");
  assert.equal(m.pick?.id, "j1");
});

test("a picture is shrunk to its long edge, never enlarged", () => {
  assert.deepEqual(fitWithin(4032, 3024, 2048), { w: 2048, h: 1536 });
  assert.deepEqual(fitWithin(3024, 4032, 400), { w: 300, h: 400 });
  assert.deepEqual(fitWithin(800, 600, 2048), { w: 800, h: 600 });
  assert.deepEqual(fitWithin(0, 600, 2048), { w: 0, h: 0 });
});

test("a shot's name is its kind and Central time", () => {
  assert.equal(shotName("2026-10-15T19:31:00Z", "image", "jpg"), "Site photo · Oct 15 2.31 PM.jpg");
  assert.equal(shotName("bad", "video", "mp4"), "Site video.mp4");
});

test("a site reads its name, else its street, else its point", () => {
  assert.equal(siteLabel({ name: " Corporate lot ", address: "7560 Corporate Blvd, Baton Rouge", lat: 1, lng: 2 }), "Corporate lot");
  assert.equal(siteLabel({ name: null, address: "7560 Corporate Blvd, Baton Rouge", lat: 1, lng: 2 }), "7560 Corporate Blvd");
  assert.equal(siteLabel({ lat: 30.45151, lng: -91.18712 }), "30.45151, -91.18712");
});

test("a shot's upload is checked", () => {
  const now = Date.parse("2026-10-15T20:00:00Z");
  const id = "0b5c2a8e-1f7c-4c3a-9d2e-7a1b2c3d4e5f";
  assert.equal(typeof cleanCapture({ mime: "image/jpeg", size: 1 }, now), "string");
  assert.equal(typeof cleanCapture({ client_id: id, mime: "application/pdf", size: 1 }, now), "string");
  assert.equal(typeof cleanCapture({ client_id: id, mime: "image/jpeg", size: 0 }, now), "string");
  const ok = cleanCapture({ client_id: id, mime: "video/webm;codecs=vp9", size: 5e6, thumb_size: 30_000, taken_at: "2026-10-15T19:59:00Z",
    lat: 30.45, lng: -91.18, accuracy: 12.4, tag: "before", note: "  cracked apron  ", job_id: "nope" }, now);
  assert.equal(typeof ok, "object");
  assert.equal(ok.kind, "video");
  assert.equal(ok.mime, "video/webm");
  assert.equal(ok.accuracy, 12);
  assert.equal(ok.tag, "before");
  assert.equal(ok.note, "cracked apron");
  assert.equal(ok.job_id, null);
  // A clock in the future, or Null Island, is not trusted.
  const odd = cleanCapture({ client_id: id, mime: "image/jpeg", size: 1, taken_at: "2027-01-01T00:00:00Z", lat: 0, lng: 0, tag: "x" }, now);
  assert.equal(odd.taken_at, new Date(now).toISOString());
  assert.equal(odd.lat, null);
  assert.equal(odd.tag, null);
});

test("file extensions follow the type", () => {
  assert.equal(extFor("video/quicktime"), "mov");
  assert.equal(extFor("image/jpeg"), "jpg");
});
