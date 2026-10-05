"use client";

// The frame around the sign-in and invite pages, from the Claude Design
// package (Login.dc.html / Join.dc.html, 2026-10-04): draft-paper header with
// the wordmark and "Back to site", a white card with corner marks on the
// concrete grid, a one-line footer. `sandbox` (src/lib/sandbox.ts) puts a
// strip across the top on preview deployments — never on production.

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ROOT_DOMAIN, hostKind } from "@/lib/hosts";
import { DRAFT_GRID, Emblem, GraphiteFilter, Wordmark, disp } from "./marks";

export const label: CSSProperties = {
  fontFamily: disp, fontWeight: 600, fontSize: 13, letterSpacing: ".14em",
  textTransform: "uppercase", color: "#3A4249",
};
export const input: CSSProperties = {
  height: 48, padding: "0 14px", border: "1px solid #B9C0C8", borderRadius: 2,
  font: "inherit", fontSize: 16, color: "#12161A", background: "#FAFBFC", width: "100%", minWidth: 0,
};
export const h1: CSSProperties = {
  margin: 0, fontFamily: disp, fontWeight: 700, fontSize: 34, lineHeight: 1, textTransform: "uppercase",
};
export const lede: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.45, color: "#5A646F" };
export function cta(busy = false): CSSProperties {
  return {
    height: 52, width: "100%", border: 0, background: busy ? "#C94F08" : "#F2610C", color: "#FFFFFF",
    borderRadius: 2, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10, textDecoration: "none", fontFamily: disp, fontWeight: 700,
    fontSize: 18, letterSpacing: ".1em", textTransform: "uppercase",
  };
}
export const ghost: CSSProperties = {
  height: 52, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
  border: "1px solid #12161A", background: "#FFFFFF", borderRadius: 2, cursor: "pointer",
  font: "inherit", fontSize: 16, fontWeight: 600, color: "#12161A", textDecoration: "none",
};

export function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span aria-hidden="true" style={{
      width: 16, height: 16, borderRadius: "50%", display: "inline-block", animation: "scSpin .8s linear infinite",
      border: `2px solid ${dark ? "#DCE0E5" : "rgba(255,255,255,.4)"}`, borderTopColor: dark ? "#12161A" : "#FFFFFF",
    }} />
  );
}

export function GoogleG() {
  return (
    <span aria-hidden="true" style={{ width: 22, height: 22, border: "1px solid #DCE0E5", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#4285F4" }}>G</span>
  );
}

export function OrRule({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ flex: 1, height: 1, background: "#DCE0E5" }} />
      <span style={{ ...label, color: "#8A95A1" }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "#DCE0E5" }} />
    </div>
  );
}

/** Where "Back to site" goes: the public site from the app's own addresses,
 *  else this host's copy of it (previews, localhost). */
const noSubscribe = () => () => {};
function useHomeHref() {
  return useSyncExternalStore(
    noSubscribe,
    () => (hostKind(window.location.host).kind === "other" ? "/welcome" : `https://${ROOT_DOMAIN}`),
    () => `https://${ROOT_DOMAIN}`,
  );
}

export default function AuthShell({ sandbox, above, footer, children }: {
  sandbox?: string | null; above?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const home = useHomeHref();
  return (
    <div className="sc-auth" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", color: "#12161A",
      fontFamily: "var(--site-body), 'IBM Plex Sans', system-ui, sans-serif", WebkitFontSmoothing: "antialiased",
      backgroundColor: "#E9EBEE", backgroundImage: "linear-gradient(rgba(18,22,26,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(18,22,26,.055) 1px,transparent 1px)",
      backgroundSize: "40px 40px", backgroundPosition: "-1px -1px" }}>
      <style>{`
.sc-auth *{box-sizing:border-box}
.sc-auth a{color:#1B5FD9}.sc-auth a:hover{color:#12161A}
.sc-auth a:focus-visible,.sc-auth button:focus-visible,.sc-auth input:focus-visible{outline:2px solid #F2610C;outline-offset:2px}
.sc-auth input::placeholder{color:#9AA3AD}
.sc-auth .sc-cta:hover:not(:disabled){background:#C94F08!important;color:#FFFFFF}
.sc-auth .sc-ghost:hover:not(:disabled){background:#F4F5F7!important;color:#12161A}
.sc-auth .sc-back{color:#3A4249;text-decoration:none}.sc-auth .sc-back:hover{color:#12161A}
@keyframes scSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.sc-auth *{animation:none!important}}
`}</style>
      <GraphiteFilter />
      {sandbox && (
        <div role="note" style={{ background: "#F2B40C", color: "#12161A", textAlign: "center", padding: "6px 16px",
          fontFamily: disp, fontWeight: 700, fontSize: 14, letterSpacing: ".14em", textTransform: "uppercase" }}>
          {sandbox} · not the live site
        </div>
      )}
      <header style={{ backgroundColor: "#FAF8F3", backgroundImage: DRAFT_GRID, backgroundSize: "10px 10px", borderBottom: "1px solid rgba(58,62,68,.3)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 60, padding: "0 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <a href={home} aria-label="ScopeCrete home" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}><Emblem size={28} spin={false} /><Wordmark /></a>
          <span style={{ flex: 1 }} />
          <a href={home} className="sc-back" style={{ fontFamily: disp, fontWeight: 600, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase" }}>‹ Back to site</a>
        </div>
      </header>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "48px 16px 64px" }}>
        {above}
        <div style={{ position: "relative", width: "100%", maxWidth: 440, background: "#FFFFFF", border: "1px solid #C8CDD3",
          boxShadow: "0 3px 0 -2px rgba(58,62,68,.3),0 18px 40px -20px rgba(18,22,26,.25)" }}>
          <span style={{ position: "absolute", left: -7, top: -7, width: 13, height: 13, borderLeft: "1px solid #12161A", borderTop: "1px solid #12161A" }} />
          <span style={{ position: "absolute", right: -7, bottom: -7, width: 13, height: 13, borderRight: "1px solid #12161A", borderBottom: "1px solid #12161A" }} />
          {children}
        </div>
      </main>
      <footer style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#5A646F" }}>
        {footer ?? <>© 2026 ScopeCrete · <a href="mailto:admin@scopecrete.ai" style={{ color: "#3A4249" }}>admin@scopecrete.ai</a></>}
      </footer>
    </div>
  );
}
