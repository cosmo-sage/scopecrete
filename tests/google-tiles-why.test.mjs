import { test } from "node:test";
import assert from "node:assert/strict";
import { refusalWhy } from "../src/lib/google-tiles-server.ts";

const err = (status, reason, message) => ({ error: { status, message, details: [{ reason }] } });

test("a website-only key is named, not 'not enabled'", () => {
  const w = refusalWhy(403, err("PERMISSION_DENIED", "API_KEY_HTTP_REFERRER_BLOCKED", "Requests from referer <empty> are blocked."));
  assert.match(w.text, /Application restrictions, pick None/);
  assert.match(w.raw, /API_KEY_HTTP_REFERRER_BLOCKED/);
});

test("the API off in the project", () => {
  const w = refusalWhy(403, err("PERMISSION_DENIED", "SERVICE_DISABLED", "Map Tiles API has not been used in project 123 before or it is disabled."));
  assert.match(w.text, /Library → Map Tiles API → Enable/);
});

test("the API missing from the key's restrictions", () => {
  const w = refusalWhy(403, err("PERMISSION_DENIED", "API_KEY_SERVICE_BLOCKED", "Requests to this API tile.googleapis.com method ... are blocked."));
  assert.match(w.text, /API restrictions → tick Map Tiles API/);
});

test("billing, and a key never echoed", () => {
  const w = refusalWhy(403, err("PERMISSION_DENIED", "BILLING_DISABLED", "This API requires billing. key=AIzaSECRET"));
  assert.match(w.text, /Billing/);
  assert.doesNotMatch(w.text, /AIzaSECRET/);
});

test("no body says the HTTP status", () => {
  assert.match(refusalWhy(500, null).text, /HTTP 500/);
});
