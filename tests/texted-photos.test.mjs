// Texted photos brought onto a job — `npm test`. Made-up names only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { textedMarker, textedPhotoName } from "../src/lib/texted-photos.ts";

test("a texted photo's file name says who sent it and when (Central)", () => {
  assert.equal(textedPhotoName("Testa Rossi", "2026-10-02T20:41:00Z", "jpg"), "Texted by Testa Rossi · Oct 2 3.41 PM.jpg");
  assert.equal(textedPhotoName(null, "2026-10-02T20:41:00Z", "png"), "Texted by customer · Oct 2 3.41 PM.png");
  assert.equal(textedPhotoName("+12255550123", null, "jpg"), "Texted by customer.jpg");
  assert.equal(textedPhotoName("A/B: <x>", null, "j.p.g"), "Texted by A B x.jpg");
});

test("the marker ties a job's copy to the text it came from", () => {
  assert.equal(textedMarker("abc"), "message_media:abc");
});
