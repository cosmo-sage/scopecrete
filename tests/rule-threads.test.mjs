import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRule, cleanWords, centralMidnight, windowStart, hasWords, bucketOf, whoMatches, describeRule } from "../src/lib/rule-threads.ts";

const LINE = "11111111-2222-3333-4444-555555555555";

test("a rule keeps only what it may hold", () => {
  const r = sanitizeRule({ channels: ["call", "fax", "call"], lines: [LINE, "nope"], inboxes: ["Intake-Concrete@AgentMail.to", "bad"], window: "today", who: ["vendor", "boss"], direction: "out", words: "bid,(x)", extra: 1 });
  assert.deepEqual(r, { channels: ["call"], lines: [LINE], inboxes: ["intake-concrete@agentmail.to"], window: "today", who: ["vendor"], direction: "out", words: "bid x" });
});

test("no channel is no rule; defaults fill the rest", () => {
  assert.equal(sanitizeRule({ channels: [] }), null);
  assert.equal(sanitizeRule(null), null);
  assert.equal(sanitizeRule([1]), null);
  assert.deepEqual(sanitizeRule({ channels: ["email"] }), { channels: ["email"], lines: [], inboxes: [], window: "all", who: [], direction: "any", words: "" });
});

test("words are safe inside a filter", () => {
  assert.equal(cleanWords("  bid%_ ,request*  "), "bid request");
  assert.equal(cleanWords("o'neil 6-inch"), "o'neil 6-inch");
});

test("today starts at midnight Central, summer and winter", () => {
  assert.equal(centralMidnight(new Date("2026-10-07T03:41:00Z")).toISOString(), "2026-10-06T05:00:00.000Z");
  assert.equal(centralMidnight(new Date("2026-10-07T15:00:00Z")).toISOString(), "2026-10-07T05:00:00.000Z");
  assert.equal(centralMidnight(new Date("2026-01-15T12:00:00Z")).toISOString(), "2026-01-15T06:00:00.000Z");
  assert.equal(windowStart("all", new Date()), null);
  assert.equal(windowStart("7d", new Date("2026-10-08T00:00:00Z")), "2026-10-01T00:00:00.000Z");
});

test("every word must appear somewhere", () => {
  assert.equal(hasWords("bid request", "Can you send a BID", "for the request"), true);
  assert.equal(hasWords("bid request", "Can you send a bid"), false);
  assert.equal(hasWords("", null), true);
});

test("only a filed bucket counts, and spam never shows", () => {
  const c = (o) => ({ contact_type: "vendor", classification_confirmed_at: null, auto_classified_at: null, ...o });
  assert.equal(bucketOf(c({})), "unsorted");
  assert.equal(bucketOf(c({ auto_classified_at: "x" })), "vendor");
  assert.equal(bucketOf(null), null);
  const rule = sanitizeRule({ channels: ["text"], who: ["vendor"] });
  assert.equal(whoMatches(rule, "vendor"), true);
  assert.equal(whoMatches(rule, "customer"), false);
  assert.equal(whoMatches(rule, null), false);
  const any = sanitizeRule({ channels: ["text"] });
  assert.equal(whoMatches(any, null), true);
  assert.equal(whoMatches(any, "spam"), false);
});

test("a rule reads as words", () => {
  assert.equal(describeRule(sanitizeRule({ channels: ["call"], lines: [LINE], window: "today" }), () => "Main"), "Calls · Main · today");
  assert.equal(describeRule(sanitizeRule({ channels: ["text", "email"], who: ["vendor"], direction: "out", words: "bid" })), "Texts and emails out to vendors · “bid”");
  assert.equal(describeRule(sanitizeRule({ channels: ["email"], inboxes: ["intake-concrete@agentmail.to"] })), "Emails · intake-concrete@agentmail.to");
  assert.equal(describeRule(sanitizeRule({ channels: ["call", "text", "email"] })), "Calls, texts and emails");
});
