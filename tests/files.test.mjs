// File helpers — `npm test`. Kind, first-guess category, storage-safe names and paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, categoryGuess, safeName, storagePath, sizeLabel } from "../src/lib/files.ts";

test("kind from type, then from name", () => {
  assert.equal(kindOf("application/pdf", "x"), "pdf");
  assert.equal(kindOf("", "Plans Sheet A1.PDF"), "pdf");
  assert.equal(kindOf("image/heic", "IMG_1.HEIC"), "image");
  assert.equal(kindOf(null, "walkthrough.mov"), "video");
  assert.equal(kindOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "bid.xlsx"), "sheet");
  assert.equal(kindOf("application/zip", "x.zip"), "other");
});

test("category guess is only a first guess", () => {
  assert.equal(categoryGuess("image", "IMG_2231.jpg"), "photo");
  assert.equal(categoryGuess("pdf", "Oak Glen plans.pdf"), "plan");
  assert.equal(categoryGuess("image", "home depot receipt.jpg"), "receipt");
  assert.equal(categoryGuess("pdf", "ITB - Parish sidewalks.pdf"), "bid");
  assert.equal(categoryGuess("pdf", "whatever.pdf"), "other");
});

test("safe names keep the extension and drop anything a key can't hold", () => {
  assert.equal(safeName("Oak Glen / plans (rev 2).PDF"), "Oak-Glen-_-plans-rev-2.pdf");
  assert.equal(safeName("café photo.jpeg"), "cafe-photo.jpeg");
  assert.equal(safeName("..hidden"), "file.hidden");
  assert.equal(safeName("   "), "file");
  assert.ok(safeName("a".repeat(300) + ".jpg").length <= 84);
});

test("path starts with the org — the storage policy checks that segment", () => {
  assert.equal(storagePath("org1", "job9", "f1", "IMG 1.jpg"), "org1/job9/f1/IMG-1.jpg");
});

test("sizes read like a person would say them", () => {
  assert.equal(sizeLabel(512), "512 B");
  assert.equal(sizeLabel(2048), "2 KB");
  assert.equal(sizeLabel(2.5 * 1024 * 1024), "2.5 MB");
  assert.equal(sizeLabel(40 * 1024 * 1024), "40 MB");
});
