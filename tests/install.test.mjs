// Where ScopeCrete offers to install as an app (src/lib/install.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installable, APP_MANIFEST } from "../src/lib/install.ts";

const prod = { VERCEL_ENV: "production" };
test("only an org's own address on the production build", () => {
  assert.equal(installable("sbuild.app.scopecrete.ai", prod), true);
  assert.equal(installable("sbuild.app.scopecrete.ai", { VERCEL_ENV: "preview" }), false);
  assert.equal(installable("sbuild.app.scopecrete.ai", {}), false);
  assert.equal(installable("scopecrete-git-claude-feedback-coy2.vercel.app", { VERCEL_ENV: "preview" }), false);
  assert.equal(installable("scopecrete.vercel.app", prod), false);
  assert.equal(installable("scopecrete.ai", prod), false);
  assert.equal(installable("app.scopecrete.ai", prod), false);
  assert.equal(installable("localhost:3000", {}), false);
  assert.equal(installable(null, prod), false);
});

test("the manifest opens on the dashboard and has both icon sizes", () => {
  assert.equal(APP_MANIFEST.start_url, "/dashboard");
  assert.deepEqual(APP_MANIFEST.icons.map((i) => i.sizes), ["192x192", "512x512"]);
});
