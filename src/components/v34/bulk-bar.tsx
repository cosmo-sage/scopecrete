"use client";
/**
 * The black bar under a list with rows ticked (Coy, 2026-10-22: "i need to be able
 * to bulk edit / delete vendors, customers, jobs and contacts"). Vendors, Customers,
 * Jobs (the Scope Builder list) and Contacts use it: "N selected", Clear, **Edit ▾**
 * — the page's fields, each a row of choices that sets them on every ticked one —
 * and **Delete**, the same restorable delete as one record's, with the Why? box
 * and Undo. A page adds its own buttons (Vendors' Group text and bid request).
 */
import React, { useState } from "react";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { ArchiveDialog, archiveNow } from "@/components/v34/archive-actions";
import { bulkLabel, runEach } from "@/lib/bulk";
import { vendorRemovedNote, type ArchiveKind } from "@/lib/archive";

export interface BulkEdit {
  k: string; label: string;
  options: Array<{ k: string; label: string }>;
  /** Sets the choice on one record; throws with the reason when it can't. */
  apply: (id: string, value: string) => Promise<void>;
  /** "Set {n} to Commercial" — {n} becomes "4 customers". */
  did: (label: string) => string;
}

/** fetch → throws with the server's words. */
export async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { error?: string })?.error || `HTTP ${r.status}`);
  return b;
}

const toast = (label: string) => window.dispatchEvent(new CustomEvent("sc:archived", { detail: { label, logId: null } }));

/** A row's tick box. */
export function BulkTick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} role="checkbox" aria-checked={on} aria-label={label} className="shrink-0 flex items-center justify-center"
      style={{ width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${on ? T.green : T.hairStrong}`, background: on ? T.green : "transparent", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>
      {on ? "✓" : ""}
    </button>
  );
}

export function BulkBar({ kind, ids, what, names, wide, onClear, onDone, edits = [], vendor = false, summary, extra }: {
  kind: ArchiveKind; ids: string[];
  /** ["customer", "customers"] */
  what: [string, string];
  names: string[]; wide: boolean;
  onClear: () => void;
  /** After an edit or delete: reload the list and clear the ticks. */
  onDone: () => void;
  edits?: BulkEdit[];
  /** Vendors: deleting takes the vendor filing off, and archives the contacts only if ticked. */
  vendor?: boolean;
  summary?: React.ReactNode; extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const n = ids.length;
  const noun = n === 1 ? what[0] : what[1];

  const edit = async (e: BulkEdit, value: string, label: string) => {
    setEditing(false); setBusy(`Saving 0 of ${n}…`);
    const r = await runEach(ids, (id) => e.apply(id, value), 4, (d) => setBusy(`Saving ${d} of ${n}…`));
    setBusy(null);
    toast(bulkLabel(r, what, e.did(label)));
    if (r.ok.length) onDone();
  };

  const del = async (note: string | null, also: boolean) => {
    setAsking(false); setBusy("Deleting…");
    try {
      if (vendor) {
        const r = await runEach(ids, (id) => send(`/api/contacts/${id}/bucket`, "PATCH", { bucket: null }));
        if (!r.ok.length) throw new Error(r.failed[0]?.error ?? "Nothing changed.");
        if (also) await archiveNow("contact", r.ok, "delete", "coy", note);
        else {
          const body = vendorRemovedNote(note);
          if (body) await runEach(r.ok, (id) => send(`/api/people/${id}/notes`, "POST", { body }));
          toast(`Took ${r.ok.length} off Vendors · still in Contacts, Unsorted${r.failed.length ? ` — ${r.failed.length} couldn't be changed` : ""}`);
        }
      } else {
        await archiveNow(kind, ids, "delete", "coy", note);
      }
      onDone();
    } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const ghost: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: 4, border: "1px solid #5A554E", color: "#fff", fontSize: F.xs, cursor: "pointer", whiteSpace: "nowrap" };
  return (
    <>
      <div className="fixed sc-select-bar flex items-center gap-2 px-4" role="region" aria-label={`Picked ${what[1]}`}
        style={{ left: 0, right: 0, bottom: "calc(var(--sc-foot, 0px) + 10px)", margin: "0 auto", width: "min(980px, calc(100% - 24px))", minHeight: 52, background: "#1F1D1A", color: "#fff", borderRadius: 6, zIndex: 40, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, whiteSpace: "nowrap" }}>{n} selected</span>
        {busy ? <span style={{ fontSize: F.xs, color: "#C9C3B8", flex: 1 }}>{busy}</span>
          : wide ? <span style={{ fontSize: F.xs, color: "#C9C3B8", flex: 1, minWidth: 0, ...clip }}>{names.join(", ")}</span>
          : <span style={{ flex: 1 }} />}
        {!busy && wide && summary}
        <button onClick={onClear} disabled={!!busy} style={{ fontSize: F.xs, color: "#C9C3B8", textDecoration: "underline", cursor: "pointer" }}>Clear</button>
        {edits.length > 0 && (
          <div className="relative">
            <button onClick={() => setEditing((o) => !o)} disabled={!!busy} aria-expanded={editing} style={ghost}>Edit ▾</button>
            {editing && <button aria-label="Close" onClick={() => setEditing(false)} className="fixed inset-0" style={{ cursor: "default", zIndex: 1 }} />}
            {editing && (
              <div className="absolute rounded p-2 flex flex-col gap-2" role="menu"
                style={{ bottom: 42, right: wide ? 0 : -120, width: "min(340px, calc(100vw - 24px))", maxHeight: "60vh", overflowY: "auto", background: T.card, color: T.ink, border: `1px solid ${T.hair}`, boxShadow: "0 10px 30px rgba(0,0,0,.25)", zIndex: 2 }}>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>Set on all {n} {noun}</div>
                {edits.map((e) => (
                  <div key={e.k}>
                    <div style={{ ...eyebrow, marginBottom: 4 }}>{e.label}</div>
                    <div className="flex flex-wrap gap-1">
                      {e.options.map((o) => (
                        <button key={o.k} role="menuitem" onClick={() => void edit(e, o.k, o.label)} className="rounded"
                          style={{ height: 28, padding: "0 10px", border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.xs, cursor: "pointer" }}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setAsking(true)} disabled={!!busy} style={{ ...ghost, border: `1px solid ${T.red}`, color: "#F2B8AE" }}>Delete</button>
        {extra}
      </div>
      <ArchiveDialog open={asking} kind={kind} action="delete" count={n} vendor={vendor}
        what={n === 1 ? (names[0] ?? `this ${what[0]}`) : `these ${n} ${what[1]}`}
        onCancel={() => setAsking(false)} onConfirm={(note, also) => void del(note, also)} />
    </>
  );
}
