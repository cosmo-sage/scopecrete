import { test } from "node:test";
import assert from "node:assert/strict";
import { pinLink, readPin, pinFromQuery, pinNote, pinParts, pinText, sameSpot, pinZoom, pinWhere } from "../src/lib/plan-pins.ts";

const job = "11111111-2222-4333-8444-555555555555";
const sheet = "66666666-7777-4888-8999-000000000000";
const shape = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const tag = "@[Jeremy Wright](u:12345678-1234-4234-8234-123456789abc)";

test("a link carries the spot, its zoom and its shape, and reads back", () => {
  const link = pinLink({ job, sheet, x: 412.53, y: 388, z: 3, m: shape });
  assert.equal(link, `/dashboard/scope/${job}/plans?step=takeoff&sheet=${sheet}&pin=412.5,388&z=3&m=${shape}`);
  assert.deepEqual(readPin(`see https://sbuild.app.scopecrete.ai${link} please`), { job, sheet, x: 412.5, y: 388, z: 3, m: shape });
  assert.deepEqual(readPin(pinLink({ job, sheet, x: 1, y: 2, z: 0, m: null })), { job, sheet, x: 1, y: 2, z: 3, m: null });
  assert.equal(readPin("no link here"), null);
});

test("zoom stays in the takeoff's range", () => {
  assert.equal(pinZoom(20), 8);
  assert.equal(pinZoom(0.1), 0.5);
  assert.equal(pinZoom(NaN), 3);
});

test("the page's own ?pin= is read, a bad one is not", () => {
  assert.deepEqual(pinFromQuery("10.5,20", "2", shape), { x: 10.5, y: 20, z: 2, m: shape });
  assert.deepEqual(pinFromQuery("10,20", null, "nope"), { x: 10, y: 20, z: 3, m: null });
  assert.equal(pinFromQuery("10;20", null, null), null);
  assert.equal(pinFromQuery(null, null, null), null);
});

test("a pin note is the place, the tag, the words and the link — and splits back", () => {
  const link = pinLink({ job, sheet, x: 5, y: 6, z: 3, m: null });
  const body = pinNote(pinWhere("AERIAL 2", "Curbs 2"), ' Is this curb 6" or 8"? ', [tag], link);
  assert.equal(body, `📍 AERIAL 2 · Curbs 2: ${tag} Is this curb 6" or 8"?\nOpen on the sheet: ${link}`);
  const parts = pinParts(body);
  assert.equal(parts.where, "AERIAL 2 · Curbs 2");
  assert.equal(parts.words, `${tag} Is this curb 6" or 8"?`);
  assert.equal(parts.spot.sheet, sheet);
  assert.equal(pinParts("just a note"), null);
});

test("the text names them and carries the full link", () => {
  const link = pinLink({ job, sheet, x: 5, y: 6, z: 3, m: null });
  assert.equal(pinText("Jeremy", "AERIAL 2", "Is this 6 or 8?", "https://sbuild.app.scopecrete.ai/", link),
    `Hi Jeremy, a question on AERIAL 2: Is this 6 or 8?\nhttps://sbuild.app.scopecrete.ai${link}`);
});

test("a reply sits on the same spot", () => {
  assert.equal(sameSpot({ x: 10, y: 10 }, { x: 11.5, y: 9 }), true);
  assert.equal(sameSpot({ x: 10, y: 10 }, { x: 14, y: 10 }), false);
});
