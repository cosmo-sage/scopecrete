import { test } from "node:test";
import assert from "node:assert/strict";
import { readViewCompany, viewWriteBlocked, viewCompanyLine } from "../src/lib/view-company.ts";

const id = "8c38d396-af17-446b-8fe0-6db099614758";

test("reads only a company id from the cookie", () => {
  assert.equal(readViewCompany(id), id);
  assert.equal(readViewCompany(id.toUpperCase()), id);
  assert.equal(readViewCompany(""), null);
  assert.equal(readViewCompany(undefined), null);
  assert.equal(readViewCompany(`${id}' or 1=1`), null);
});

test("every write is refused while viewing, except ending the view", () => {
  assert.equal(viewWriteBlocked("POST", "/api/jobs", false), false);
  assert.equal(viewWriteBlocked("GET", "/api/jobs", true), false);
  assert.equal(viewWriteBlocked("HEAD", "/api/jobs", true), false);
  assert.equal(viewWriteBlocked("POST", "/api/jobs", true), true);
  assert.equal(viewWriteBlocked("PATCH", "/api/jobs/abc", true), true);
  assert.equal(viewWriteBlocked("POST", "/api/prefs", true), true);
  assert.equal(viewWriteBlocked("POST", "/api/view-as", true), true);
  assert.equal(viewWriteBlocked("POST", "/api/admin", true), true);
  assert.equal(viewWriteBlocked("DELETE", "/api/admin/view", true), false);
  assert.equal(viewWriteBlocked("DELETE", "/api/admin/view/", true), false);
  assert.equal(viewWriteBlocked("POST", "/api/admin/viewer", true), true);
});

test("the banner names the company and when it ends, Central time", () => {
  assert.equal(viewCompanyLine("Gulfline Paving", "2026-10-22T21:18:00Z"), "Viewing Gulfline Paving · read only · until 4:18 PM");
  assert.equal(viewCompanyLine(null, null), "Viewing a company · read only");
  assert.equal(viewCompanyLine("  ", "nonsense"), "Viewing a company · read only");
});
