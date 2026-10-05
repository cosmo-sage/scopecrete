import { test } from "node:test";
import assert from "node:assert/strict";
import { findProposalToken, fillLink, toTemplate, fromTemplate, addExample, startingWords, exampleLines, firstName } from "../src/lib/proposal-send.ts";

const TOK = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const URL = `https://scopecrete.ai/p/${TOK}`;

test("a proposal link is found in a text", () => {
  assert.equal(findProposalToken(`Here it is ${URL} thanks`), TOK);
  assert.equal(findProposalToken("see /p/short"), null);
  assert.equal(findProposalToken(null), null);
});

test("the link goes in its slot, else at the end", () => {
  assert.equal(fillLink("Here: {link} thanks", URL), `Here: ${URL} thanks`);
  assert.equal(fillLink("Here: [PROPOSAL LINK].", URL), `Here: ${URL}.`);
  assert.equal(fillLink("Here it is", URL), `Here it is\n${URL}`);
  assert.equal(fillLink(`Already ${URL}`, URL), `Already ${URL}`);
});

test("Coy's words become a pattern and fill back for the next customer", () => {
  const sent = `Hey Johnette, here's the proposal for Wilson Driveway Repair: ${URL} Call me with questions. -Coy`;
  const tpl = toTemplate(sent, { first: "Johnette", title: "Wilson Driveway Repair", url: URL });
  assert.equal(tpl, "Hey {first}, here's the proposal for {title}: {link} Call me with questions. -Coy");
  const next = fromTemplate(tpl, { first: "Amber", title: "Art Apartments Sidewalk", url: "https://x/p/1" });
  assert.equal(next, "Hey Amber, here's the proposal for Art Apartments Sidewalk: https://x/p/1 Call me with questions. -Coy");
  assert.equal(fromTemplate("Hi {first}, here: {link}", { first: "", title: null, url: "u" }), "Hi, here: u");
});

test("a first name is a name, not a number", () => {
  assert.equal(firstName("Johnette Wilson"), "Johnette");
  assert.equal(firstName("(225) 555-0100"), "");
});

test("examples: newest first, the same words once, twelve at most", () => {
  let list = [];
  for (let i = 0; i < 15; i++) list = addExample(list, { via: "text", template: `t${i}`, at: `2026-10-0${i % 9}` });
  assert.equal(list.length, 12);
  assert.equal(list[0].template, "t14");
  list = addExample(list, { via: "text", template: "t3", at: "x" });
  assert.equal(list.filter((x) => x.template === "t3").length, 1);
  assert.equal(list[0].template, "t3");
  assert.deepEqual(addExample("junk", { via: "text", template: "", at: "x" }), []);
});

test("a send starts from Coy's last words for that channel", () => {
  const ex = [{ via: "text", template: "Yo {first} — {title}: {link}", at: "2026-10-05" }];
  const s = startingWords(ex, "text", { first: "Amber", title: "Patio", url: "{link}", org: "Sacco" });
  assert.equal(s.body, "Yo Amber — Patio: {link}");
  assert.equal(s.learned, true);
  const d = startingWords([], "text", { first: "Amber", title: "Patio", url: URL, org: "Sacco" });
  assert.equal(d.learned, false);
  assert.ok(d.body.startsWith("Hi Amber, here is the proposal for Patio: "));
  assert.equal(d.subject, "Patio — proposal from Sacco");
});

test("Dusty is shown where Coy changed his draft", () => {
  const lines = exampleLines([{ via: "text", template: "Hey {first}: {link}", dusty: "Hello {first}, please review: {link}", edited: true, at: "2026-10-05T00:00:00Z", job: "Patio" }],
    [{ body: `Here you go ${URL}`, at: "2026-10-04T00:00:00Z", to: "Amber" }]);
  assert.match(lines[0], /2026-10-05 by text \(Patio\): "Hey \{first\}: \{link\}"/);
  assert.match(lines[1], /You drafted: "Hello/);
  assert.match(lines[2], /texted to Amber/);
});
