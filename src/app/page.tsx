"use client";

/* ============================================================
   ScopeCrete — holding page + sign-in

   The page is a concrete slab. Control joints are the layout
   grid, not decoration — panels are set by the joints, the way
   a real pour is. One screed sweep on load, then it settles.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { supabase } from "@/lib/supabase";

const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });
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
const mono = `${ibmPlexMono.style.fontFamily}, ui-monospace, monospace`;

const Emblem = ({ size = 26, stroke = 2.6 }: { size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
    {/* diamond → square → circle, spaced */}
    <polygon points="50,3 97,50 50,97 3,50" fill="none" stroke={C.hiviz} strokeWidth={stroke} strokeLinejoin="miter" />
    <rect x="29" y="29" width="42" height="42" fill="none" stroke={C.hiviz} strokeWidth={stroke} />
    <circle className="sc-core" cx="50" cy="50" r="12.5" fill={C.pulse} />
  </svg>
);

export default function Holding() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      // Generic on purpose — never reveal whether the email exists.
      // Rate limiting on this endpoint is enforced server-side by
      // Supabase Auth itself (per-IP token bucket on /auth/v1/token),
      // not by this app.
      setError("Email or password is incorrect.");
      return;
    }
    router.push("/dashboard");
  }

  async function handleForgotPassword() {
    setError("");
    setNotice("");
    if (!email) { setError("Enter your email above first."); return; }
    setBusy(true);
    // Always shows the same confirmation, whether or not the email
    // exists — same reasoning as the generic sign-in error.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setBusy(false);
    setNotice("If that email has an account, a reset link is on its way.");
  }

  return (
    <div style={{ minHeight: "100vh", background: C.slab, color: C.ink, fontFamily: body, position: "relative", overflow: "hidden" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input:focus-visible, button:focus-visible, a:focus-visible {
          outline: 2px solid ${C.chalk}; outline-offset: 2px;
        }
        .sc-in { animation: scRise .7s cubic-bezier(.2,.7,.3,1) both; }
        .sc-d1 { animation-delay: .10s } .sc-d2 { animation-delay: .18s }
        .sc-d3 { animation-delay: .26s } .sc-d4 { animation-delay: .34s }
        @keyframes scRise { from { opacity: 0; transform: translateY(9px) } to { opacity: 1; transform: none } }
        .sc-core { animation: scCore 4s ease-in-out infinite; transform-origin: 50% 50%; }
        @keyframes scCore {
          0%, 100% { opacity: .62; transform: scale(.9) }
          50%      { opacity: 1;   transform: scale(1) }
        }
        .screed { animation: scScreed 1.9s cubic-bezier(.35,.1,.25,1) .1s both; }
        @keyframes scScreed { from { transform: translateX(-40%) } to { transform: translateX(180%) } }
        @media (prefers-reduced-motion: reduce) {
          .sc-in, .screed { animation: none !important; opacity: 1 !important; transform: none !important; }
          .sc-core { animation: none !important; opacity: 1 !important; transform: none !important; }
          .screed { display: none }
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

      {/* --- screed sweep on load --- */}
      <div className="screed" aria-hidden="true" style={{
        position: "absolute", top: 0, bottom: 0, width: "34%", pointerEvents: "none",
        background: `linear-gradient(90deg, transparent, rgba(255,255,255,.55) 45%, rgba(255,255,255,.9) 55%, transparent)`,
      }} />

      {/* --- control joints: the layout grid --- */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {([["left", "38%"], ["left", "76%"]] as const).map(([side, v], i) => (
          <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, [side]: v, width: 2,
            background: C.joint, boxShadow: `1px 0 0 rgba(255,255,255,.55)` }} />
        ))}
        {([["top", "17%"], ["top", "62%"]] as const).map(([side, v], i) => (
          <div key={"h" + i} style={{ position: "absolute", left: 0, right: 0, [side]: v, height: 2,
            background: C.joint, boxShadow: `0 1px 0 rgba(255,255,255,.55)` }} />
        ))}
      </div>

      {/* --- content --- */}
      <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column",
        maxWidth: 1040, margin: "0 auto", padding: "0 22px" }}>

        {/* mark */}
        <header className="sc-in" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 26, minHeight: "17vh" }}>
          <Emblem size={26} />
          <span style={{ fontFamily: disp, fontSize: 25, fontWeight: 700, letterSpacing: ".015em", lineHeight: 1 }}>
            SCOPE<span style={{ color: C.hiviz }}>CRETE</span><span style={{ color: C.ink3, fontWeight: 400 }}>.ai</span>
          </span>
        </header>

        {/* statement */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 40 }}>
          <div style={{ display: "grid", gap: 34, gridTemplateColumns: "minmax(0,1fr)" }}>
            <div>
              <div className="sc-in sc-d1" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em",
                textTransform: "uppercase", color: C.ink2, marginBottom: 14 }}>
                Baton Rouge, Louisiana
              </div>

              <h1 className="sc-in sc-d2" style={{ fontFamily: disp, fontWeight: 700, margin: 0,
                fontSize: "clamp(58px, 15vw, 132px)", lineHeight: .84, letterSpacing: "-.015em" }}>
                STILL<br />CURING
              </h1>

              <p className="sc-in sc-d3" style={{ maxWidth: 440, marginTop: 22, marginBottom: 0,
                fontSize: 16, lineHeight: 1.55, color: C.ink2 }}>
                Bid, schedule, and watch your cash from the truck. Built by a concrete
                contractor for concrete contractors — being poured now, open when the
                work holds weight.
              </p>

              <div className="sc-in sc-d3" style={{ display: "flex", gap: 8, alignItems: "center",
                marginTop: 20, fontFamily: mono, fontSize: 11, color: C.ink3, letterSpacing: ".05em" }}>
                <span style={{ width: 7, height: 7, background: C.hiviz, borderRadius: 9 }} />
                Private beta · by invitation
              </div>
            </div>

            {/* sign-in */}
            <form onSubmit={handleSignIn} className="sc-in sc-d4" style={{
              background: C.card, border: `1px solid ${C.hair}`, borderTop: `3px solid ${C.ink}`,
              padding: "20px 20px 22px", maxWidth: 380, width: "100%",
              boxShadow: "0 1px 0 rgba(255,255,255,.8), 0 14px 34px -22px rgba(18,22,26,.5)" }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase",
                color: C.ink3, marginBottom: 14 }}>
                Contractor sign-in
              </div>

              <label style={{ display: "block", fontSize: 12, color: C.ink2, marginBottom: 5 }}>Email</label>
              <input type="email" value={email} autoComplete="email" inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`, padding: "0 12px",
                  fontSize: 16, fontFamily: body, background: "#FCFCFD", marginBottom: 14 }} />

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 12, color: C.ink2 }}>Password</label>
                <button type="button" onClick={handleForgotPassword} disabled={busy}
                  style={{ fontSize: 12, color: C.chalk, background: "none", border: "none", padding: 0,
                    cursor: busy ? "default" : "pointer", textDecoration: "underline" }}>
                  Forgot password?
                </button>
              </div>
              <input type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", height: 44, border: `1px solid ${C.hair}`, padding: "0 12px",
                  fontSize: 16, fontFamily: body, background: "#FCFCFD", marginBottom: 16 }} />

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
        </main>

        <footer style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between",
          alignItems: "center", padding: "16px 0 24px", fontFamily: mono, fontSize: 10.5,
          letterSpacing: ".08em", color: C.ink3 }}>
          <span>© 2026 SCOPECRETE.AI · BATON ROUGE, LA</span>
          <a href="mailto:admin@scopecrete.ai" style={{ color: C.ink2, textDecoration: "none", borderBottom: `1px solid ${C.joint}` }}>
            admin@scopecrete.ai
          </a>
        </footer>
      </div>
    </div>
  );
}
