"use client";

/**
 * Header lockup: the org's logo + "powered by scopecrete.ai" (Claude Design
 * handoff design/org-branding/, Coy 2026-09-30). Layout "right": logo · thin
 * pencil rule · "powered by" stacked over a mini wordmark. The logo follows
 * the theme — the light-lettering one in Night Shift, the dark-lettering one
 * elsewhere — falls back to the other, and with none (or one that fails to
 * load) the full scopecrete.ai Wordmark stands alone, as before.
 */

import React, { useState } from "react";
import { Wordmark } from "@/components/v34/wordmark";
import { light as lightFont } from "@/lib/v34/tokens";

export function OrgLockup({ name, hasLight, hasDark, stamp, dark, phone }: {
  name: string | null; hasLight: boolean; hasDark: boolean; stamp: string | null;
  /** true in Night Shift */ dark: boolean; phone: boolean;
}) {
  const variant = dark ? (hasDark ? "dark" : hasLight ? "light" : null) : (hasLight ? "light" : hasDark ? "dark" : null);
  const src = variant ? `/api/org/logo/${variant}${stamp ? `?v=${encodeURIComponent(stamp)}` : ""}` : null;
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src) return <Wordmark size={phone ? 22 : 26} />;

  // Coy, 2026-09-30: "powered by scopecrete.ai" is the same size as the org's
  // logo — the block is exactly the logo's height, the wordmark filling what
  // "powered by" leaves.
  const h = phone ? 24 : 28;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: phone ? 8 : 10, flex: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name ?? "Logo"} onError={() => setBroken(src)}
        style={{ height: h, width: "auto", maxWidth: phone ? 150 : 220, objectFit: "contain", display: "block" }} />
      <span className="sc-powered" style={{ height: h, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start",
        paddingLeft: phone ? 8 : 10, borderLeft: "1px solid var(--sc-pencil-line)" }}>
        <span style={{ fontFamily: lightFont, fontWeight: 300, fontSize: 8.5, letterSpacing: ".06em", color: "var(--sc-pencil-muted)", lineHeight: 1 }}>powered by</span>
        <Wordmark size={phone ? 13 : 16} guides={false} />
      </span>
    </span>
  );
}
