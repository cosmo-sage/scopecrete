"use client";

/**
 * Renders Dusty's Markdown (src/lib/markdown.ts) with React elements only —
 * no innerHTML — so a reply can format a calculation table but can never
 * become markup.
 */

import React from "react";
import { T, F, nums } from "@/lib/v34/tokens";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function Text({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => p.t === "b" ? <b key={i}>{p.v}</b> : p.t === "i" ? <em key={i}>{p.v}</em>
    : p.t === "code" ? <code key={i} style={{ fontSize: "0.92em", background: T.sunk, padding: "0 3px", borderRadius: 3 }}>{p.v}</code>
    : <React.Fragment key={i}>{p.v}</React.Fragment>)}</>;
}

/** Memoised: while an answer streams, the earlier answers are not re-parsed. */
export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="sc-md" style={{ fontSize: F.md, lineHeight: 1.6, color: T.ink }}>
      {blocks.map((b, i) => {
        const gap = { margin: i === 0 ? "0 0 8px" : "8px 0" };
        if (b.k === "h") return <div key={i} style={{ ...gap, fontWeight: 700, fontSize: b.level === 1 ? F.lg : F.md }}><Text parts={b.text} /></div>;
        if (b.k === "p") return <p key={i} style={gap}><Text parts={b.text} /></p>;
        if (b.k === "code") return <pre key={i} style={{ ...gap, background: T.sunk, padding: 8, borderRadius: 4, fontSize: F.sm, overflowX: "auto", whiteSpace: "pre" }}>{b.v}</pre>;
        if (b.k === "ul") return <ul key={i} style={{ ...gap, paddingLeft: 20, listStyle: "disc" }}>{b.items.map((it, j) => <li key={j}><Text parts={it} /></li>)}</ul>;
        if (b.k === "ol") return <ol key={i} style={{ ...gap, paddingLeft: 20, listStyle: "decimal" }}>{b.items.map((it, j) => <li key={j}><Text parts={it} /></li>)}</ol>;
        return (
          <div key={i} style={{ ...gap, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: F.sm, ...nums, minWidth: "100%" }}>
              <thead><tr>{b.head.map((h, j) => (
                <th key={j} style={{ textAlign: b.align[j] ?? "left", padding: "4px 8px", borderBottom: `1px solid ${T.hairStrong}`, fontWeight: 600, whiteSpace: "nowrap" }}><Text parts={h} /></th>
              ))}</tr></thead>
              <tbody>{b.rows.map((r, j) => (
                <tr key={j} style={{ borderTop: `1px solid ${T.hairSoft}` }}>{r.map((c, k) => (
                  <td key={k} style={{ textAlign: b.align[k] ?? "left", padding: "4px 8px", whiteSpace: b.align[k] === "right" ? "nowrap" : undefined }}><Text parts={c} /></td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
});
