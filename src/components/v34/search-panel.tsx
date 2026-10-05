"use client";

/**
 * Search, from the header's magnifying glass (Coy, 2026-09-30): over every
 * message, call summary and transcript, person, note, job and file
 * (/api/search, migration 054). Results grouped by kind, the match
 * highlighted. Esc closes.
 *
 * Since 2026-10-05 (Coy: "a search bar the full width of the header on any
 * device and be on top of anything else including dusty chat") the box lies
 * over the header's logo row, edge to edge, with the results under it full
 * width — drawn into <body> so it sits above Dusty's docked column.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { T, F, eyebrow, clip, relTime } from "@/lib/v34/tokens";

interface Group { kind: string; label: string; items: Array<{ id: string; title: string; snippet: string; at: string | null; href: string }> }

function Marked({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return <>{parts.map((p, i) => p.startsWith("«") ? <mark key={i} style={{ background: "rgba(242,97,12,.18)", color: T.ink, padding: 0 }}>{p.slice(1, -1)}</mark> : <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    const t = setTimeout(() => {
      if (term.length < 2) { setGroups(null); setBusy(false); return; }
      setBusy(true);
      fetch(`/api/search?q=${encodeURIComponent(term)}`).then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((b) => { if (n === seq.current) setGroups((b.groups ?? []) as Group[]); })
        .catch(() => { if (n === seq.current) setGroups([]); })
        .finally(() => { if (n === seq.current) setBusy(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <button aria-label="Close search" onClick={onClose} className="fixed inset-0" style={{ background: "rgba(10,14,18,.28)", border: "none", zIndex: 300 }} />
      <div role="dialog" aria-label="Search" className="fixed left-0 right-0 top-0 sc-drop" style={{ zIndex: 301 }}>
        <div className="flex items-center gap-2 px-3" style={{ height: 54, background: T.card, borderBottom: `1px solid ${T.hair}`, boxShadow: "0 2px 10px rgba(10,14,18,.12)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ color: T.ink3, flex: "none" }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search everything"
            placeholder="Search messages, calls, people, vendors, jobs, files…"
            className="flex-1 min-w-0 outline-none bg-transparent" style={{ height: 44, fontSize: F.md, color: T.ink }} />
          {busy && <span style={{ fontSize: 10.5, color: T.ink3 }}>Searching…</span>}
          <button onClick={onClose} aria-label="Close search" className="flex items-center justify-center rounded" style={{ width: 34, height: 34, color: T.ink2, fontSize: 18, flex: "none" }}>×</button>
        </div>
        {(q.trim().length < 2 || groups) && (
          <div style={{ maxHeight: "calc(100vh - 54px - 24px)", overflowY: "auto", background: T.card, borderBottom: `1px solid ${T.hair}`, boxShadow: "0 14px 40px rgba(10,14,18,.28)" }}>
            <div className="mx-auto" style={{ maxWidth: 960 }}>
            {q.trim().length < 2 && (
              <div className="px-3 py-3" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
                Every text, call summary and transcript, person and vendor, note, job and file Dusty has read. Use &quot;quotes&quot; for a phrase, a dash to leave a word out, or part of a phone number.
              </div>
            )}
            {groups && groups.length === 0 && !busy && <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing matches &ldquo;{q.trim()}&rdquo;.</div>}
            {groups?.map((g) => (
              <div key={g.kind}>
                <div className="px-3 pt-2 pb-1" style={{ ...eyebrow, fontSize: 9.5, color: T.ink3, background: T.slab }}>{g.label}</div>
                {g.items.map((it) => (
                  <Link key={it.id} href={it.href} onClick={onClose} className="block px-3 py-2 no-underline" style={{ borderTop: `1px solid ${T.hairSoft}`, color: T.ink }}>
                    <div className="flex items-baseline gap-2">
                      <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, fontWeight: 600, ...clip }}>{it.title}</span>
                      {it.at && <span style={{ fontSize: 10, color: T.ink3 }}>{relTime(it.at)}</span>}
                    </div>
                    {it.snippet && <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Marked text={it.snippet} /></div>}
                  </Link>
                ))}
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
