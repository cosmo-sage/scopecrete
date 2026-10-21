"use client";

/**
 * Renders Dusty's Markdown (src/lib/markdown.ts) with React elements only —
 * no innerHTML — so a reply can format a calculation table but can never
 * become markup.
 */

import React from "react";
import { T, F, nums } from "@/lib/v34/tokens";
import { parseMarkdown, type Inline, type MdBlock } from "@/lib/markdown";
import { DustyDrawing } from "@/components/v34/dusty-drawing";

/** Set by Dusty's chat: a "search the web for …" his answer suggests becomes a button that asks it (Coy, 2026-10-15). */
export const MdAsk = React.createContext<((q: string) => void) | null>(null);

const SEARCH_ASK = /(search the web for [^"“”\n]+?)(?=["“”]|[.,;:)!?]*(?:\s*$|\n)|[.;)!?](?:\s|$))/gi;

/** "…ask me to "search the web for X"" → the phrase as a button; anything else as it was. */
function Asks({ v }: { v: string }) {
  const onAsk = React.useContext(MdAsk);
  if (!onAsk || !/search the web for /i.test(v)) return <>{v}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of v.matchAll(SEARCH_ASK)) {
    const q = m[1].trim();
    if (q.length < 22) continue;
    out.push(v.slice(last, m.index));
    out.push(
      <button key={m.index} type="button" onClick={() => onAsk(q)} title="Ask Dusty to search the web for this"
        style={{ color: T.chalk, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", font: "inherit", background: "none", padding: 0, textAlign: "left" }}>
        🔍 {q}
      </button>,
    );
    last = (m.index ?? 0) + m[1].length;
  }
  out.push(v.slice(last));
  return <>{out}</>;
}

function Text({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => p.t === "b" ? <b key={i}><Asks v={p.v} /></b> : p.t === "i" ? <em key={i}><Asks v={p.v} /></em>
    : p.t === "code" ? (/search the web for /i.test(p.v) ? <Asks key={i} v={p.v} />
      : <code key={i} style={{ fontSize: "0.92em", background: T.sunk, padding: "0 3px", borderRadius: 3 }}>{p.v}</code>)
    : <Asks key={i} v={p.v} />)}</>;
}

function Blocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const gap = { margin: i === 0 ? "0 0 8px" : "8px 0" };
        if (b.k === "h") return <div key={i} style={{ ...gap, fontWeight: 700, fontSize: b.level === 1 ? F.lg : F.md }}><Text parts={b.text} /></div>;
        if (b.k === "p") return <p key={i} style={gap}><Text parts={b.text} /></p>;
        if (b.k === "quote") return <blockquote key={i} style={{ ...gap, borderLeft: `3px solid ${T.hairStrong}`, padding: "2px 0 2px 12px", color: T.ink }}><Blocks blocks={b.blocks} /></blockquote>;
        if (b.k === "drawing") return <DustyDrawing key={i} src={b.v} open={b.open} />;
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
    </>
  );
}

/** Memoised: while an answer streams, the earlier answers are not re-parsed. */
export const Markdown = React.memo(function Markdown({ text, size = F.md }: { text: string; size?: number }) {
  return (
    <div className="sc-md" style={{ fontSize: size, lineHeight: 1.6, color: T.ink }}>
      <Blocks blocks={parseMarkdown(text)} />
    </div>
  );
});
