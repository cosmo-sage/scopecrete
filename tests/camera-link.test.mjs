import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMERA_TOKEN, cameraPath, thumbPathFor, cameraMessage, linkLine, expiresLine } from "../src/lib/camera-link.ts";

test("a shot's path stays in the link's folder", () => {
  assert.equal(cameraPath("o", "l", "c", "jpg"), "o/camera/l/c.jpg");
  assert.equal(cameraPath("o", "l", "c", "../x"), "o/camera/l/c.bin");
  assert.equal(thumbPathFor("o/camera/l/c.mp4"), "o/camera/l/c.mp4.thumb.jpg");
  assert.ok(CAMERA_TOKEN.test("a".repeat(32)));
  assert.ok(!CAMERA_TOKEN.test("short"));
});

test("the words greet them and name the job", () => {
  const m = cameraMessage({ first: "Johnette", org: "Sacco Enterprises", job: "Wilson Driveway Repair", url: "https://scopecrete.ai/cam/x" });
  assert.match(m, /^Hi Johnette, here's a camera link from Sacco Enterprises/);
  assert.match(m, /the Wilson Driveway Repair job/);
  assert.ok(m.endsWith("\nhttps://scopecrete.ai/cam/x"));
  assert.match(cameraMessage({ first: null, org: "X", job: null, section: "Patio", url: "u" }), /^Hi, .*the Patio —/);
});

test("Coy's line says opened and sent", () => {
  assert.equal(linkLine({ view_count: 0, shot_count: 0 }, () => ""), "Not opened yet");
  assert.equal(linkLine({ view_count: 1, shot_count: 3, last_shot_at: "t" }, () => "2h ago"), "Opened 1 time · 3 shots sent, last 2h ago");
  assert.equal(expiresLine(new Date(Date.now() + 2.5 * 86_400_000).toISOString()), "Works for 3 more days");
  assert.equal(expiresLine(new Date(Date.now() - 1000).toISOString()), "Expired");
});
