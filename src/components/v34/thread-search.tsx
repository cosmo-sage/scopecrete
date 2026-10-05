"use client";
/**
 * Search inside Threads (Threads v2, §2d; simplified 2026-10-05 — Coy: "a
 * simple search bubble to drop down at the top of the chat window and the
 * full width of the chat window"). One box over the conversation, no scope or
 * type buttons: it searches everything with this person (every number and
 * channel), and when nothing of theirs matches, the whole thread. A word like
 * "photos", "voicemail" or "pdf" picks the kind (`readThreadQuery()`).
 * Results drop down over the chat and open that channel at that message.
 */
import React, { useEffect, useState } from "react";
import { T, F, disp, nums, clip } from "@/lib/v34/tokens";
import { readThreadQuery, SEARCH_TYPES, type SearchType } from "@/lib/v34/threads";

interface Result { id: string; type: SearchType; contact_id: string; at: string | null; channel: string | null; title: string; snippet: string; where: string }

const TILE: Record<SearchType, { l: string; bg: string; fg: string }> = {
  msg: { l: "TXT", bg: T.slab, fg: T.ink2 }, photo: { l: "IMG", bg: "#DDE3DA", fg: T.ink2 }, file: { l: "PDF", bg: T.red, fg: "#fff" },
  link: { l: "URL", bg: T.chalkDim, fg: T.chalk }, call: { l: "CALL", bg: T.slab, fg: T.ink2 }, vm: { l: "VM", bg: T.hivizDim, fg: T.hivizText },
};

export function ThreadSearch({ contactId, firstName, threadName, threadContacts, threadBucket, onClose, onOpen }: {
  contactId: string; firstName: string; threadName: string; threadContacts: string[];
  /** A system thread (Customer, Vendor, …): the server works out its people. */
  threadBucket?: string | null;
  onClose: () => void; onOpen: (r: { contact_id: string; channel: string | null; id: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ results: Result[]; wide: boolean } | null>(null);
  const { words, type } = readThreadQuery(q);
  const canWiden = threadContacts.length > 0 || !!threadBucket;
  useEffect(() => {
    if (!q.trim()) return;
    const ctl = new AbortController();
    const ask = (wide: boolean) => {
      const whole = wide && !threadContacts.length && threadBucket;
      const p = new URLSearchParams({ contacts: (wide ? (whole ? [] : threadContacts) : [contactId]).slice(0, 400).join(","), q: words, type });
      if (whole) p.set("bucket", threadBucket);
      return fetch(`/api/threads/search?${p}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null)) as Promise<{ results: Result[] } | null>;
    };
    const t = setTimeout(async () => {
      try {
        const mine = await ask(false);
        if (mine?.results.length || !canWiden) { setData({ results: mine?.results ?? [], wide: false }); return; }
        const all = await ask(true);
        setData({ results: all?.results ?? [], wide: true });
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, words, type, contactId, threadContacts, threadBucket, canWiden]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const kind = type === "all" ? null : SEARCH_TYPES.find((t) => t.k === type)?.label.toLowerCase();
  return (
    <div className="relative" style={{ padding: "8px 12px", background: T.card, borderBottom: `1px solid ${T.hairSoft}` }} aria-label="Search this thread">
      <label className="flex items-center gap-2 rounded-full w-full" style={{ height: 36, border: `1px solid ${T.hairStrong}`, padding: "0 6px 0 12px", background: T.slab }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={T.ink3} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search everything with ${firstName} — words, photos, voicemail…`} aria-label="Search"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: F.sm }} />
        <button onClick={onClose} aria-label="Close search" className="rounded-full" style={{ width: 26, height: 26, color: T.ink2, cursor: "pointer" }}>×</button>
      </label>
      {q.trim() && (
        <div className="absolute left-0 right-0 overflow-y-auto" style={{ top: "100%", maxHeight: "min(60vh, 520px)", background: T.card, borderBottom: `1px solid ${T.hairStrong}`, boxShadow: "0 10px 24px rgba(0,0,0,.14)", zIndex: 30 }}>
          <div style={{ fontSize: 11.5, color: T.ink3, padding: "6px 12px", borderBottom: `1px solid ${T.hairSoft}` }}>
            {!data ? "Searching…" : `${data.results.length}${kind ? ` ${kind}` : ""} ${data.wide ? `in ${threadName} — nothing from ${firstName}` : `with ${firstName}`} · newest first`}
          </div>
          {data && !data.results.length && (
            <div className="px-3 py-5" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing matches{canWiden ? ` with ${firstName} or anyone in ${threadName}` : ""}. Try other words, or the search in the header for everything.</div>
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
      )}
    </div>
  );
}
