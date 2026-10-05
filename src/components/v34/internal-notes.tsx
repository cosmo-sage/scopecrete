"use client";

/**
 * Internal notes on a person — their own channel in Threads (Coy, 2026-10-04:
 * "I need to be able to create internal notes. The internal notes tab can also
 * allow me to tag other internal members in the Org").
 *
 * Notes are `contact_notes` (migration 041): never sent, only seen inside the
 * org, read by Dusty. Typing @ offers the org's members (sc_org_people via
 * /api/org); a pick writes `@[Name](u:<id>)` into the note (src/lib/mentions.ts),
 * shown as a chip, and the member sees "tagged you" on their activity line.
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F, eyebrow, disp, relTime } from "@/lib/v34/tokens";
import { insertTag, matchMembers, memberName, noteParts, typingTag, type Member } from "@/lib/mentions";
import { archiveNote } from "@/lib/archive";
import { ArchiveNoteCard } from "@/components/v34/archive-actions";

export interface InternalNote { id: string; body: string; created_at: string; created_by?: string | null; message_id?: string | null }

export function InternalNotes({ contactId, name, notes, onSaved, leadSource }: {
  contactId: string; name: string | null; notes: InternalNote[]; onSaved: () => void;
  /** Where the lead came from — moved here off the thread's header (Coy, 2026-10-05). */
  leadSource?: string | null;
}) {
  const [members, setMembers] = useState<Array<Member & { you?: boolean }>>([]);
  const [text, setText] = useState("");
  const [tag, setTag] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/org").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off && b?.people) setMembers(b.people); }).catch(() => {});
    return () => { off = true; };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [notes.length]);

  const who = (id: string | null | undefined) => {
    const m = members.find((x) => x.user_id === id);
    return m ? (m.you ? "You" : memberName(m)) : null;
  };
  const options = tag ? matchMembers(members, tag.query) : [];
  const onType = (v: string, caret: number) => { setText(v); setTag(typingTag(v, caret)); setPick(0); };
  const choose = (m: Member) => {
    if (!tag) return;
    const r = insertTag(text, tag, m);
    setText(r.text); setTag(null);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(r.caret, r.caret); } });
  };
  const save = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/people/${encodeURIComponent(contactId)}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      setText(""); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const ordered = [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto" style={{ padding: "12px 18px" }}>
        {leadSource && (
          <div className="rounded mb-2.5" style={{ maxWidth: 640, background: T.card, border: `1px solid ${T.hair}`, padding: "6px 12px", fontSize: 12.5, color: T.ink2 }}>
            <span style={{ fontFamily: disp, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, fontSize: 11.5, marginRight: 6 }}>Lead source</span>{leadSource}
          </div>
        )}
        {ordered.length === 0 ? (
          <div className="text-center py-16" style={{ fontSize: F.sm, color: T.ink3, maxWidth: 400, margin: "0 auto" }}>
            No internal notes on {name ?? "them"} yet. Notes stay inside your organisation — nothing is sent — and Dusty reads them. Type @ to tag a teammate.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ordered.map((n) => archiveNote(n.body) ? (
              <ArchiveNoteCard key={n.id} body={n.body} at={n.created_at} who={who(n.created_by) === "You" ? "by you" : who(n.created_by) ? `by ${who(n.created_by)}` : null} />
            ) : (
              <div key={n.id} className="rounded" style={{ maxWidth: 640, background: T.hivizDim, border: `1px solid ${T.hair}`, padding: "8px 12px" }}>
                <div className="flex items-baseline gap-2" style={{ fontSize: 11.5, color: T.ink3 }}>
                  <span style={{ fontFamily: disp, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, color: T.ink2 }}>{who(n.created_by) ?? "Note"}</span>
                  <span>{relTime(n.created_at)}</span>
                  {n.message_id && <span>· on a call</span>}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 2 }}>
                  {noteParts(n.body).map((p, i) => p.user
                    ? <span key={i} className="rounded px-1" style={{ background: T.chalkDim, color: T.chalk, fontWeight: 600 }}>{p.text}</span>
                    : <React.Fragment key={i}>{p.text}</React.Fragment>)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="relative flex-shrink-0" style={{ borderTop: `1px solid ${T.hair}`, background: T.card, padding: "8px 12px" }}>
        {options.length > 0 && (
          <div className="absolute rounded overflow-hidden" role="listbox" aria-label="Tag a teammate"
            style={{ bottom: "100%", left: 12, marginBottom: 4, minWidth: 220, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 20px rgba(0,0,0,.15)", zIndex: 5 }}>
            {options.map((m, i) => (
              <button key={m.user_id} role="option" aria-selected={i === pick} onMouseDown={(e) => { e.preventDefault(); choose(m); }}
                className="w-full text-left px-3 py-1.5 flex items-baseline gap-2" style={{ background: i === pick ? T.slab : T.card, fontSize: F.sm, cursor: "pointer" }}>
                <span style={{ fontWeight: 600 }}>{memberName(m)}</span><span style={{ fontSize: 11, color: T.ink3 }}>{m.email}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ ...eyebrow, marginBottom: 4 }}>Internal note · only your team sees it · @ to tag</div>
        <div className="flex items-end gap-2">
          <textarea ref={box} value={text} rows={2} maxLength={4000} placeholder={`A note about ${name ?? "them"}…`}
            onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => {
              if (options.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % options.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + options.length) % options.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[pick]); return; }
                if (e.key === "Escape") { setTag(null); return; }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
            }}
            style={{ flex: 1, minWidth: 0, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "6px 8px", fontSize: F.sm, resize: "none", background: T.card, color: T.ink }} />
          <button onClick={() => void save()} disabled={!text.trim() || busy} className="rounded px-3"
            style={{ height: 36, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", opacity: !text.trim() || busy ? 0.5 : 1 }}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
      </div>
    </div>
  );
}
