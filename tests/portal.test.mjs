import { test } from "node:test";
import assert from "node:assert/strict";
import { requestStage, proposalState, safeFileName, portalPath, guessCategory, portalMessage, validDue } from "../src/lib/portal.ts";

test("a request's stage in the customer's words", () => {
  assert.equal(requestStage("invited").label, "Received");
  assert.equal(requestStage("scoping").label, "Pricing it");
  assert.equal(requestStage("quoted").label, "Proposal sent");
  assert.equal(requestStage("scheduled").label, "Won");
  assert.equal(requestStage("lost").label, "Not going ahead");
  assert.equal(requestStage("quoted", true).label, "Closed");
  assert.equal(requestStage(null).label, "Received");
});

test("a proposal says signed, opened or not opened", () => {
  const day = (iso) => iso.slice(5, 10);
  assert.equal(proposalState({ signed_at: "2026-10-20T10:00:00Z", signed_by: "Jeremy" }, day), "Signed by Jeremy 10-20");
  assert.equal(proposalState({ viewed: true }, day), "Opened");
  assert.equal(proposalState({ viewed: false }, day), "Not opened yet");
});

test("file names and the upload path stay in the portal's folder", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("C:\\plans\\HPC Site <v2>.pdf"), "HPC Site v2.pdf");
  assert.equal(safeFileName("..."), "file");
  const long = "a".repeat(200) + ".pdf";
  assert.equal(safeFileName(long).length, 120);
  assert.ok(safeFileName(long).endsWith(".pdf"));
  assert.equal(portalPath("o", "p", "f", "a/b.pdf"), "o/portal/p/f/b.pdf");
});

test("a first guess at what a file is", () => {
  assert.equal(guessCategory("IMG_2201.HEIC"), "photo");
  assert.equal(guessCategory("Project Specs.pdf"), "spec");
  assert.equal(guessCategory("C3.0 Paving.pdf"), "plan");
  assert.equal(guessCategory("takeoff.xlsx"), "other");
});

test("the link's words and a due day", () => {
  const m = portalMessage({ customer: "Gulfline Paving", org: "Sacco Enterprises", url: "https://scopecrete.ai/c/x" });
  assert.match(m.body, /Gulfline Paving/);
  assert.match(m.body, /https:\/\/scopecrete\.ai\/c\/x$/);
  assert.equal(validDue("2026-10-30", "2026-10-22"), "2026-10-30");
  assert.equal(validDue("2026-10-01", "2026-10-22"), null);
  assert.equal(validDue("2030-10-01", "2026-10-22"), null);
  assert.equal(validDue("10/30/2026", "2026-10-22"), null);
});
