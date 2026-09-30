"use client";

/**
 * Header lockup: the org's logo + "powered by scopecrete.ai".
 * Default layout is "right" (Coy, 2026-09-30): logo · thin rule · stacked
 * "powered by" over a mini wordmark. "below" is kept for comparison.
 * No org logo → the full scopecrete.ai Wordmark, exactly as today.
 */

import React from "react";
import { Wordmark } from "@/components/v34/wordmark";   // the latest Wordmark.tsx from the palette handoff

export function OrgLockup({ name, logoLight, logoDark, dark, layout = "right" }: {
  name: string; logoLight: string | null; logoDark: string | null;
  /** true in Night Shift */ dark: boolean; layout?: "right" | "below";
}) {
  // Prefer the matching variant; fall back to the other rather than to nothing.
  const src = dark ? (logoDark ?? logoLight) : (logoLight ?? logoDark);
  if (!src) return <Wordmark size={26} />;

  const right = layout === "right";
  return (
    <span style={{ display: "flex", flexDirection: right ? "row" : "column", alignItems: right ? "center" : "flex-start", gap: right ? 10 : 2, flex: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} style={{ height: 28, width: "auto", display: "block" }} />
      <span style={{ display: "flex", flexDirection: right ? "column" : "row", alignItems: right ? "flex-start" : "baseline",
                     gap: right ? 1 : 4, paddingLeft: right ? 10 : 1,
                     borderLeft: right ? "1px solid var(--sc-pencil-line)" : "none" }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 8.5, letterSpacing: ".06em", color: "var(--sc-pencil-muted)" }}>powered by</span>
        <Wordmark size={10.5} guides={false} />
      </span>
    </span>
  );
}
