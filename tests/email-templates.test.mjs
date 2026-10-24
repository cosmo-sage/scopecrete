// Editable email templates (src/lib/email-client.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, cleanEmailTemplates, emailTemplatesOf, templateFromDraft, fillTemplate } from "../src/lib/email-client.ts";

test("never saved → the four starters; saved empty list → none", () => {
  assert.equal(emailTemplatesOf(null), TEMPLATES);
  assert.equal(emailTemplatesOf(undefined), TEMPLATES);
  assert.deepEqual(emailTemplatesOf([]), []);
});

test("clean drops blanks, cuts long words, keeps keys unique", () => {
  const out = cleanEmailTemplates([
    { k: "a", label: "One", subject: "S", body: "Hi" },
    { k: "a", label: "Two", subject: "S", body: "Hi" },
    { label: "", body: "x" }, { label: "No body", body: "  " }, "junk",
    { label: "Long", body: "x".repeat(5000) },
  ]);
  assert.equal(out.length, 3);
  assert.notEqual(out[0].k, out[1].k);
  assert.equal(out[2].body.length, 2000);
  assert.equal(out[2].k, "long");
});

test("a draft becomes a template: their first name and the job turn into blanks", () => {
  const t = templateFromDraft({ label: "Pour follow-up", subject: "Gulfline Bollards — pour", body: "Hi Jeremy,\n\nGulfline Bollards pours Friday. Jeremys stays.\n", first: "Jeremy", job: "Gulfline Bollards" });
  assert.equal(t.subject, "{job} — pour");
  assert.equal(t.body, "Hi {first},\n\n{job} pours Friday. Jeremys stays.");
  assert.equal(fillTemplate(t.body, { first: "Amber", job: "Art Apartments" }), "Hi Amber,\n\nArt Apartments pours Friday. Jeremys stays.");
});

test("names with regex characters are matched literally", () => {
  const t = templateFromDraft({ label: "x", subject: "", body: "Re: A+B (phase 2) job", job: "A+B (phase 2)" });
  assert.equal(t.body, "Re: {job} job");
});
