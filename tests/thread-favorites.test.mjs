import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFavorites, isFavorite, toggleFavorite, spaceOf, MAX_FAVORITES } from "../src/lib/v34/spaces.ts";

const A = "0123abcd-0000-4000-8000-123456789abc";
const B = "0123abcd-0000-4000-8000-123456789abd";

test("favorites keep real contact ids once, with a name", () => {
  assert.deepEqual(cleanFavorites([{ id: A, name: " Jeremy " }, { id: A, name: "again" }, { id: "nope", name: "x" }, { id: B }, null]),
    [{ id: A, name: "Jeremy" }, { id: B, name: "Contact" }]);
  assert.deepEqual(cleanFavorites("junk"), []);
});

test("toggling adds to the front and takes off again", () => {
  let f = toggleFavorite([], { id: A, name: "Jeremy" });
  f = toggleFavorite(f, { id: B, name: "Luis" });
  assert.deepEqual(f.map((x) => x.id), [B, A]);
  assert.equal(isFavorite(f, A), true);
  f = toggleFavorite(f, { id: A, name: "Jeremy" });
  assert.deepEqual(f.map((x) => x.id), [B]);
});

test("a full list is left as it is", () => {
  const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ id: `0123abcd-0000-4000-8000-${String(i).padStart(12, "0")}`, name: "x" }));
  assert.equal(toggleFavorite(full, { id: A, name: "new" }).length, MAX_FAVORITES);
});

test("the New message page opens the Threads Work Space", () => {
  assert.deepEqual(spaceOf("/dashboard/messages/new"), { kind: "threads" });
  assert.deepEqual(spaceOf(`/dashboard/messages/${A}`), { kind: "home" });
});
