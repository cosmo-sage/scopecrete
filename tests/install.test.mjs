// Where ScopeCrete offers to install as an app (src/lib/install.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installable, installHint, APP_MANIFEST } from "../src/lib/install.ts";

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

test("which home-screen install to offer", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
  const desk = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";
  const no = { standalone: false, canPrompt: false };
  assert.equal(installHint(iphone, no), "ios");
  assert.equal(installHint(ipad, { ...no, touchMac: true }), "ios", "an iPad says it is a Mac");
  assert.equal(installHint(ipad, no), null, "a real Mac");
  assert.equal(installHint(android, no), "android");
  assert.equal(installHint(android, { ...no, canPrompt: true }), "prompt");
  assert.equal(installHint(desk, { ...no, canPrompt: true }), "prompt");
  assert.equal(installHint(desk, no), null);
  assert.equal(installHint(iphone, { standalone: true, canPrompt: false }), null, "already the app");
});
