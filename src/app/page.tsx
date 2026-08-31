"use client";

/* ============================================================
   ScopeCrete — sign-in

   Five things and nothing else: logo, email, password with a
   reveal toggle, sign in, forgot password. The holding-page
   copy ("STILL CURING", the tagline, the beta chip, the footer
   contact link) is gone — this is a door, not a billboard.

   The slab texture stays. It is the brand's ground, not a
   panel of content, and removing it would leave a white box
   rather than a simpler page.
   ============================================================ */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { supabase } from "@/lib/supabase";

const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const C = {
  slab:    "#E4E7EA",   // wet-cured surface
  slabLo:  "#D3D8DD",   // shaded panel
  joint:   "#B9C0C7",   // saw-cut line
  ink:     "#12161A",
  ink2:    "#5D6873",
  ink3:    "#8C959E",
  hiviz:   "#F2610C",   // safety orange, used once
  pulse:   "#1FA971",   // the core
  chalk:   "#1B5FD9",
  card:    "#FFFFFF",
  hair:    "#DCE0E5",
  red:     "#C0341D",
};

const disp = `${barlowCondensed.style.fontFamily}, 'Oswald', system-ui, sans-serif`;
const body = `${ibmPlexSans.style.fontFamily}, system-ui, sans-serif`;

const Emblem = ({ size = 26, stroke = 2.6 }: { size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
    {/* diamond → square → circle, spaced */}
    <polygon points="50,3 97,50 50,97 3,50" fill="none" stroke={C.hiviz} strokeWidth={stroke} strokeLinejoin="miter" />
    <rect x="29" y="29" width="42" height="42" fill="none" stroke={C.hiviz} strokeWidth={stroke} />
    <circle className="sc-core" cx="50" cy="50" r="12.5" fill={C.pulse} />
  </svg>
);

/** Eye / eye-with-slash. Purely decorative — the button carries the label. */
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden="true" focusable="false">
    <path d="M1.6 9.5S4.6 4.4 9.5 4.4s7.9 5.1 7.9 5.1-3 5.1-7.9 5.1S1.6 9.5 1.6 9.5Z"
          fill="none" stroke={C.ink2} strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="9.5" cy="9.5" r="2.4" fill="none" stroke={C.ink2} strokeWidth="1.5" />
    {off && <path d="M3 3 L16 16" stroke={C.ink2} strokeWidth="1.5" strokeLinecap="round" />}
  </svg>
);

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(describeAuthError(signInError));
      return;
    }
    router.push("/dashboard/messages");
  }

  async function handleForgotPassword() {
    setError("");
    setNotice("");
    if (!email) { setError("Enter your email above first."); return; }
    setBusy(true);
    // type=recovery is carried on the redirect ourselves rather than
    // relying on Supabase to append it. /auth/callback routes on that
    // parameter to decide between the dashboard and the set-a-new-
    // password page; without it a recovery link signs the user in and
    // never asks for the new password, which looks like the link did
    // nothing.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setBusy(false);

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

  return (
    <div style={{ minHeight: "100vh", background: C.slab, color: C.ink, fontFamily: body, position: "relative", overflow: "hidden" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input:focus-visible, button:focus-visible, a:focus-visible {
          outline: 2px solid ${C.chalk}; outline-offset: 2px;
        }
        .sc-in { animation: scRise .7s cubic-bezier(.2,.7,.3,1) both; }
        .sc-d1 { animation-delay: .10s }
        @keyframes scRise { from { opacity: 0; transform: translateY(9px) } to { opacity: 1; transform: none } }
        .sc-core { animation: scCore 4s ease-in-out infinite; transform-origin: 50% 50%; }
        @keyframes scCore {
          0%, 100% { opacity: .62; transform: scale(.9) }
          50%      { opacity: 1;   transform: scale(1) }
        }
        @media (prefers-reduced-motion: reduce) {
          .sc-in { animation: none !important; opacity: 1 !important; transform: none !important; }
          .sc-core { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* --- slab surface: aggregate speckle + fine noise --- */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="grit">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={3} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, filter: "url(#grit)", opacity: 0.085, pointerEvents: "none" }} />
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: .5,
        backgroundImage: `radial-gradient(circle at 20% 30%, ${C.slabLo} 0 1.1px, transparent 1.2px),
                          radial-gradient(circle at 70% 65%, ${C.slabLo} 0 1.4px, transparent 1.5px),
                          radial-gradient(circle at 45% 85%, ${C.slabLo} 0 .9px, transparent 1px)`,
        backgroundSize: "37px 41px, 53px 59px, 29px 31px",
      }} />

      {/* --- content: logo, then the card. Nothing else. --- */}
      <div style={{
        position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 22, padding: "32px 22px",
      }}>
        <div className="sc-in" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Emblem size={26} />
          <span style={{ fontFamily: disp, fontSize: 25, fontWeight: 700, letterSpacing: ".015em", lineHeight: 1 }}>
            SCOPE<span style={{ color: C.hiviz }}>CRETE</span><span style={{ color: C.ink3, fontWeight: 400 }}>.ai</span>
          </span>
        </div>

        <form onSubmit={handleSignIn} className="sc-in sc-d1" style={{
          background: C.card, border: `1px solid ${C.hair}`, borderTop: `3px solid ${C.ink}`,
          padding: "20px 20px 22px", maxWidth: 380, width: "100%",
          boxShadow: "0 1px 0 rgba(255,255,255,.8), 0 14px 34px -22px rgba(18,22,26,.5)" }}>

          <label htmlFor="sc-email" style={{ display: "block", fontSize: 12, color: C.ink2, marginBottom: 5 }}>
            Email
          </label>
          {/* autocomplete="username" — the token password managers and iOS
              Keychain expect on a sign-in form, paired with current-password
              below. Both are load-bearing for autofill. */}
          <input id="sc-email" type="email" value={email}
            autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`, padding: "0 12px",
              fontSize: 16, fontFamily: body, background: "#FCFCFD", marginBottom: 14 }} />

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
            <label htmlFor="sc-password" style={{ fontSize: 12, color: C.ink2 }}>Password</label>
            <button type="button" onClick={handleForgotPassword} disabled={busy}
              style={{ fontSize: 12, color: C.chalk, background: "none", border: "none", padding: "6px 0",
                cursor: busy ? "default" : "pointer", textDecoration: "underline" }}>
              Forgot password?
            </button>
          </div>

          <div style={{ position: "relative", marginBottom: 16 }}>
            <input id="sc-password" ref={passwordRef}
              type={showPassword ? "text" : "password"} value={password}
              autoComplete="current-password" autoCapitalize="none" spellCheck={false}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`,
                padding: "0 48px 0 12px", fontSize: 16, fontFamily: body, background: "#FCFCFD" }} />
            <button
              type="button"
              onClick={toggleReveal}
              onMouseDown={(e) => e.preventDefault()}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="sc-password"
              style={{
                position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)",
                // 44×44 minimum: this is used one-handed, on a phone, in a truck.
                width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", padding: 0, cursor: "pointer",
              }}>
              <EyeIcon off={showPassword} />
            </button>
          </div>

          {error && (
            <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 12, lineHeight: 1.4 }}>{error}</div>
          )}
          {notice && (
            <div role="status" style={{ fontSize: 13, color: C.pulse, marginBottom: 12, lineHeight: 1.4 }}>{notice}</div>
          )}

          <button type="submit" disabled={busy} style={{
            width: "100%", height: 46, background: busy ? C.ink2 : C.ink, color: "#fff", border: "none",
            fontFamily: disp, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase",
            cursor: busy ? "default" : "pointer" }}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
