"use client";

/**
 * A one-line note box where @ offers the org's members — onsite estimators
 * included (081; Coy, 2026-10-05: "Internal users can be mentioned with
 * @(username) in the customer notes and get a notification"). A pick writes
 * `@[Name](u:<id>)` (src/lib/mentions.ts); the database turns each tag into a
 * notification for that member (member_notifications). Internal notes in
 * Threads have their own, larger box (internal-notes.tsx).
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { insertTag, matchMembers, memberName, typingTag, type Member } from "@/lib/mentions";

let cache: Promise<Member[]> | null = null;
/** The org's members, fetched once per page load. */
export function useOrgMembers(): Member[] {
  const [m, setM] = useState<Member[]>([]);
  useEffect(() => {
    let off = false;
    cache ??= fetch("/api/org").then((r) => (r.ok ? r.json() : null)).then((b) => (b?.people ?? []) as Member[]).catch(() => { cache = null; return []; });
    cache.then((x) => { if (!off) setM(x); });
    return () => { off = true; };
  }, []);
  return m;
}

export function MentionField({ value, onChange, onSubmit, placeholder, style, autoFocus }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder?: string; style?: React.CSSProperties; autoFocus?: boolean;
}) {
  const members = useOrgMembers();
  const [tag, setTag] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const box = useRef<HTMLInputElement | null>(null);
  const options = tag ? matchMembers(members, tag.query) : [];
  const choose = (m: Member) => {
    if (!tag) return;
    const r = insertTag(value, tag, m);
    onChange(r.text); setTag(null);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(r.caret, r.caret); } });
  };
  return (
    <span className="relative" style={{ flex: 1, minWidth: 0, display: "flex" }}>
      <input ref={box} autoFocus={autoFocus} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setTag(typingTag(e.target.value, e.target.selectionStart ?? e.target.value.length)); setPick(0); }}
        onKeyDown={(e) => {
          if (!options.length) { if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); } return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % options.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + options.length) % options.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[pick]); }
          else if (e.key === "Escape") setTag(null);
        }}
        style={{ flex: 1, minWidth: 0, ...style }} />
      {options.length > 0 && (
        <span className="absolute rounded overflow-hidden" role="listbox" aria-label="Tag a teammate"
          style={{ top: "100%", left: 0, marginTop: 3, minWidth: 220, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 20px rgba(0,0,0,.15)", zIndex: 5 }}>
          {options.map((m, i) => (
            <button key={m.user_id} type="button" role="option" aria-selected={i === pick} onMouseDown={(e) => { e.preventDefault(); choose(m); }}
              className="w-full text-left px-3 py-1.5 flex items-baseline gap-2" style={{ background: i === pick ? T.slab : T.card, fontSize: F.sm, cursor: "pointer" }}>
              <span style={{ fontWeight: 600 }}>{memberName(m)}</span><span style={{ fontSize: 11, color: T.ink3 }}>{m.email}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
