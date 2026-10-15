// Which door a request came in by (src/lib/hosts.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostKind, orgOrigin, cookieDomain, safeNext, publicOrigin, afterJoinUrl, LOGIN_URL } from "../src/lib/hosts.ts";

test("apex, app, an org's subdomain, and everything else", () => {
  assert.deepEqual(hostKind("scopecrete.ai"), { kind: "apex" });
  assert.deepEqual(hostKind("www.scopecrete.ai"), { kind: "apex" });
  assert.deepEqual(hostKind("app.scopecrete.ai"), { kind: "app" });
  assert.deepEqual(hostKind("APP.scopecrete.ai:443"), { kind: "app" });
  assert.deepEqual(hostKind("sbuild.app.scopecrete.ai"), { kind: "org", slug: "sbuild" });
  assert.deepEqual(hostKind("scopecrete.vercel.app"), { kind: "other" });
  assert.deepEqual(hostKind("scopecrete-git-claude-feedback-coy2.vercel.app"), { kind: "other" });
  assert.deepEqual(hostKind("localhost:3000"), { kind: "other" });
  assert.deepEqual(hostKind("a.b.app.scopecrete.ai"), { kind: "other" }, "one label only");
  assert.deepEqual(hostKind("-x.app.scopecrete.ai"), { kind: "other" });
  assert.deepEqual(hostKind("evilscopecrete.ai"), { kind: "other" });
  assert.deepEqual(hostKind(null), { kind: "other" });
});

test("an org's address only from a slug that is a DNS label", () => {
  assert.equal(orgOrigin("sbuild"), "https://sbuild.app.scopecrete.ai");
  assert.equal(orgOrigin("Sacco Enterprises"), null);
  assert.equal(orgOrigin(""), null);
  assert.equal(orgOrigin(null), null);
});

test("the sign-in cookie is shared under app.scopecrete.ai only", () => {
  assert.equal(cookieDomain("app.scopecrete.ai"), ".app.scopecrete.ai");
  assert.equal(cookieDomain("sbuild.app.scopecrete.ai"), ".app.scopecrete.ai");
  assert.equal(cookieDomain("scopecrete.ai"), undefined);
  assert.equal(cookieDomain("scopecrete.vercel.app"), undefined);
});

test("after sign-in, only a dashboard or invite path is followed", () => {
  assert.equal(safeNext("/dashboard/scope/abc"), "/dashboard/scope/abc");
  assert.equal(safeNext("//evil.com/dashboard"), null);
  assert.equal(safeNext("https://evil.com"), null);
  assert.equal(safeNext("/\\evil.com"), null);
  assert.equal(safeNext("/api/x"), null);
  assert.equal(safeNext(null), null);
  assert.equal(LOGIN_URL, "https://app.scopecrete.ai/login");
});

test("a customer's link points at scopecrete.ai, never an org's dashboard", () => {
  assert.equal(publicOrigin("sbuild.app.scopecrete.ai", "https://sbuild.app.scopecrete.ai"), "https://scopecrete.ai");
  assert.equal(publicOrigin("app.scopecrete.ai", "https://app.scopecrete.ai"), "https://scopecrete.ai");
  assert.equal(publicOrigin("x-coy2.vercel.app", "https://x-coy2.vercel.app"), "https://scopecrete.ai");
  assert.equal(publicOrigin("localhost:3000", "http://localhost:3000"), "http://localhost:3000");
});

test("after joining from an invite: the company's own address on the live site", () => {
  assert.equal(afterJoinUrl("app.scopecrete.ai", "gpaving"), "https://gpaving.app.scopecrete.ai/dashboard?welcome=1");
  assert.equal(afterJoinUrl("sbuild.app.scopecrete.ai", "gpaving"), "https://gpaving.app.scopecrete.ai/dashboard?welcome=1");
  assert.equal(afterJoinUrl("app.scopecrete.ai", null), "/dashboard?welcome=1");
  assert.equal(afterJoinUrl("scopecrete-git-claude-feedback-coy2.vercel.app", "gpaving"), "/dashboard?welcome=1", "a preview stays on itself");
  assert.equal(afterJoinUrl("localhost:3000", "gpaving"), "/dashboard?welcome=1");
});
