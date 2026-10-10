import { test } from "node:test";
import assert from "node:assert/strict";
import { findProposalToken, fillLink, toTemplate, fromTemplate, addExample, startingWords, exampleLines, firstName, greetingSlot } from "../src/lib/proposal-send.ts";

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
  assert.match(lines[0], /2026-10-05 by text: "Hey \{first\}: \{link\}"/);
  assert.match(lines[1], /You drafted: "Hello/);
  assert.match(lines[2], /texted: "Here you go \{link\}"/);
});

test("one customer's name never rides into the next one's words (Coy, 2026-10-06)", () => {
  // The Preview greeted by the customer's name; the send knew only the person's.
  const tpl = toTemplate(`Hi Gulfline, here is the proposal for Gulfline Paving Bollard Installation: ${URL}`, { first: "Dylan", title: "Gulfline Paving Bollard Installation", url: URL, names: ["Gulfline Paving"] });
  assert.equal(tpl, "Hi {first}, here is the proposal for {title}: {link}");
  // A greeting with no names known is still a slot.
  assert.equal(greetingSlot("Hi Gulfline, here it is"), "Hi {first}, here it is");
  assert.equal(greetingSlot("Hey Ms Johnette. I did put"), "Hey Ms {first}. I did put");
  assert.equal(greetingSlot("Good morning John Freeling,\nthe MSA"), "Good morning {first},\nthe MSA");
  assert.equal(greetingSlot("Hi there, here it is"), "Hi there, here it is");
  assert.equal(greetingSlot("Hi Team, here it is"), "Hi Team, here it is");
  assert.equal(greetingSlot("Here is the proposal"), "Here is the proposal");
  // A pattern saved before the fix heals when it is used.
  const old = [{ via: "text", template: "Hi Gulfline, here is the proposal for {title}: {link}\nTake a look.", at: "2026-10-05" }];
  const w = startingWords(old, "text", { first: "Johnette", title: "Wilson Driveway repair", url: URL, org: null });
  assert.equal(w.body, `Hi Johnette, here is the proposal for Wilson Driveway repair: ${URL}\nTake a look.`);
  const lines = exampleLines(old, [{ body: `Hey Amber, the proposal: ${URL}`, at: "2026-10-04", to: "Amber Smith" }]).join("\n");
  assert.ok(!lines.includes("Gulfline") && !lines.includes("Amber"), lines);
});

test("the Preview's words greet the person and carry the real link once it exists (Gulfline, 2026-10-10)", () => {
  const ex = [{ via: "text", template: "Hi Gulfline, here is the proposal for {title}: {link}\nTake a look and let me know if you have any questions.", at: "2026-10-05T19:23:05Z" }];
  const s = startingWords(ex, "text", { first: firstName("Jeremy Wright"), title: "Gulfline Paving Curb and Tree Removal", url: URL, org: "Sacco Enterprises" });
  assert.equal(s.body, `Hi Jeremy, here is the proposal for Gulfline Paving Curb and Tree Removal: ${URL}\nTake a look and let me know if you have any questions.`);
  assert.ok(!s.body.includes("{link}"));
});
