"use client";

/**
 * Joining an org from an invite link (migration 062; Coy, 2026-10-01).
 *
 * Signed out: sign in with Google, or have a sign-in link emailed — either way
 * it must be the email the invite was made for. Signed in: who invited you, to
 * which org, as what — and Join. Only then is the membership written
 * (sc_accept_invite), with the name they type (saved on their account and as
 * their name in the org — Coy, 2026-10-11). Someone who already has a password
 * signs in with it here. After Join, an account with no password sets one
 * before going on (Coy, 2026-10-15: "prompt him to set up a password"; 112's
 * sc_my_password_set), and Open goes to the company's own address, where the
 * dashboard offers the home-screen install. The token is kept in this browser while you sign in, so
 * the dashboard brings you back here if the sign-in lands there instead.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthShell, { GoogleG, OrRule, Spinner, cta, ghost, h1, input, label, lede } from "@/components/site/auth-shell";
import { siteFonts } from "@/components/site/fonts";
import { disp } from "@/components/site/marks";
import { afterJoinUrl } from "@/lib/hosts";

type Peek = { org_name: string | null; role: string | null; email: string | null; invited_by_name: string | null; state: string; email_matches: boolean };
const PENDING_INVITE_KEY = "sc:pending-invite";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  // After Join: where to open it, and whether the account still needs a password
  // (false = none; null = couldn't tell, before 112 — asked with a skip).
  const [openAt, setOpenAt] = useState("/dashboard?welcome=1");
  const [needPw, setNeedPw] = useState<boolean | null>(false);
  const back = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`;

  useEffect(() => {
    let off = false;
    // Remembered only for the person it is for (signed out, or signed in with its email), so the
    // dashboard can bring them back here after signing in. An owner opening someone else's invite
    // to check it must not keep it — it sent Coy to Jeremy's invite later (2026-10-10).
    const keep = (on: boolean) => { try { if (on) localStorage.setItem(PENDING_INVITE_KEY, token); else if (localStorage.getItem(PENDING_INVITE_KEY) === token) localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* private mode */ } };
    fetch(`/api/invites/${token}`).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (off) return;
      if (r.status === 401) { keep(true); setSignedOut(true); return; }
      keep(r.ok && !!b?.invite?.email_matches);
      if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
      setPeek(b.invite as Peek); setYou(b.you ?? null); setName(b.your_name ?? "");
    }).catch(() => { if (!off) setErr("Couldn't reach ScopeCrete."); });
    return () => { off = true; };
  }, [token]);

  async function google() {
    setErr(null);
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } });
    if (error) setErr(error.message); else if (data.url) window.location.href = data.url;
  }
  async function passwordSignIn() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr(/invalid/i.test(error.message) ? "That email and password don't match. Use a sign-in link instead, or try again." : error.message); return; }
    setPassword("");
    window.location.reload();
  }
  async function setNewPassword() {
    if (password.length < 8) { setErr("At least 8 characters."); return; }
    if (password !== password2) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPassword(""); setPassword2(""); setNeedPw(false);
  }
  async function emailLink() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back() } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  async function join() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/invites/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* private mode */ }
    setOpenAt(afterJoinUrl(window.location.host, b?.slug ?? null));
    setNeedPw(b?.password_set === true ? false : b?.password_set === false ? true : null);
    setJoined(true);
  }
  async function signOut() { await supabase.auth.signOut(); window.location.reload(); }

  const roleWord = (r: string | null) => (r === "owner" ? "an owner" : r === "field" ? "field crew" : "a member");
  const roleTag = (r: string | null) => (r === "owner" ? "Owner" : r === "field" ? "Field crew" : "Member");
  const asking = joined && needPw !== false;
  const step = joined ? (asking ? 2 : 3) : peek && !signedOut ? 1 : 0;
  const initials = (peek?.org_name ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const pad: React.CSSProperties = { padding: "26px 28px 30px", display: "flex", flexDirection: "column", gap: 18 };

  return (
    <div className={siteFonts}>
      <AuthShell
        above={
          <div style={{ width: "100%", maxWidth: 440, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
            {["Sign in", "Join", "Password", "Done"].map((l, i) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ height: 3, background: i <= step ? "#F2610C" : "#C8CDD3" }} />
                <span style={{ ...label, color: i <= step ? "#12161A" : "#8A95A1" }}>0{i + 1} · {l}</span>
              </div>
            ))}
          </div>
        }
        footer={<>Wrong person? Let whoever invited you know, or write <a href="mailto:admin@scopecrete.ai" style={{ color: "#3A4249" }}>admin@scopecrete.ai</a></>}
      >
        {peek && (
          <div style={{ padding: "18px 28px", borderBottom: "1px solid #DCE0E5", background: "#F4F5F7", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 44, height: 44, flex: "none", background: "#3A4249", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontWeight: 700, fontSize: 20, letterSpacing: ".04em" }}>{initials || "·"}</span>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, color: "#5A646F" }}>{peek.invited_by_name ?? "An owner"} invited you to</span>
              <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 22, lineHeight: 1.05, textTransform: "uppercase" }}>{peek.org_name ?? "their team"}</span>
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ flex: "none", padding: "4px 8px", border: "1px solid #B9C0C8", ...label }}>{roleTag(peek.role)}</span>
          </div>
        )}
        {asking ? (
          <div style={pad}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={h1}>Set your password</h1>
              <p style={lede}>You&apos;re in {peek?.org_name ?? "the team"}. Pick a password so you can sign in with your email and password — on this phone and in the app on your home screen.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void setNewPassword(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <input type="email" value={peek?.email ?? ""} autoComplete="username" readOnly hidden />
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={label}>Password</span>
                <input type="password" required minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setErr(null); }} placeholder="At least 8 characters" autoComplete="new-password" autoFocus style={input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={label}>Again</span>
                <input type="password" required minLength={8} value={password2} onChange={(e) => { setPassword2(e.target.value); setErr(null); }} autoComplete="new-password" style={input} />
              </label>
              <button type="submit" className="sc-cta" disabled={busy || password.length < 8} style={{ ...cta(busy), opacity: password.length < 8 ? 0.45 : 1 }}>{busy ? <><Spinner /> Saving</> : "Save password"}</button>
            </form>
            {needPw === null && <button className="sc-ghost" onClick={() => setNeedPw(false)} style={{ ...ghost, fontSize: 14 }}>I already have a password — skip</button>}
          </div>
        ) : joined ? (
          <div style={pad}>
            <span style={{ width: 52, height: 52, borderRadius: "50%", background: "#1FA971", boxShadow: "0 0 0 6px rgba(31,169,113,.16)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontSize: 26, fontWeight: 600 }}>✓</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={h1}>You&apos;re in</h1>
              <p style={lede}>Welcome to {peek?.org_name ?? "the team"}.</p>
            </div>
            <a href={openAt} className="sc-cta" style={cta()}>Open {peek?.org_name ?? "ScopeCrete"}</a>
            <p style={{ ...lede, fontSize: 14 }}>Next time, sign in with {peek?.email ?? "your email"} and your password.</p>
          </div>
        ) : signedOut ? (
          <div style={pad}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={h1}>You&apos;ve been invited</h1>
              <p style={lede}>Sign in with the email address the invite was sent to. If you don&apos;t have an account yet, this makes one.</p>
            </div>
            <button className="sc-ghost" onClick={() => void google()} style={ghost}><GoogleG /><span>Continue with Google</span></button>
            <OrRule>or by email</OrRule>
            {sent ? (
              <div role="status" style={{ fontSize: 15, lineHeight: 1.45, color: "#0F8A4F" }}>Check {email} for a sign-in link. It brings you back here.</div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void (password ? passwordSignIn() : emailLink()); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={label}>Your email</span>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" style={input} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={label}>Password, if you already have one</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={input} />
                </label>
                <button type="submit" className="sc-cta" disabled={busy || !email.trim() || !password} style={{ ...cta(busy), opacity: !email.trim() || !password ? 0.45 : 1 }}>{busy && password ? <><Spinner /> Signing in</> : "Sign in"}</button>
                <button type="button" className="sc-ghost" onClick={() => void emailLink()} disabled={busy || !email.trim()} style={{ ...ghost, opacity: !email.trim() ? 0.45 : 1 }}>{busy && !password ? <><Spinner /> Sending</> : "No password yet? Email me a sign-in link"}</button>
              </form>
            )}
          </div>
        ) : !peek ? (
          <div style={{ ...pad, fontSize: 15, color: "#5A646F" }}>{err ?? "Checking your invite…"}</div>
        ) : peek.state !== "open" ? (
          <div style={pad}>
            <h1 style={h1}>
              {peek.state === "accepted" ? "Already used" : peek.state === "revoked" ? "Withdrawn" : peek.state === "expired" ? "Expired" : "Not a valid invite"}
            </h1>
            <p style={lede}>{peek.state === "accepted" ? "This invite has been accepted. " : ""}Ask whoever sent it for a new link.</p>
            <a href="/dashboard" style={{ fontSize: 15 }}>Go to the dashboard</a>
          </div>
        ) : (
          <div style={pad}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={h1}>Join {peek.org_name}</h1>
              <p style={lede}>Your invite is for <strong style={{ color: "#12161A" }}>{peek.email}</strong>, as {roleWord(peek.role)}.</p>
            </div>
            {peek.email_matches ? (
              <form onSubmit={(e) => { e.preventDefault(); void join(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={label}>Your name</span>
                  <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" style={input} />
                </label>
                <button type="submit" className="sc-cta" disabled={busy || !name.trim()} style={{ ...cta(busy), opacity: !name.trim() ? 0.45 : 1 }}>{busy ? <><Spinner /> Joining</> : `Join ${peek.org_name}`}</button>
              </form>
            ) : (
              <>
                <div style={{ background: "#FFF1E7", border: "1px solid #F2C9AE", padding: "10px 12px", fontSize: 14, lineHeight: 1.45 }}>
                  You&apos;re signed in as {you ?? "another account"}. This invite is for {peek.email}.
                </div>
                <button className="sc-ghost" onClick={() => void signOut()} style={ghost}>Sign out and use {peek.email}</button>
              </>
            )}
          </div>
        )}
        {err && (peek || signedOut) && <div role="alert" style={{ padding: "0 28px 24px", fontSize: 14, color: "#C0341D" }}>{err}</div>}
      </AuthShell>
    </div>
  );
}
