// Voicemails on missed calls (src/lib/quo.ts voicemailOf) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { voicemailOf } from "../src/lib/quo.ts";

test("Quo's voicemail reads its words, link and seconds", () => {
  assert.deepEqual(voicemailOf({ duration: 10, transcript: " Hi. I would like an estimate. ", recordingUrl: "https://x/vm.mp3", status: "completed" }),
    { transcript: "Hi. I would like an estimate.", url: "https://x/vm.mp3", duration: 10 });
  assert.deepEqual(voicemailOf([{ url: "https://x/a.mp3" }]), { transcript: null, url: "https://x/a.mp3", duration: null });
  assert.equal(voicemailOf({ status: "pending" }), null);
  assert.equal(voicemailOf(null), null);
});
