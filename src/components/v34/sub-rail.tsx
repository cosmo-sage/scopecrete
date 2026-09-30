"use client";

/**
 * A page's own sub-pages as a second icon rail, opening beside the main rail
 * on a desktop (Coy, 2026-09-30: "It's like a file tab structure. The main
 * left menu is the main file, which opens another file structure" — no wider
 * than the main rail). The phone keeps its row of tabs.
 */

import React from "react";
import { T } from "@/lib/v34/tokens";

export type SubIcon = "details" | "threads" | "jobs" | "documents" | "payments" | "files" | "schedule";

const PATHS: Record<SubIcon, React.ReactNode> = {
  details: <><rect x="3" y="3" width="14" height="14" rx="1.5" /><path d="M6 7h8M6 10h8M6 13h5" /></>,
  threads: <><path d="M3 4h10v7H7l-3 3v-3H3z" /><path d="M13 7h4v7h-1v3l-3-3H9" /></>,
  jobs: <><rect x="3" y="6" width="14" height="10" rx="1" /><path d="M7 6V4h6v2M3 10h14" /></>,
  documents: <><path d="M5 2h7l4 4v12H5z" /><path d="M12 2v4h4M8 10h5M8 13h5" /></>,
  payments: <><rect x="2" y="5" width="16" height="11" rx="1.5" /><path d="M2 8.5h16M5 13h3" /></>,
  files: <><path d="M2 6h6l2 2h8v8H2z" /></>,
  schedule: <><rect x="3" y="4" width="14" height="13" rx="1" /><path d="M3 8h14M7 2v4M13 2v4" /></>,
};

export function SubRail<K extends string>({ items, value, onChange, label }: {
  items: Array<{ k: K; label: string; icon: SubIcon }>; value: K; onChange: (k: K) => void; label: string;
}) {
  return (
    <nav aria-label={label} className="shrink-0 flex flex-col"
      style={{ width: 72, background: T.rail, borderRight: `1px solid ${T.hair}`, position: "sticky", top: "var(--sc-head)",
        height: "calc(100dvh - var(--sc-head))", overflowY: "auto" }}>
      {items.map((it) => {
        const on = it.k === value;
        return (
          <button key={it.k} role="tab" aria-selected={on} onClick={() => onChange(it.k)}
            className="flex flex-col items-center justify-center gap-1 shrink-0"
            style={{ height: 56, cursor: "pointer", border: "none", borderLeft: `3px solid ${on ? T.hivizSoft : "transparent"}`,
              background: on ? "var(--sc-rail-active)" : "transparent", color: on ? "var(--sc-rail-ink-on)" : "var(--sc-rail-ink)" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
              {PATHS[it.icon]}
            </svg>
            <span className="sc-rail-label" style={{ fontSize: 9.5 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
