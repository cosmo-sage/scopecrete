"use client";

/* ============================================================
   ScopeCrete — sign-in (app.scopecrete.ai/login, and / on
   previews). The look is the Claude Design package's Login page
   (2026-10-04); what it does is what this page always did:
   email and password, a reveal toggle on the same input, a real
   password-reset email. Added from the design: Continue with
   Google (the invite page's sign-in, through /auth/callback) and
   a Request access tab, which is an email to admin@scopecrete.ai
   — the design's form only pretended to send. Its "Phone" sign-in
   is left out: there is no text-code sign-in behind it (§10:
   texting waits on 10DLC).
   ============================================================ */

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/hosts";
import AuthShell, { GoogleG, OrRule, Spinner, cta, ghost, h1, input, label, lede } from "./auth-shell";
import { disp } from "./marks";

const REQUEST_ACCESS = "mailto:admin@scopecrete.ai?subject=ScopeCrete%20access";

/** Eye / eye-with-slash. Purely decorative — the button carries the label. */
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden="true" focusable="false">
    <path d="M1.6 9.5S4.6 4.4 9.5 4.4s7.9 5.1 7.9 5.1-3 5.1-7.9 5.1S1.6 9.5 1.6 9.5Z"
          fill="none" stroke="#5A646F" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="9.5" cy="9.5" r="2.4" fill="none" stroke="#5A646F" strokeWidth="1.5" />
    {off && <path d="M3 3 L16 16" stroke="#5A646F" strokeWidth="1.5" strokeLinecap="round" />}
  </svg>
);

export default function SignIn({ sandbox }: { sandbox?: string | null }) {
  const [tab, setTab] = useState<"login" | "request">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"" | "password" | "google" | "reset">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  // A wrong password and a rate limit are different problems with
  // different fixes, and collapsing them into one sentence cost an
  // hour: Supabase throttles /auth/v1/token per IP, and the throttled
  // response was being reported as "incorrect password" for a
  // credential that was perfectly valid. Telling the two apart is the
  // whole point of this function.
  //
  // Not revealing whether an account exists still matters, so bad
  // credentials stay deliberately generic. Everything else says what
  // actually happened, because none of it leaks account existence.
  function describeAuthError(err: { message?: string; status?: number; code?: string }): string {
    const status = err.status ?? 0;
    const code = (err.code ?? "").toLowerCase();
    const msg = (err.message ?? "").toLowerCase();

    if (status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) {
      return "Too many attempts. Supabase is throttling sign-ins from this network — wait a few minutes and try again. Your password is probably fine.";
    }
    if (code.includes("email_not_confirmed") || msg.includes("not confirmed")) {
      return "That account exists but its email address has never been confirmed.";
    }
    if (msg.includes("invalid login credentials") || status === 400) {
      return "Email or password is incorrect.";
    }
    // Anything unrecognised is shown as-is. A message we did not predict
    // is exactly the message worth reading.
    return err.message ? `Sign-in failed: ${err.message}` : "Sign-in failed for an unknown reason.";
  }

  /**
   * Toggle visibility on the SAME input.
   *
   * Swapping in a second input would lose the field for password managers and
   * break autofill, so `type` flips in place. The mousedown default is
   * prevented so the button never steals focus from the field, and the caret
   * is restored afterwards because changing `type` resets selection in some
   * browsers — a toggle that dumps you at position 0 mid-password is worse
   * than no toggle.
   */
  function toggleReveal() {
    const el = passwordRef.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    setShowPassword((v) => !v);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      if (start !== null && end !== null) {
        try { el.setSelectionRange(start, end); } catch { /* type=email etc. reject this */ }
      }
    });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email || !password) { setError("Enter your email and password."); return; }
    setBusy("password");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy("");
    if (signInError) {
      setError(describeAuthError(signInError));
      return;
    }
    // A full page load, not router.push: on app.scopecrete.ai the proxy sends
    // /dashboard on to the org's own address, another origin.
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    window.location.assign(next ?? "/dashboard");
  }

  async function handleForgotPassword() {
    setError("");
    setNotice("");
    if (!email) { setError("Enter your email above first."); return; }
    setBusy("reset");
    // type=recovery is carried on the redirect ourselves rather than
    // relying on Supabase to append it. /auth/callback routes on that
    // parameter to decide between the dashboard and the set-a-new-
    // password page; without it a recovery link signs the user in and
    // never asks for the new password, which looks like the link did
    // nothing.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setBusy("");

    // A rate limit here is worth saying out loud — the built-in SMTP
    // allows only a couple of messages an hour, and silence looks
    // identical to a delivered email that never arrives.
    if (resetError && (resetError.status === 429 || (resetError.message ?? "").toLowerCase().includes("rate"))) {
      setError("Too many reset emails requested. The built-in mail service allows only a few per hour — wait before trying again.");
      return;
    }
    // Any other error is surfaced rather than hidden behind the confirmation.
    // A send that failed for a reason we did not predict must not be reported
    // as "on its way" — that is the failure this whole page exists to avoid.
    if (resetError) {
      setError(`Reset email failed: ${resetError.message}`);
      return;
    }
    // Otherwise always the same confirmation, whether or not the email
    // exists — same reasoning as the generic bad-credentials message.
    //
    // Deliberately hedged on timing: Supabase returns success as soon as it
    // ACCEPTS the send, not when it is delivered, and the built-in sender is
    // capped at a couple an hour. We cannot tell a queued mail from a dropped
    // one, so the copy does not promise arrival.
    setNotice("If that email has an account, a reset link is on its way. The built-in mail service is slow and rate-limited — give it a few minutes before trying again.");
  }

  async function handleGoogle() {
    setError("");
    setNotice("");
    setBusy("google");
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) { setBusy(""); setError(`Google sign-in failed: ${oauthError.message}`); return; }
    if (data.url) window.location.assign(data.url);
  }

  const tabBtn = (on: boolean, left: boolean) => ({
    height: 52, border: 0, borderLeft: left ? "1px solid #DCE0E5" : 0, borderBottom: `3px solid ${on ? "#F2610C" : "transparent"}`,
    background: "transparent", cursor: "pointer", fontFamily: disp, fontWeight: 700, fontSize: 17,
    letterSpacing: ".1em", textTransform: "uppercase" as const, color: on ? "#12161A" : "#8A95A1",
  });

  return (
    <AuthShell sandbox={sandbox}>
      <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #DCE0E5" }}>
        <button role="tab" aria-selected={tab === "login"} onClick={() => setTab("login")} style={tabBtn(tab === "login", false)}>Log in</button>
        <button role="tab" aria-selected={tab === "request"} onClick={() => setTab("request")} style={tabBtn(tab === "request", true)}>Request access</button>
      </div>

      {tab === "login" ? (
        <form onSubmit={handleSignIn} style={{ padding: "28px 28px 30px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={h1}>Welcome back</h1>
            <p style={lede}>Log in to your office. Dusty kept the calls sorted while you were out.</p>
          </div>

          <button type="button" className="sc-ghost" onClick={() => void handleGoogle()} disabled={!!busy} style={ghost}>
            {busy === "google" ? <Spinner dark /> : <GoogleG />}
            <span>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
          </button>

          <OrRule>or</OrRule>

          <label htmlFor="sc-email" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Email</span>
            {/* autocomplete="username" — the token password managers and iOS
                Keychain expect on a sign-in form, paired with current-password
                below. Both are load-bearing for autofill. */}
            <input id="sc-email" type="email" value={email} placeholder="you@yourcompany.com"
              autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
              onChange={(e) => setEmail(e.target.value)} style={input} />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <label htmlFor="sc-password" style={label}>Password</label>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => void handleForgotPassword()} disabled={!!busy}
                style={{ fontSize: 13, color: "#3A4249", background: "none", border: "none", padding: "4px 0",
                  cursor: busy ? "default" : "pointer", textDecoration: "underline" }}>
                {busy === "reset" ? "Sending…" : "Forgot it?"}
              </button>
            </span>
            <div style={{ position: "relative" }}>
              <input id="sc-password" ref={passwordRef}
                type={showPassword ? "text" : "password"} value={password}
                autoComplete="current-password" autoCapitalize="none" spellCheck={false}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...input, paddingRight: 48 }} />
              <button
                type="button"
                onClick={toggleReveal}
                onMouseDown={(e) => e.preventDefault()}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="sc-password"
                style={{
                  position: "absolute", top: "50%", right: 2, transform: "translateY(-50%)",
                  // 44×44 minimum: this is used one-handed, on a phone, in a truck.
                  width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                }}>
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </div>

          {error && <div role="alert" style={{ fontSize: 14, color: "#C0341D", lineHeight: 1.4 }}>{error}</div>}
          {notice && <div role="status" style={{ fontSize: 14, color: "#0F8A4F", lineHeight: 1.4 }}>{notice}</div>}

          <button type="submit" className="sc-cta" disabled={!!busy} style={cta(busy === "password")}>
            {busy === "password" ? <><Spinner /> Opening your office</> : "Log in"}
          </button>

          <p style={{ margin: 0, fontSize: 14, color: "#5A646F", textAlign: "center" }}>
            New to ScopeCrete?{" "}
            <button type="button" onClick={() => setTab("request")} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "#12161A", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Request access</button>
          </p>
        </form>
      ) : (
        <div style={{ padding: "28px 28px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={h1}>Get on the list</h1>
            <p style={lede}>We’re opening ScopeCrete to a few concrete crews at a time. Email us who you are, your company and your crew size, and we’ll reach out.</p>
          </div>
          <a href={REQUEST_ACCESS} className="sc-cta" style={cta()}>Email admin@scopecrete.ai</a>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#5A646F" }}>
            This opens your own email app. Already invited? Use the link in your invite instead.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
