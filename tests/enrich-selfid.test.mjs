import { test } from "node:test";
import assert from "node:assert/strict";
import { findSelfIdentification } from "../src/lib/enrich/rules.ts";

const THEM = "+12255550101";
const US = "+12253782458";
const sms = (who, text, id = `m${Math.random()}`) => ({ id, kind: "sms", who, at: "2026-09-01", text, hasMedia: false });
const call = (who, text, id = `c${Math.random()}`) => ({ id, kind: "call", who, at: "2026-09-01", text, hasMedia: false });

test("real introductions from the data apply", () => {
  for (const [text, name] of [
    ["Hi Coy, Good afternoon! This is Maegan. We tried to run the payment", "Maegan"],
    ["It's Amber with The Arts at Jefferson Heights! ", "Amber"],
    ["Hi Coy, this is Jen McLean from HMG Careers.", "Jen McLean"],
    ["Hi coy it's Tommy \r\nHope all is well.", "Tommy"],
    ["Mike here, running 10 late", "Mike"],
  ]) {
    const hit = findSelfIdentification(name, [sms("THEM", text, "x")], [THEM]);
    assert.ok(hit, `${name} should apply from: ${text}`);
    assert.equal(hit.turnId, "x");
  }
});

test("the evidence is the line they said it on", () => {
  const hit = findSelfIdentification("Maegan", [sms("THEM", "Hello\nThis is Maegan from billing\nThanks")], [THEM]);
  assert.equal(hit.quote, "This is Maegan from billing");
});

test("our own outbound text never names them", () => {
  assert.equal(findSelfIdentification("Mike", [sms("US", "Hey this is Mike right?"), sms("THEM", "yes")], [THEM]), null);
});

test("Coy introducing himself is never their name", () => {
  assert.equal(findSelfIdentification("Coy Sacco", [sms("THEM", "this is Coy Sacco")], [THEM]), null);
});

test("a possessive is not an introduction", () => {
  assert.equal(findSelfIdentification("Mike", [sms("THEM", "this is Mike's wife, he asked me to text")], [THEM]), null);
});

test("the whole proposed name must be said", () => {
  assert.equal(findSelfIdentification("Amber Smith", [sms("THEM", "It's Amber with The Arts")], [THEM]), null);
});

test("a name only mentioned, not introduced, does not apply", () => {
  assert.equal(findSelfIdentification("Brad Chaney",
    [sms("THEM", "New Lead From Baton Rouge Concreters — Brad Chaney needs a driveway. Call them at 2253265685. — Dalton Digital")], [THEM]), null);
});

test("two different introductions on one number: ask instead", () => {
  const turns = [sms("THEM", "Hi this is Maegan from the office"), sms("THEM", "Hey Coy, this is Jess following up")];
  assert.equal(findSelfIdentification("Maegan", turns, [THEM]), null);
});

test("ordinary sentences are not a second name", () => {
  const turns = [sms("THEM", "Hi Coy this is Brandon."), sms("THEM", "This is valid for 15 minutes. I'm sorry, it's working now. I am Outside")];
  assert.ok(findSelfIdentification("Brandon", turns, [THEM]));
});

test("in a call transcript only the contact's own lines count, either direction", () => {
  const t = `${US}: Hello?\n${THEM}: Hey, this is Gustavo with Roof Squad.\n${US}: Hey Gustavo.`;
  assert.ok(findSelfIdentification("Gustavo", [call("US", t)], [THEM]));
  const coySays = `${US}: Hi, this is Gustavo's contractor calling\n${THEM}: ok`;
  assert.equal(findSelfIdentification("Gustavo", [call("THEM", coySays)], [THEM]), null);
  const coyIntro = `${US}: this is Gustavo\n${THEM}: ok`;
  assert.equal(findSelfIdentification("Gustavo", [call("THEM", coyIntro)], [THEM]), null);
});

test("a call summary has no speaker and never counts", () => {
  assert.equal(findSelfIdentification("Gustavo", [call("THEM", "Caller said this is Gustavo from Roof Squad.")], [THEM]), null);
});

test("junk proposals are refused", () => {
  for (const n of [null, "", "x", "Sorry", "The Office", "1234", "Mike <script>"]) {
    assert.equal(findSelfIdentification(n, [sms("THEM", `this is ${n}`)], [THEM]), null, String(n));
  }
});

test("a trailing word is not part of a name", () => {
  assert.equal(findSelfIdentification("Marjorie with", [sms("THEM", "This is Marjorie with Aegis Maintenance.")], [THEM]), null);
  assert.equal(findSelfIdentification("marjorie", [sms("THEM", "This is Marjorie with Aegis Maintenance.")], [THEM]), null);
});

test("a stuttering transcript is not a second introduction", () => {
  const t = `${THEM}: I'm I'm pretty open this week.\n${THEM}: This is Connor over at Freshstart.\n${THEM}: it's Wednesday or Thursday`;
  assert.ok(findSelfIdentification("Connor", [call("THEM", t)], [THEM]));
});

test("a caller who corrects the name is asked about, not named", () => {
  const t = `${THEM}: My name is Joe.\n${US}: Joe?\n${THEM}: It's Jose, spelled j o s e.`;
  assert.equal(findSelfIdentification("Joe", [call("THEM", t)], [THEM]), null);
  assert.equal(findSelfIdentification("Jose", [call("THEM", t)], [THEM]), null);
});
