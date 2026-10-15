"use client";

/**
 * Settings → Install the app. Chrome offers to install ScopeCrete only on an
 * org's own address on the live site (src/lib/install.ts); its own banner shows
 * when Chrome decides, so this row asks for it on a tap. Shown only when the
 * browser says the app can be installed here and it isn't open as the app.
 */

import React, { useEffect, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { hostKind } from "@/lib/hosts";
import { installHint, type InstallHint } from "@/lib/install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { saved = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { saved = null; listeners.forEach((f) => f()); });
}

export function InstallApp() {
  const [ev, setEv] = useState<InstallEvent | null>(saved);
  useEffect(() => {
    const f = () => setEv(saved);
    listeners.add(f);
    f();
    return () => { listeners.delete(f); };
  }, []);
  if (!ev) return null;
  return (
    <button
      onClick={async () => { await ev.prompt(); await ev.userChoice.catch(() => null); saved = null; setEv(null); }}
      className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
      <div style={{ fontSize: F.md, fontWeight: 600 }}>Install the app</div>
      <div style={{ fontSize: F.xs, color: T.ink3 }}>ScopeCrete on your home screen, opening full screen</div>
    </button>
  );
}

const DISMISSED = "sc:install-dismissed";

/**
 * The home-screen install, offered once on the dashboard (Coy, 2026-10-15: "I want
 * the app to ask him to install it in his home screen"). On a company's own address
 * (where the manifest is served), or after joining from an invite (?welcome=1 — also
 * how a preview shows it). Chrome and Edge get an Install button; an iPhone gets
 * Safari's Share → Add to Home Screen, since iOS has no install prompt; Android with
 * no prompt yet, the ⋮ menu. Not now hides it on this device; it never shows inside
 * the installed app. Settings → Account keeps Install the app for later.
 */
export function InstallPrompt() {
  const [hint, setHint] = useState<InstallHint>(null);
  const [ev, setEv] = useState<InstallEvent | null>(saved);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const welcome = sp.has("welcome") || sp.has("install");
    if (welcome) {
      sp.delete("welcome"); sp.delete("install");
      const q = sp.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    }
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { /* private mode */ }
    if (dismissed || (!welcome && hostKind(window.location.host).kind !== "org")) return;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const touchMac = navigator.maxTouchPoints > 1;
    const f = () => { setEv(saved); setHint(installHint(navigator.userAgent, { standalone, canPrompt: !!saved, touchMac })); };
    listeners.add(f);
    // Chrome fires beforeinstallprompt a moment after load; give it that moment before
    // falling back to the menu's words on Android.
    const t = window.setTimeout(f, saved ? 0 : 2500);
    return () => { listeners.delete(f); window.clearTimeout(t); };
  }, []);
  if (!hint) return null;
  const close = () => { try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode */ } setHint(null); };
  const share = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ display: "inline", verticalAlign: "-2px" }}>
      <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
  return (
    <div role="dialog" aria-label="Put ScopeCrete on your home screen" className="sc-install-card"
      style={{ position: "fixed", zIndex: 60, right: 12, left: 12, bottom: "calc(var(--sc-foot, 0px) + 12px + env(safe-area-inset-bottom, 0px))", maxWidth: 400, marginLeft: "auto",
        background: T.card, color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 12, boxShadow: "0 12px 32px -12px rgba(0,0,0,.35)", padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-touch-icon.png?v=4e" alt="" width={44} height={44} style={{ borderRadius: 10, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: F.md, fontWeight: 700 }}>Put ScopeCrete on your home screen</div>
        {hint === "prompt" && <div style={{ fontSize: F.sm, color: T.ink2 }}>It opens full screen, like an app.</div>}
        {hint === "ios" && (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
            <li>In Safari, tap Share {share} at the bottom of the screen.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open ScopeCrete from your home screen and sign in once with your email and password.</li>
            <li style={{ listStyle: "none", marginLeft: -18, marginTop: 4, color: T.ink3 }}>Opened from an email app? Open this page in Safari first.</li>
          </ol>
        )}
        {hint === "android" && (
          <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>In Chrome, tap the <b>⋮</b> menu at the top right, then <b>Add to Home screen</b> (or <b>Install app</b>).</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {hint === "prompt" && ev && (
            <button onClick={async () => { await ev.prompt(); await ev.userChoice.catch(() => null); saved = null; close(); }}
              style={{ background: T.hiviz, color: T.onHiviz, border: 0, borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: F.sm, cursor: "pointer" }}>Install</button>
          )}
          <button onClick={close} style={{ background: "none", border: `1px solid ${T.hair}`, color: T.ink2, borderRadius: 8, padding: "7px 14px", fontSize: F.sm, cursor: "pointer" }}>
            {hint === "prompt" ? "Not now" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
