import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, funnelState, ago } from "../src/lib/invite-funnel.ts";

const NOW = Date.parse("2026-10-22T20:00:00Z");
const h = (n) => new Date(NOW - n * 3600_000).toISOString();
const row = (o) => ({ invite_id: "i", email: "j@x.com", role: "owner", sent_at: h(30), expires_at: h(-300),
  accepted_at: null, revoked_at: null, opens: 0, first_opened: null, last_opened: null, steps: [],
  last_step: null, last_at: null, last_device: null, ...o });

test("names the device in a few words", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1"), "iPhone · Chrome");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"), "Android · Chrome");
  assert.equal(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"), "Mac · Chrome");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"), "Windows · Edge");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]"), "iPhone · Facebook");
  assert.equal(deviceLabel(""), null);
  assert.equal(deviceLabel(null), null);
});

test("says where an invite stands", () => {
  assert.match(funnelState(row({}), NOW).line, /^Not opened yet · sent 30h ago/);
  assert.equal(funnelState(row({ opens: 3, last_opened: h(2), steps: ["opened"] }), NOW).line, "Opened 3 times, last 2h ago — hasn't signed in");
  assert.match(funnelState(row({ opens: 1, last_opened: h(2), steps: ["opened", "signed_in"] }), NOW).line, /^Opened once.*hasn't tapped Join$/);
  assert.match(funnelState(row({ opens: 2, last_opened: h(1), steps: ["opened", "wrong_email"] }), NOW).line, /different email/);
  assert.equal(funnelState(row({ opens: 2, last_opened: h(1), steps: ["opened", "wrong_email", "signed_in"] }), NOW).tone, "warn");
  assert.match(funnelState(row({ accepted_at: h(1), steps: ["opened", "joined"] }), NOW).line, /no password set yet/);
  assert.match(funnelState(row({ accepted_at: h(1), steps: ["joined", "password_set"] }), NOW).line, /hasn't opened it from the home screen/);
  assert.match(funnelState(row({ accepted_at: h(1), steps: ["joined", "installed"] }), NOW).line, /home screen$/);
  assert.match(funnelState(row({ opens: 1, last_opened: h(400), expires_at: h(1) }), NOW).line, /expired/);
  assert.equal(funnelState(row({ revoked_at: h(1) }), NOW).tone, "quiet");
});

test("ago", () => {
  assert.equal(ago(h(0), NOW), "just now");
  assert.equal(ago(h(0.5), NOW), "30 min ago");
  assert.equal(ago(h(48), NOW), "2 days ago");
  assert.equal(ago(null, NOW), "");
});
