import { test } from "node:test";
import assert from "node:assert/strict";
import { findSelfIdentification } from "../supabase/functions/enrich-contacts/rules.ts";

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

// Coy, 2026-10-02: a caller answered "Hello?", heard as "Charlie.", then said
// "My name is Jonette, j o h n e t t e, Wilson." The reader proposed Charlie.
// (Same shape, made-up name.)
const SPELLED_CALL = `${THEM}: Charlie.\n${US}: Hey.\n${US}: This is Corey.\n${THEM}: I wanted to see about getting an estimate on a driveway repair.\n${US}: And what was your name, ma'am?\n${THEM}: My name is Ranette, r a y n e t t e, Holloway.\n${US}: Okay.`;

test("a spelled-out name is the name, surname and all", async () => {
  const { introducedName, withSpelledNames } = await import("../supabase/functions/enrich-contacts/rules.ts");
  assert.equal(withSpelledNames("My name is Ranette, r a y n e t t e, Holloway."), "My name is Raynette Holloway.");
  assert.equal(introducedName([call("THEM", SPELLED_CALL)], [THEM]), "Raynette Holloway");
  const hit = findSelfIdentification("Raynette Holloway", [call("THEM", SPELLED_CALL, "k")], [THEM]);
  assert.ok(hit);
  assert.equal(hit.quote, "My name is Ranette, r a y n e t t e, Holloway.");
});

test("a lone misheard word at the top of a call is never the name", async () => {
  const { introducedOver } = await import("../supabase/functions/enrich-contacts/pipeline.ts");
  assert.equal(findSelfIdentification("Charlie", [call("THEM", SPELLED_CALL)], [THEM]), null);
  assert.equal(introducedOver("Charlie", [call("THEM", SPELLED_CALL)], [THEM]), "Raynette Holloway");
});

test("spelling that doesn't belong to the word is left alone", async () => {
  const { withSpelledNames } = await import("../supabase/functions/enrich-contacts/rules.ts");
  assert.equal(withSpelledNames("It's Mike, a b c corner"), "It's Mike, a b c corner");
  assert.equal(withSpelledNames("We poured Tuesday, then left"), "We poured Tuesday, then left");
});

test("our side's 'Corey' is Coy to the model", async () => {
  const { relabelTranscript } = await import("../supabase/functions/enrich-contacts/rules.ts");
  const out = relabelTranscript(`${US}: This is Corey.\n${THEM}: Hi Corey, it's Cory from the plant`, [THEM]);
  assert.equal(out, "US: This is Coy.\nTHEM: Hi Corey, it's Cory from the plant");
});

// Coy, 2026-10-03: the same caller then texted "Hi, this is Johnette." and still
// wasn't named — the call's heard "Jonette" counted as a second introduction.
test("a text and a spelled call that agree are one introduction", async () => {
  const { introducedOver } = await import("../supabase/functions/enrich-contacts/pipeline.ts");
  const turns = [call("THEM", SPELLED_CALL, "c1"), sms("THEM", "Hi, this is Raynette.  Here are the pictures you requested.", "s1")];
  assert.ok(findSelfIdentification("Raynette", turns, [THEM]));
  assert.equal(introducedOver("Raynette", turns, [THEM]), "Raynette Holloway", "the whole name they said");
  assert.equal(introducedOver(null, turns, [THEM]), "Raynette Holloway");
  assert.ok(findSelfIdentification("Raynette Holloway", turns, [THEM]));
});

test("a name we greet them by is a suggestion, never their introduction", async () => {
  const { greetedName } = await import("../supabase/functions/enrich-contacts/rules.ts");
  // John's call (2026-10-05): only our side says his name.
  const john = call("US", `${US}: Hey, mister John.\n${THEM}: How you doing, sir?\n${US}: I'm alright.`);
  assert.deepEqual(greetedName([john], [THEM]), { name: "John", quote: "Hey, mister John." });
  assert.equal(findSelfIdentification("John", [john], [THEM]), null, "never applied on its own");
  assert.equal(greetedName([sms("US", "Hi Sarah, the price is $4,200")], [THEM]).name, "Sarah");
  assert.equal(greetedName([sms("US", "Good morning Mr. Davis")], [THEM]).name, "Davis");
  assert.equal(greetedName([sms("THEM", "Hi John")], [THEM]), null, "their greeting names us, not them");
  assert.equal(greetedName([sms("US", "Hey there, running late")], [THEM]), null);
  assert.equal(greetedName([sms("US", "Hey Coy")], [THEM]), null, "our own names never");
  assert.equal(greetedName([sms("US", "Hi Sarah"), sms("US", "Hi Mike")], [THEM]), null, "two names on one number is a question");
});
