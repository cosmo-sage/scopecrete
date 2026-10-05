import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxLabel } from "../src/lib/sandbox.ts";

test("the feedback preview says so; production and local say nothing", () => {
  assert.equal(sandboxLabel({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/feedback" }), "Feedback sandbox");
  assert.equal(sandboxLabel({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/x" }), "Preview · claude/x");
  assert.equal(sandboxLabel({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "master" }), null);
  assert.equal(sandboxLabel({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "claude/feedback" }), null);
  assert.equal(sandboxLabel({}), null);
});
