"use client";
/**
 * Search inside Threads (Threads v2, §2d): words, photos, files, links, calls
 * and voicemails — on this number, this person, or everyone in the thread.
 * A 340px panel at the right of the open contact on a desktop; the whole
 * screen on a phone. Results open that channel at that message.
 */
import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { SEARCH_TYPES, type SearchScope, type SearchType } from "@/lib/v34/threads";

interface Result { id: string; type: SearchType; contact_id: string; at: string | null; channel: string | null; title: string; snippet: string; where: string }

const TILE: Record<SearchType, { l: string; bg: string; fg: string }> = {
  msg: { l: "TXT", bg: T.slab, fg: T.ink2 }, photo: { l: "IMG", bg: "#DDE3DA", fg: T.ink2 }, file: { l: "PDF", bg: T.red, fg: "#fff" },
  link: { l: "URL", bg: T.chalkDim, fg: T.chalk }, call: { l: "CALL", bg: T.slab, fg: T.ink2 }, vm: { l: "VM", bg: T.hivizDim, fg: T.hivizText },
};

export function ThreadSearch({ contactId, firstName, number, threadName, threadContacts, threadBucket, onClose, onOpen }: {
  contactId: string; firstName: string; number: string | null; threadName: string; threadContacts: string[];
  /** A system thread (Customer, Vendor, …): the server works out its people. */
  threadBucket?: string | null;
  onClose: () => void; onOpen: (r: { contact_id: string; channel: string | null; id: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<SearchScope>(number ? "channel" : "contact");
  const [type, setType] = useState<"all" | SearchType>("all");
  const [data, setData] = useState<{ results: Result[]; counts: Record<string, number> } | null>(null);
  useEffect(() => {
    const whole = scope === "thread" && !threadContacts.length && threadBucket;
    const ids = scope === "thread" && threadContacts.length ? threadContacts : whole ? [] : [contactId];
    const p = new URLSearchParams({ contacts: ids.slice(0, 400).join(","), q, type });
    if (whole) p.set("bucket", threadBucket);
    if (scope === "channel" && number) p.set("number", number);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/threads/search?${p}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (b) setData(b); }).catch(() => {});
    }, q ? 250 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, scope, type, contactId, number, threadContacts, threadBucket]);
  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, height: 26, border: "none", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", ...clip });
  const scopeLabel = scope === "channel" ? "this number" : scope === "contact" ? firstName : threadName;
  const total = data?.counts.all ?? 0, shown = type === "all" ? total : data?.counts[type] ?? 0;
  return (
    <aside className="flex flex-col h-full" style={{ background: T.card, borderLeft: `1px solid ${T.hair}` }} aria-label="Search this thread">
      <div className="flex flex-col gap-2" style={{ padding: "10px 12px", borderBottom: `1px solid ${T.hairSoft}` }}>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 flex-1 rounded" style={{ height: 34, border: `1px solid ${T.hairStrong}`, padding: "0 8px", background: T.card }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={T.ink3} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, files, photos…" aria-label="Search"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: F.sm }} />
          </label>
          <button onClick={onClose} aria-label="Close search" className="rounded" style={{ width: 34, height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, cursor: "pointer" }}>×</button>
        </div>
        <div className="flex overflow-hidden" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 4 }}>
          {number && <button onClick={() => setScope("channel")} style={seg(scope === "channel")}>This number</button>}
          <button onClick={() => setScope("contact")} style={seg(scope === "contact")}>{firstName}</button>
          <button onClick={() => setScope("thread")} style={seg(scope === "thread")} disabled={!threadContacts.length && !threadBucket}>Whole thread</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SEARCH_TYPES.map((t) => {
            const n = data?.counts[t.k] ?? 0, on = type === t.k;
            return (
              <button key={t.k} onClick={() => setType(t.k)} className="rounded px-2" style={{ height: 26, border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card,
                color: on ? T.card : n ? T.ink2 : T.ink3, fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
                {t.label} <span style={nums}>{n}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: T.ink3 }}>{data ? `${shown} of ${total} in ${scopeLabel}` : "Searching…"}</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {data && !data.results.length && (
          <div className="px-3 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing here matches. Widen the scope or clear a filter.</div>
        )}
        {data?.results.map((r) => (
          <button key={r.id} onClick={() => onOpen(r)} className="w-full flex gap-2.5 text-left" style={{ padding: "9px 12px", borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
            <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 34, height: 34, background: TILE[r.type].bg, color: TILE[r.type].fg, fontFamily: disp, fontSize: 10, fontWeight: 700 }}>{TILE[r.type].l}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="flex items-baseline gap-2">
                <span style={{ fontSize: 12.5, fontWeight: 500, color: T.ink, flex: 1, ...clip }}>{r.title}</span>
                <span style={{ fontSize: 11, color: T.ink3, ...nums }}>{r.at ? new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
              </span>
              {r.snippet && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12, color: T.ink2, lineHeight: 1.4 }}>{r.snippet}</span>}
              <span style={{ display: "block", fontSize: 10.5, color: T.ink3, ...clip }}>{r.where}</span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ ...eyebrow, padding: "6px 12px", color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>Newest first</div>
    </aside>
  );
}
