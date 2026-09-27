"use client";

/**
 * Header drops for the v34 shell — the panels behind the pipeline and + buttons.
 *
 * Ported from scopecrete-v34.jsx (PipelineDrop L4000, CreateDrop L4896) in
 * layout and motion. The CONTENT is not ported, because in the mockup both are
 * fed by mock constants:
 *
 *   PipelineDrop reads `p` from `pipelineNumbers()`, which sums a `value` field
 *   on mock THREADS, and two of its four cells come from `PLACE` — v34's own
 *   bag of placeholders, which it marks with an orange dot and a comment
 *   reading "Each needs a field, a feed, or a state that isn't built."
 *
 *   CreateDrop maps CREATE_ROWS, every entry of which is a screen that exists
 *   only in the mockup.
 *
 * So both are rebuilt here against what actually exists. Where there is no
 * number, the cell prints an em dash and says what it is waiting for — the
 * behaviour the Cash screen already uses, and the only honest rendering while
 * `estimates` is 0 rows.
 *
 * v34's StreamBar is deliberately NOT ported. It is driven by PROC_EVENTS and
 * DREAM_LINES — ten hardcoded sentences including "3 quotes out · 41,180
 * waiting on somebody else" and "Gulfline deposit cleared Tuesday · 8,530".
 * Nothing in the system produces those, and ambient copy that states figures is
 * the most deniable kind of fabrication. It comes back when something real
 * feeds it.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";

const HAIR = "1px solid rgba(255,255,255,.09)";

/** Shared chrome: a glass panel hanging off the bottom edge of the header. */
function Drop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[45]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="absolute sc-glass sc-drop"
        style={{ top: 54, left: 8, right: 8, borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pipeline */

interface PipelineStage { count: number; totalValue: number }
interface PipelineBody { stages?: Record<string, PipelineStage>; error?: string }

/**
 * Four cells, each either a real number or a dash with its reason.
 *
 * `totalValue` comes from `estimates`, which has 0 rows, so every value is 0
 * today. A 0 there would read as "this work is worth nothing" rather than
 * "nothing has been priced", so a zero total renders as a dash. A zero COUNT is
 * printed as 0, because zero leads in a stage is a true and useful statement.
 */
export function PipelineDrop({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState<PipelineBody | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/dashboard/pipeline")
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as PipelineBody;
        if (off) return;
        if (!r.ok) setErr(b?.error || `HTTP ${r.status}`);
        else setBody(b);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);

  const stages = body?.stages ?? {};
  const stageCount = (k: string) => stages[k]?.count ?? null;
  const openCount = Object.entries(stages)
    .filter(([k]) => k !== "won" && k !== "lost")
    .reduce((n, [, s]) => n + (s?.count ?? 0), 0);
  const valued = Object.values(stages).reduce((n, s) => n + (s?.totalValue ?? 0), 0);

  const cells: Array<{ l: string; v: string | number | null; s: string }> = [
    { l: "Open leads", v: body ? openCount : null, s: "not won, not lost" },
    { l: "Quoted", v: stageCount("quoted"), s: "sitting in their hands" },
    {
      l: "Pipeline value",
      v: valued > 0 ? `$${Math.round(valued).toLocaleString("en-US")}` : null,
      s: valued > 0 ? "from estimates on file" : "no estimates on file — nothing is priced yet",
    },
    { l: "Won", v: stageCount("won"), s: "jobs is empty until a scope is won" },
  ];

  return (
    <Drop onClose={onClose}>
      {err ? (
        <div className="px-3 py-3" style={{ fontSize: F.sm, color: "rgba(255,255,255,.75)" }}>
          Couldn&apos;t read the pipeline — {err}
        </div>
      ) : (
        <div className="grid grid-cols-2">
          {cells.map((c, i) => (
            <div key={c.l} className="px-3 py-2.5"
              style={{ borderBottom: HAIR, borderRight: i % 2 === 0 ? HAIR : "none" }}>
              <div style={{ ...eyebrow, color: "rgba(255,255,255,.55)" }}>{c.l}</div>
              <div style={{
                fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05,
                color: c.v === null ? "rgba(255,255,255,.4)" : "#fff", ...nums,
              }}>
                {body === null && !err ? "·" : (c.v ?? "—")}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.42)", ...clip }}>{c.s}</div>
            </div>
          ))}
        </div>
      )}
      <Link href="/dashboard/more/pipeline" onClick={onClose}
        className="w-full px-3 flex items-center justify-between no-underline"
        style={{ height: 42, color: "#fff", fontFamily: disp, fontSize: F.md,
                 letterSpacing: ".06em", textTransform: "uppercase" }}>
        <span>Full pipeline</span>
        <span style={{ color: T.hiviz }}>›</span>
      </Link>
    </Drop>
  );
}

/* -------------------------------------------------------------------- create */

/**
 * Every entry names what it is waiting for rather than being hidden, so the
 * shape of the product stays legible without any of them pretending to work.
 *
 * NOTHING IS LIVE HERE YET. On the branch this was written, "New job" was
 * waiting on `POST /api/jobs`, which existed only in PR #10. That PR has since
 * merged, so the writer is live — but there is still no form to drive it, and
 * a row that opens nothing is the same dead control either way. The sub-text
 * says which of the two is actually missing, because "needs a writer" and
 * "needs a form" are a database problem and a UI problem and they do not get
 * fixed by the same work.
 */
const CREATE_ROWS: Array<{ label: string; sub: string; href?: string }> = [
  { label: "New job", sub: "Needs a create form — POST /api/jobs is live" },
  { label: "New scope", sub: "Needs the scope builder — work order 15" },
  { label: "New invoice", sub: "Needs a job to invoice against" },
  { label: "Log a receipt", sub: "Camera-first; needs the capture path" },
];

export function CreateDrop({ onClose }: { onClose: () => void }) {
  const anyLive = CREATE_ROWS.some((r) => r.href);
  return (
    <Drop onClose={onClose}>
      {!anyLive && (
        <div className="px-3 pt-2.5 pb-1"
          style={{ ...eyebrow, color: "rgba(255,255,255,.55)" }}>
          Nothing is creatable yet — each row says what it needs
        </div>
      )}
      {CREATE_ROWS.map((r, i) => {
        const inner = (
          <>
            <span className="min-w-0">
              <span style={{
                display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600,
                color: r.href ? "#fff" : "rgba(255,255,255,.45)", ...clip,
              }}>{r.label}</span>
              <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,.45)", ...clip }}>
                {r.sub}
              </span>
            </span>
            {r.href && <span style={{ color: T.hiviz, flexShrink: 0 }}>›</span>}
          </>
        );
        const style: React.CSSProperties = {
          borderTop: i || !anyLive ? HAIR : "none", minHeight: 52,
        };
        return r.href ? (
          <Link key={r.label} href={r.href} onClick={onClose}
            className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 no-underline"
            style={style}>
            {inner}
          </Link>
        ) : (
          <div key={r.label} aria-disabled="true"
            className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2"
            style={style}>
            {inner}
          </div>
        );
      })}
    </Drop>
  );
}
