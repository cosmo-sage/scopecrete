"use client";

/**
 * Joining an org from an invite link (migration 062; Coy, 2026-10-01).
 *
 * Signed out: sign in with Google, or have a sign-in link emailed — either way
 * it must be the email the invite was made for. Signed in: who invited you, to
 * which org, as what — and Join. Only then is the membership written
 * (sc_accept_invite). The token is kept in this browser while you sign in, so
 * the dashboard brings you back here if the sign-in lands there instead.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import "@/styles/v34-shell.css";

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
  const back = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`;

  useEffect(() => {
    let off = false;
    try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* private mode */ }
    fetch(`/api/invites/${token}`).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (off) return;
      if (r.status === 401) { setSignedOut(true); return; }
      if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
      setPeek(b.invite as Peek); setYou(b.you ?? null);
    }).catch(() => { if (!off) setErr("Couldn't reach ScopeCrete."); });
    return () => { off = true; };
  }, [token]);

  async function google() {
    setErr(null);
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } });
    if (error) setErr(error.message); else if (data.url) window.location.href = data.url;
  }
  async function emailLink() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back() } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  async function join() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/invites/${token}`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* private mode */ }
    setJoined(true);
  }
  async function signOut() { await supabase.auth.signOut(); window.location.reload(); }

  const btn = (primary: boolean): React.CSSProperties => ({ height: 44, width: "100%", borderRadius: 4, fontFamily: disp, fontSize: F.md, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer" });
  const roleWord = (r: string | null) => (r === "owner" ? "an owner" : r === "field" ? "field crew" : "a member");

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: T.slab, color: T.ink }}>
      <div className="w-full rounded p-5 flex flex-col gap-3" style={{ maxWidth: 420, background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ ...eyebrow, color: T.ink3 }}>scopecrete.ai</div>
        {joined ? (
          <>
            <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>You&apos;re in.</h1>
            <p style={{ fontSize: F.sm, color: T.ink2, margin: 0 }}>Welcome to {peek?.org_name ?? "the team"}.</p>
            <a href="/dashboard" style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center" }}>Open the dashboard</a>
            <a href="/auth/reset-password" style={{ fontSize: F.xs, color: T.chalk, textAlign: "center" }}>Set a password too (optional) — then you can sign in without a link</a>
          </>
        ) : signedOut ? (
          <>
            <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>You&apos;ve been invited</h1>
            <p style={{ fontSize: F.sm, color: T.ink2, margin: 0, lineHeight: 1.5 }}>
              Sign in with the email address the invite was sent to. If you don&apos;t have an account yet, this makes one.
            </p>
            <button onClick={() => void google()} style={btn(false)}>Continue with Google</button>
            {sent ? (
              <div style={{ fontSize: F.sm, color: T.green }}>Check {email} for a sign-in link. It brings you back here.</div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void emailLink(); }} className="flex flex-col gap-2">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" aria-label="Your email"
                  style={{ height: 40, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: F.md, background: T.card, color: T.ink }} />
                <button type="submit" disabled={busy || !email.trim()} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
              </form>
            )}
          </>
        ) : !peek ? (
          <div style={{ fontSize: F.sm, color: T.ink3 }}>{err ?? "Checking your invite…"}</div>
        ) : peek.state !== "open" ? (
          <>
            <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>
              {peek.state === "accepted" ? "Already used" : peek.state === "revoked" ? "Withdrawn" : peek.state === "expired" ? "Expired" : "Not a valid invite"}
            </h1>
            <p style={{ fontSize: F.sm, color: T.ink2, margin: 0 }}>
              {peek.state === "accepted" ? "This invite has been accepted. " : ""}Ask whoever sent it for a new link.
            </p>
            <a href="/dashboard" style={{ fontSize: F.sm, color: T.chalk }}>Go to the dashboard</a>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0, lineHeight: 1.1 }}>Join {peek.org_name}</h1>
            <p style={{ fontSize: F.sm, color: T.ink2, margin: 0, lineHeight: 1.5 }}>
              {peek.invited_by_name ?? "An owner"} invited {peek.email} as {roleWord(peek.role)}.
            </p>
            {peek.email_matches ? (
              <button onClick={() => void join()} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{busy ? "Joining…" : `Join ${peek.org_name}`}</button>
            ) : (
              <>
                <div className="rounded px-3 py-2" style={{ background: T.hivizDim, fontSize: F.sm, color: T.ink }}>
                  You&apos;re signed in as {you ?? "another account"}. This invite is for {peek.email}.
                </div>
                <button onClick={() => void signOut()} style={btn(false)}>Sign out and use {peek.email}</button>
              </>
            )}
          </>
        )}
        {err && (peek || signedOut) && <div role="alert" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
      </div>
    </main>
  );
}
