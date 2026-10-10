"use client";

/**
 * Header lockup: the org's logo + "powered by scopecrete.ai" (Claude Design
 * handoff design/org-branding/, Coy 2026-09-30). Layout "right": logo · thin
 * pencil rule · "powered by", the emblem and a mini wordmark on one line
 * (stacked on a phone). The logo follows
 * the theme — the light-lettering one in Night Shift, the dark-lettering one
 * elsewhere — falls back to the other, and with none (or one that fails to
 * load) the full scopecrete.ai Wordmark stands alone, as before.
 *
 * Coy, 2026-10-06: the org's logo can be switched off in the header
 * (Settings → Organization → Logo, `header_logo` on the account); off shows
 * the emblem and scopecrete.ai alone, no "powered by". The proposal keeps
 * the org's logo either way.
 */

import React, { useState } from "react";
import { Wordmark } from "@/components/v34/wordmark";
import { Emblem } from "@/components/site/marks";
import { light as lightFont } from "@/lib/v34/tokens";

const poweredBy: React.CSSProperties = { fontFamily: lightFont, fontWeight: 300, fontSize: 8.5, letterSpacing: ".06em", color: "var(--sc-pencil-muted)", lineHeight: 1, whiteSpace: "nowrap" };

export function OrgLockup({ name, hasLight, hasDark, stamp, dark, phone, showLogo = true }: {
  name: string | null; hasLight: boolean; hasDark: boolean; stamp: string | null;
  /** false: Coy switched the org's logo off in the header */ showLogo?: boolean;
  /** true in Night Shift */ dark: boolean; phone: boolean;
}) {
  const variant = !showLogo ? null : dark ? (hasDark ? "dark" : hasLight ? "light" : null) : (hasLight ? "light" : hasDark ? "dark" : null);
  const src = variant ? `/api/org/logo/${variant}${stamp ? `?v=${encodeURIComponent(stamp)}` : ""}` : null;
  const [broken, setBroken] = useState<string | null>(null);
  // The emblem (orbits round the green block) from the landing-page design
  // package, 2026-10-04, sits before the wordmark and turns as it does on the
  // site (Coy, 2026-10-05); reduced motion stills it (v34-shell.css).
  if (!src || broken === src) return (
    <span style={{ display: "flex", alignItems: "center", gap: phone ? 6 : 8, flex: "none" }}>
      <Emblem size={phone ? 24 : 28} spin />
      <Wordmark size={phone ? 22 : 26} />
    </span>
  );

  // Coy, 2026-09-30: "powered by scopecrete.ai" is the same size as the org's
  // logo — the block is exactly the logo's height, the wordmark filling what
  // "powered by" leaves.
  const h = phone ? 24 : 28;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: phone ? 8 : 10, flex: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name ?? "Logo"} onError={() => setBroken(src)}
        style={{ height: h, width: "auto", maxWidth: phone ? 150 : 220, objectFit: "contain", display: "block" }} />
      <span className="sc-powered" style={{ height: h, display: "flex", alignItems: "center", gap: phone ? 5 : 6,
        paddingLeft: phone ? 8 : 10, borderLeft: "1px solid var(--sc-pencil-rule)" }}>
      {phone ? (<>
        <Emblem size={h} spin />
        <span style={{ height: h, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={poweredBy}>powered by</span>
          <Wordmark size={13} guides={false} />
        </span>
      </>) : (<>
        {/* Coy, 2026-10-05: one line on a desktop — "powered by (emblem) scopecrete.ai". */}
        <span style={{ ...poweredBy, fontSize: 10.5 }}>powered by</span>
        <Emblem size={22} spin />
        <Wordmark size={16} guides={false} />
      </>)}
      </span>
    </span>
  );
}
