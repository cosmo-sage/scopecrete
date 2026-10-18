/**
 * A Space's silhouette (Claude Design "Rail Silhouettes", option 1a — Coy's pick;
 * Coy, 2026-10-18: "the rail is supposed to have silhouettes that are different
 * shapes/styles depending on if it's a customer / job / vendor"). Drawn objects in
 * the Space's colour: a clipboard for a job, an address book for a customer, a tag
 * for a vendor, a folder for a collection. Measures are the design's at 44px and
 * scale with `size`.
 */

import React from "react";

export type SpaceKind = "job" | "contact" | "vendor" | "collection";

export function SpaceSilhouette({ kind, color, initials, size = 44, on }: {
  kind: SpaceKind; color: string; initials: string; size?: number; on?: boolean;
}) {
  const s = size / 44;
  const px = (v: number) => `${v * s}px`;
  const bg = on ? "var(--sc-card)" : "var(--sc-rail-active)";
  const line = `${Math.max(1.5, 2 * s)}px solid ${color}`;
  const abs = (st: React.CSSProperties): React.CSSProperties => ({ position: "absolute", ...st });
  let shape: React.ReactNode;
  if (kind === "job") {
    shape = <>
      <span style={abs({ left: px(3), right: px(3), top: px(6), bottom: px(1), borderRadius: px(5), border: line, background: bg })} />
      <span style={abs({ left: px(14), top: px(1), width: px(16), height: px(9), borderRadius: px(3), background: color })} />
    </>;
  } else if (kind === "contact") {
    shape = <>
      <span style={abs({ left: px(5), right: px(3), top: px(3), bottom: px(3), borderRadius: `${px(3)} ${px(7)} ${px(7)} ${px(3)}`, border: line, borderLeftWidth: px(5), background: bg })} />
      <span style={abs({ left: px(2), top: px(12), width: px(7), height: px(5), borderRadius: px(2), background: color })} />
      <span style={abs({ left: px(2), top: px(27), width: px(7), height: px(5), borderRadius: px(2), background: color })} />
    </>;
  } else if (kind === "collection") {
    shape = <>
      <span style={abs({ left: px(2), right: px(2), top: px(10), bottom: px(3), borderRadius: px(3), border: line, background: bg })} />
      <span style={abs({ left: px(2), top: px(4), width: px(17), height: px(9), borderRadius: `${px(3)} ${px(3)} 0 0`, background: color })} />
    </>;
  } else {
    shape = <>
      <span style={abs({ inset: `${px(3)} ${px(1)} ${px(3)} ${px(3)}`, clipPath: "polygon(0 0,72% 0,100% 50%,72% 100%,0 100%)", background: color })} />
      <span style={abs({ inset: `${px(5)} ${px(4)} ${px(5)} ${px(5)}`, clipPath: "polygon(0 0,71% 0,100% 50%,71% 100%,0 100%)", background: bg })} />
      <span style={abs({ left: px(8), top: px(20), width: px(4), height: px(4), borderRadius: 999, background: color })} />
    </>;
  }
  return (
    <span aria-hidden="true" style={{
      position: "relative", width: size, height: size, flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
      color: on ? "var(--sc-ink)" : "var(--sc-rail-ink)", fontFamily: "var(--sc-font-strong)", fontWeight: 600, fontSize: Math.round(13 * s),
    }}>
      {shape}
      <span style={{ position: "relative", top: kind === "job" ? px(2) : kind === "collection" ? px(3) : 0, left: kind === "vendor" ? px(1) : kind === "contact" ? px(2) : 0 }}>{initials}</span>
    </span>
  );
}
