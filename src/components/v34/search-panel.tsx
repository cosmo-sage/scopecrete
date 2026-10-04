"use client";

/**
 * Search, from the header's magnifying glass (Coy, 2026-09-30): a box that
 * drops under the header — about 480px on a desktop, the full width on a
 * phone — over every message, call summary and transcript, person, note, job
 * and file (/api/search, migration 054). Results grouped by kind, the match
 * highlighted. Enter on an empty list does nothing; Esc closes.
 */

import React, { useEffect, useRef, useState } from "react";
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

  return (
    <>
      <button aria-label="Close search" onClick={onClose} className="fixed inset-0" style={{ top: "var(--sc-head)", background: "rgba(10,14,18,.2)", border: "none", zIndex: 44 }} />
      <div role="dialog" aria-label="Search" className="fixed left-0 right-0 lg:left-auto lg:right-3 sc-drop"
        style={{ top: "calc(var(--sc-head) + 6px)", zIndex: 45, width: "auto", maxWidth: "100vw" }}>
        <div className="mx-2 lg:mx-0 rounded-lg overflow-hidden lg:w-[480px]" style={{ background: T.card, boxShadow: "0 14px 40px rgba(10,14,18,.28)", border: `1px solid ${T.hair}` }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search everything"
            placeholder="Search messages, calls, people, vendors, jobs, files…"
            className="w-full px-3 outline-none" style={{ height: 44, fontSize: F.md, borderBottom: `1px solid ${T.hair}` }} />
          <div style={{ maxHeight: "min(70vh, 560px)", overflowY: "auto" }}>
            {q.trim().length < 2 && (
              <div className="px-3 py-3" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
                Every text, call summary and transcript, person and vendor, note, job and file Dusty has read. Use &quot;quotes&quot; for a phrase, a dash to leave a word out, or part of a phone number.
              </div>
            )}
            {busy && !groups && <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Searching…</div>}
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
      </div>
    </>
  );
}
