import { test } from "node:test";
import assert from "node:assert/strict";
import { mentioned, nameKeys, searchTerms } from "../src/lib/dusty/mentions.ts";

const people = [
  { id: "1", name: "Jane Example" }, { id: "2", name: "Mark Sample" }, { id: "3", name: "Angelle Concrete Group" },
  { id: "4", name: "Jane Doe" }, { id: "5", name: null }, { id: "6", name: "Baton Rouge Ready Mix" },
];

test("a surname or a distinctive first name finds the person; everyday words don't", () => {
  assert.deepEqual(mentioned("what did Sample say about the pour?", people).map((p) => p.id), ["2"]);
  assert.deepEqual(mentioned("did Angelle send the invoice?", people).map((p) => p.id), ["3"]);
  assert.deepEqual(mentioned("any calls about a concrete driveway in Baton Rouge?", people), []);
  // A shared first name matches both; the whole name wins first.
  assert.deepEqual(mentioned("Jane Example called — or was it the other Jane?", people).map((p) => p.id), ["1", "4"]);
  assert.deepEqual(mentioned("what's new with Jane's job", people).map((p) => p.id).sort(), ["1", "4"]);
});

test("name keys skip short and trade words", () => {
  assert.deepEqual(nameKeys("Angelle Concrete Group LLC"), ["angelle"]);
  assert.deepEqual(nameKeys("Al Jr"), []);
});

test("search terms OR the question's real words and long numbers", () => {
  assert.equal(searchTerms("did anyone text about the rebar on Kevel?"), "anyone or rebar or kevel");
  assert.equal(searchTerms("who called from 2255550142"), "2255550142");
  assert.equal(searchTerms("what is the job"), null);
});
