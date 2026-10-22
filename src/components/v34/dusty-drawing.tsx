"use client";

/**
 * A drawing Dusty wrote (src/lib/dusty/drawing.ts), drawn with React elements from the cleaned tree —
 * never his text as markup — on white paper in every theme, with Download as an .svg or a .png (the
 * picture to text a customer or a crew).
 */

import React, { useMemo } from "react";
import { T, F, eyebrow } from "@/lib/v34/tokens";
import { parseDrawing, drawingSvg, drawingFileName, type Drawing, type DrawNode } from "@/lib/dusty/drawing";

const CAMEL: Record<string, string> = {
  "stroke-width": "strokeWidth", "stroke-dasharray": "strokeDasharray", "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
  "fill-rule": "fillRule", "font-size": "fontSize", "font-weight": "fontWeight", "font-style": "fontStyle",
  "text-anchor": "textAnchor", "dominant-baseline": "dominantBaseline",
};

function draw(n: DrawNode | string, key: number | string): React.ReactNode {
  if (typeof n === "string") return n;
  const props: Record<string, string | number> = { key };
  for (const [k, v] of Object.entries(n.attrs)) props[CAMEL[k] ?? k] = v;
  return React.createElement(n.tag, props, ...n.kids.map((c, i) => draw(c, i)));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function savePng(d: Drawing) {
  const [, , w, h] = d.root.attrs.viewBox.split(/[\s,]+/).map(Number);
  const width = 1600, height = Math.max(1, Math.round((width * h) / w));
  const svg = drawingSvg(d, { width, background: "#ffffff" }).replace("<svg ", `<svg height="${height}" `);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("load")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (blob) save(blob, drawingFileName(d, "png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DustyDrawing({ src, open }: { src: string; open: boolean }) {
  const d = useMemo(() => parseDrawing(src), [src]);
  const box: React.CSSProperties = { margin: "10px 0", border: `1px solid ${T.hairStrong}`, borderRadius: 8, overflow: "hidden", background: T.card };
  if (!d) {
    return (
      <div style={{ ...box, padding: "14px 12px", fontSize: F.sm, color: T.ink3 }}>
        {open ? "Drawing it… If this doesn't finish, ask Dusty to draw it again." : "This drawing didn't come through whole. Ask Dusty to draw it again."}
      </div>
    );
  }
  return (
    <figure style={box}>
      <div style={{ background: "#fff", padding: 8 }}>
        <svg viewBox={d.root.attrs.viewBox} role="img" aria-label={d.title}
          style={{ display: "block", width: "100%", height: "auto", maxHeight: "70vh", color: "#222" }}
          fontFamily="Inter, Arial, sans-serif">
          {d.root.kids.map((c, i) => draw(c, i))}
        </svg>
      </div>
      <figcaption style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 10px", borderTop: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink3 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: T.ink }}>{d.title}</span>
        <button type="button" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}
          onClick={() => save(new Blob([drawingSvg(d, { background: "#ffffff" })], { type: "image/svg+xml" }), drawingFileName(d, "svg"))}>
          SVG ↓
        </button>
        <button type="button" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }} onClick={() => { void savePng(d); }}>
          PNG ↓
        </button>
      </figcaption>
    </figure>
  );
}
