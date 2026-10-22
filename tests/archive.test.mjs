// Archive and delete (migration 066) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isArchivedNow, isSilent, cleanIds, archiveLabel } from "../src/lib/archive.ts";

test("an archived thread stays out until they get in touch again", () => {
  assert.equal(isArchivedNow(null, "2026-10-01T00:00:00Z"), false);
  assert.equal(isArchivedNow("2026-10-03T12:00:00Z", "2026-09-29T21:16:00Z"), true, "the old call doesn't bring it back");
  assert.equal(isArchivedNow("2026-10-03T12:00:00Z", null), true);
  assert.equal(isArchivedNow("2026-10-03T12:00:00Z", "2026-10-04T09:00:00Z"), false, "they called again — it's back");
  assert.equal(isArchivedNow("not a date", null), false);
});

test("nothing said: only calls, none with words", () => {
  assert.equal(isSilent([{ channel: "call", summary: null }, { channel: "call", summary: "" }]), true);
  assert.equal(isSilent([{ channel: "call", summary: "Caller asked for a driveway price." }]), false);
  assert.equal(isSilent([{ channel: "call" }, { channel: "sms", body_text: "" }]), false, "a text, even an empty photo, is someone saying something");
  assert.equal(isSilent([]), false);
});

test("ids are checked, every one", () => {
  const a = "1b2c3d4e-0000-4000-8000-000000000001";
  assert.deepEqual(cleanIds([a, a.toUpperCase()]), [a]);
  assert.equal(cleanIds([a, "nope"]), null);
  assert.equal(cleanIds([]), null);
  assert.equal(cleanIds("x"), null);
  assert.equal(cleanIds(Array(501).fill(a)), null);
});

test("what the toast says", () => {
  assert.equal(archiveLabel("contact", "archive", 18), "Archived 18 threads");
  assert.equal(archiveLabel("contact", "delete", 1), "Deleted 1 contact");
  assert.equal(archiveLabel("customer", "delete", 1), "Deleted 1 customer");
  assert.equal(archiveLabel("job", "delete", 2), "Deleted 2 jobs");
});

test("an archive note is recognised, with who made it", async () => {
  const { archiveNote } = await import("../src/lib/archive.ts");
  assert.deepEqual(archiveNote("Archived — wrong number, wanted a landscaper"), { verb: "Archived", reason: "wrong number, wanted a landscaper", byDusty: false });
  assert.deepEqual(archiveNote("Deleted — duplicate (Dusty's plan)"), { verb: "Deleted", reason: "duplicate", byDusty: true });
  assert.equal(archiveNote("Archived the old plans in the file"), null, "an ordinary note that starts with the word isn't one");
  assert.equal(archiveNote(null), null);
});

test("vendorRemovedNote: a reason makes the note, none makes none", async () => {
  const { vendorRemovedNote } = await import("../src/lib/archive.ts");
  assert.equal(vendorRemovedNote("  never sold us anything "), "Taken off Vendors — never sold us anything");
  assert.equal(vendorRemovedNote(""), null);
  assert.equal(vendorRemovedNote(null), null);
});
