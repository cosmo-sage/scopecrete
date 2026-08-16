"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { supabase } from "@/lib/supabase";

const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], display: "swap" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const C = {
  slab: "#E4E7EA", ink: "#12161A", ink2: "#5D6873", ink3: "#8C959E",
  chalk: "#1B5FD9", card: "#FFFFFF", hair: "#DCE0E5", red: "#C0341D",
};

const disp = `${barlowCondensed.style.fontFamily}, system-ui, sans-serif`;
const body = `${ibmPlexSans.style.fontFamily}, system-ui, sans-serif`;
const mono = `${ibmPlexMono.style.fontFamily}, ui-monospace, monospace`;

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError("Couldn't set a new password. The reset link may have expired — request a new one.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: C.slab, color: C.ink, fontFamily: body,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
      <form onSubmit={handleSubmit} style={{
        background: C.card, border: `1px solid ${C.hair}`, borderTop: `3px solid ${C.ink}`,
        padding: "22px 22px 24px", maxWidth: 380, width: "100%",
        boxShadow: "0 1px 0 rgba(255,255,255,.8), 0 14px 34px -22px rgba(18,22,26,.5)" }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase",
          color: C.ink3, marginBottom: 6 }}>
          Set new password
        </div>
        <h1 style={{ fontFamily: disp, fontSize: 26, fontWeight: 700, margin: "0 0 18px" }}>
          SCOPE<span style={{ color: "#F2610C" }}>CRETE</span>
        </h1>

        <label style={{ display: "block", fontSize: 12, color: C.ink2, marginBottom: 5 }}>New password</label>
        <input type="password" value={password} autoComplete="new-password" autoFocus
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`, padding: "0 12px",
            fontSize: 16, fontFamily: body, background: "#FCFCFD", marginBottom: 14 }} />

        <label style={{ display: "block", fontSize: 12, color: C.ink2, marginBottom: 5 }}>Confirm password</label>
        <input type="password" value={confirm} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`, padding: "0 12px",
            fontSize: 16, fontFamily: body, background: "#FCFCFD", marginBottom: 16 }} />

        {error && (
          <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 12, lineHeight: 1.4 }}>{error}</div>
        )}

        <button type="submit" disabled={busy} style={{
          width: "100%", height: 46, background: busy ? C.ink2 : C.ink, color: "#fff", border: "none",
          fontFamily: disp, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase",
          cursor: busy ? "default" : "pointer" }}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
