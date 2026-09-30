"use client";

/**
 * Two corrections Coy makes from a person's own page (2026-09-28):
 *  - NameEditor: the pencil. "This customer's name was not Gary Davis, it was
 *    Vance." Saves through PATCH /api/contacts/[id]/name as Coy's name.
 *  - FileAsSheet: the bucket picker in a sheet, so a vendor filed wrong — or
 *    anyone unsorted — can be moved without going back to Threads.
 */

import React, { useEffect, useRef, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { T, F, disp } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { BucketPicker, type Bucket, type PickTarget, type Subtype } from "@/components/v34/bucket-picker";

async function patch(url: string, body: unknown) {
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** The name as a heading, with a pencil; tapping it makes the name editable in place. */
export function NameEditor({ contactId, name, fallback, onSaved, style }: {
  contactId: string; name: string | null; fallback: string;
  onSaved: (name: string) => void; style: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  const save = async () => {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true); setErr(null);
    try { await patch(`/api/contacts/${contactId}/name`, { name: v }); onSaved(v); setEditing(false); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
            aria-label="Name" placeholder="Their name"
            className="flex-1 min-w-0 rounded px-2"
            style={{ height: 30, border: `1px solid ${T.ink}`, fontSize: F.md, background: T.card, color: T.ink }} />
          <button onClick={() => void save()} disabled={busy || !draft.trim()} className="rounded px-2.5"
            style={{ height: 30, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em",
                     textTransform: "uppercase", border: "none", opacity: busy || !draft.trim() ? 0.5 : 1 }}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setEditing(false); setDraft(name ?? ""); setErr(null); }} className="rounded px-2"
            style={{ height: 30, background: "none", border: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2 }}>
            Cancel
          </button>
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 2 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      {/* Two lines before it clips (Coy: "the name needs to fit"). */}
      <span style={{ ...style, minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{name ?? fallback}</span>
      <button onClick={() => { setDraft(name ?? ""); setEditing(true); }} aria-label={name ? "Change name" : "Add a name"}
        className="shrink-0 inline-flex items-center justify-center rounded"
        style={{ width: 26, height: 26, background: "none", border: "none", cursor: "pointer", color: T.ink3 }}>
        <PencilSimple size={14} />
      </button>
    </div>
  );
}

/** The four buckets and their types, in a sheet. Tapping one files them and closes. */
export function FileAsSheet({ open, onClose, contactId, target, subtypes: given, onFiled }: {
  open: boolean; onClose: () => void; contactId: string; target: PickTarget;
  subtypes?: Subtype[]; onFiled: (bucket: Bucket | null) => void;
}) {
  const [subtypes, setSubtypes] = useState<Subtype[]>(given ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || given?.length) return;
    let off = false;
    fetch("/api/contacts/subtypes").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && Array.isArray(d?.subtypes)) setSubtypes(d.subtypes); }).catch(() => {});
    return () => { off = true; };
  }, [open, given]);

  const pick = async (bucket: Bucket | null, subtype?: string | null) => {
    setBusy(true); setErr(null);
    try { await patch(`/api/contacts/${contactId}/bucket`, { bucket, subtype: subtype ?? null }); onFiled(bucket); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={target.bucket ? "Change bucket" : "File as"} below
      sub="Vendors and subs stop making leads">
      <div className="px-4 pb-4">
        <BucketPicker t={target} busy={busy} subtypes={subtypes} onPick={(b, s) => void pick(b, s)} />
        {target.bucket && !target.bucket_auto && (
          <button onClick={() => void pick(null)} disabled={busy} className="mt-3 rounded px-3"
            style={{ height: 30, background: "none", border: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2 }}>
            Back to Unsorted
          </button>
        )}
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
      </div>
    </Sheet>
  );
}
