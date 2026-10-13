// A vendor's website (src/lib/vendor-website.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWebsite, websiteLabel, missingWebsite } from "../src/lib/vendor-website.ts";

test("a website as people type it becomes a full address, or nothing", () => {
  assert.equal(cleanWebsite("teaguerental.com"), "https://teaguerental.com");
  assert.equal(cleanWebsite(" www.teaguerental.com/rentals. "), "https://www.teaguerental.com/rentals");
  assert.equal(cleanWebsite("http://x.example/"), "http://x.example");
  assert.equal(cleanWebsite("https://a.b.co/p?q=1"), "https://a.b.co/p?q=1");
  for (const bad of ["", "teague", "localhost", "mailto:a@b.com", "a@b.com", "javascript:alert(1)", "two words.com", null, 4]) assert.equal(cleanWebsite(bad), null, String(bad));
  assert.equal(websiteLabel("https://www.teaguerental.com/"), "teaguerental.com");
  assert.equal(missingWebsite({ code: "42703", message: 'column contacts.website does not exist' }), true);
  assert.equal(missingWebsite({ code: "42703", message: 'column contacts.trades does not exist' }), false);
  assert.equal(missingWebsite(null), false);
});
