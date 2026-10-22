"use client";
/**
 * Archive and delete from a page (migration 066; Coy, 2026-10-03): a thread, a
 * vendor, a customer or a job. Each is restorable — the toast offers Undo, and
 * the Archived lists bring anything back later. The toast lives in the
 * dashboard layout (ArchiveToast) so it survives leaving the page you deleted.
 */
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { T, F, eyebrow } from "@/lib/v34/tokens";
import { archiveNote, vendorRemovedNote, type ArchiveAction, type ArchiveKind } from "@/lib/archive";

export async function archiveNow(kind: ArchiveKind, ids: string[], action: ArchiveAction, via: "coy" | "dusty" = "coy", note: string | null = null) {
  const r = await fetch("/api/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ids, action, via, note }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sc:archived", { detail: { label: b.label, logId: b.log_id } }));
  return b as { log_id: string | null; count: number; label: string };
}

/**
 * The question before archiving or deleting, with a box for why (Coy, 2026-10-04:
 * "make a note as to why i'm archiving it so that dusty or any internal user can
 * see the reason … if the customer contacts me again we will have all of that
 * context"). The reason is optional; it is saved on the record and, for a
 * person, as an internal note.
 */
export function ArchiveDialog({ open, kind, action, what, count = 1, vendor = false, onCancel, onConfirm }: {
  open: boolean; kind: ArchiveKind; action: ArchiveAction; what: string; count?: number;
  /** Deleting a vendor: ask whether the contact is archived too (ticked to start). */
  vendor?: boolean;
  onCancel: () => void; onConfirm: (note: string | null, alsoArchive: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [also, setAlso] = useState(true);
  useEffect(() => { if (!open) return; const t = setTimeout(() => { setNote(""); setAlso(true); }, 0); return () => clearTimeout(t); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onCancel]);
  if (!open) return null;
  const extra = kind === "customer" ? " Their people and open jobs go with them." : "";
  const q = vendor
    ? `Delete ${what}${count > 1 ? "" : " as a vendor"}? Their prices stay in the Price book.`
    : action === "delete"
    ? `Delete ${what}?${extra} It leaves every list; the calls, texts and files stay on record, and you can restore it.`
    : `Archive ${what}? ${count > 1 ? "Each comes" : "It comes"} back on its own if they call or text again.`;
  const go = () => onConfirm(note.trim() || null, vendor ? also : true);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={action === "delete" ? "Delete" : "Archive"}>
      <button aria-label="Cancel" onClick={onCancel} className="absolute inset-0" style={{ background: "rgba(0,0,0,.4)", border: "none" }} />
      <div className="relative rounded-lg w-full" style={{ maxWidth: 440, background: T.card, color: T.ink, boxShadow: "0 12px 36px rgba(0,0,0,.3)", padding: "16px 16px 12px" }}>
        <div style={{ fontSize: F.md, fontWeight: 600, lineHeight: 1.35 }}>{q}</div>
        <label className="block" style={{ marginTop: 12 }}>
          <span style={{ ...eyebrow, color: T.ink3 }}>Why? · optional — your team and Dusty will see it</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} autoFocus
            placeholder={action === "delete" ? "e.g. Duplicate — the real one is under their company" : "e.g. Wrong number · Only wanted a price for later · Went with someone else"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}
            style={{ width: "100%", marginTop: 4, border: `1px solid ${T.hair}`, borderRadius: 6, padding: "8px 10px", fontSize: F.sm, resize: "none", background: T.card, color: T.ink }} />
        </label>
        {vendor && (
          <label className="flex items-start gap-2" style={{ marginTop: 8, fontSize: F.sm, cursor: "pointer" }}>
            <input type="checkbox" checked={also} onChange={(e) => setAlso(e.target.checked)} style={{ marginTop: 3, accentColor: T.red }} />
            <span><b>Also archive the contact</b>
              <span className="block" style={{ fontSize: F.xs, color: T.ink3 }}>
                {also ? "Out of Contacts and Threads until they call or text again; you can restore it." : "They stay in Contacts and Threads, back in Unsorted."}
              </span></span>
          </label>
        )}
        {count > 1 && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>The same reason goes on all {count}.</div>}
        <div className="flex justify-end gap-2" style={{ marginTop: 10 }}>
          <button onClick={onCancel} className="rounded px-3" style={{ height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, cursor: "pointer" }}>Cancel</button>
          <button onClick={go} className="rounded px-3" style={{ height: 34, background: action === "delete" ? T.red : T.ink, color: T.card, fontSize: F.sm, fontWeight: 600, cursor: "pointer" }}>
            {action === "delete" ? "Delete" : count > 1 ? `Archive ${count}` : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One button: ask (with why), archive or delete, then go back to the list.
 * `what` is how the question names it ("Delete Angelle Materials?").
 */
export function ArchiveButton({ kind, id, action, what, then, vendor = false, style, children }: {
  kind: ArchiveKind; id: string; action: ArchiveAction; what: string; then: string;
  /** Delete vendor (Coy, 2026-10-22): take the vendor filing off, and archive the contact only if ticked. */
  vendor?: boolean;
  style?: React.CSSProperties; children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const go = async (note: string | null, also: boolean) => {
    setAsking(false); setBusy(true);
    try {
      if (vendor) {
        const r = await fetch(`/api/contacts/${id}/bucket`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucket: null }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
        if (!also) {
          const body = vendorRemovedNote(note);
          if (body) await fetch(`/api/people/${id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => {});
          window.dispatchEvent(new CustomEvent("sc:archived", { detail: { label: "Taken off Vendors · still in Contacts, Unsorted", logId: null } }));
          router.push(then); return;
        }
      }
      await archiveNow(kind, [id], action, "coy", note); router.push(then);
    }
    catch (e) { window.alert(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setAsking(true)} disabled={busy} style={{ cursor: "pointer", opacity: busy ? 0.5 : 1, ...style }}>{busy ? "…" : children}</button>
      <ArchiveDialog open={asking} kind={kind} action={action} what={what} vendor={vendor} onCancel={() => setAsking(false)} onConfirm={(n, a) => void go(n, a)} />
    </>
  );
}

/** The toast with Undo, for any archive or delete in the app (mounted once, in the dashboard layout). */
export function ArchiveToast() {
  const [t, setT] = useState<{ label: string; logId: string | null } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ label: string; logId: string | null }>).detail;
      if (!d?.label) return;
      setT(d);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setT(null), 9000);
    };
    window.addEventListener("sc:archived", on);
    return () => { window.removeEventListener("sc:archived", on); if (timer) clearTimeout(timer); };
  }, []);
  if (!t) return null;
  const undo = async () => {
    const id = t.logId; setT(null);
    if (!id) return;
    await fetch(`/api/archive/${id}/undo`, { method: "POST" }).catch(() => {});
    window.dispatchEvent(new Event("sc:archive-undone"));
    window.location.reload();
  };
  return (
    <div className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[380px] bottom-[84px] lg:bottom-6 z-[60] rounded-lg px-3 flex items-center gap-2"
      role="status" style={{ height: 44, background: T.ink, color: T.card, boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
      <span style={{ fontSize: F.sm, flex: 1 }}>{t.label}</span>
      {t.logId && <button onClick={() => void undo()} style={{ ...eyebrow, color: T.hiviz, fontSize: F.sm, cursor: "pointer" }}>Undo</button>}
    </div>
  );
}

/**
 * An archive note, marked as one (Coy, 2026-10-04: "make the archive note stand
 * out") — a grey card with a box icon and ARCHIVED (DELETED in red), when and by
 * whom, and the reason big enough to read at a glance. Used in Internal notes
 * and in the timeline. Returns null for any other note.
 */
export function ArchiveNoteCard({ body, at, who }: { body: string; at: string; who?: string | null }) {
  const n = archiveNote(body);
  if (!n) return null;
  const c = n.verb === "Deleted" ? T.red : T.ink2;
  return (
    <div className="rounded" style={{ maxWidth: 640, background: T.slab, border: `1px solid ${T.hair}`, borderLeft: `3px solid ${c}`, padding: "8px 12px" }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: T.ink3 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h14v4H3z" /><path d="M4 8v8h12V8" /><path d="M8 11h4" /></svg>
        <span style={{ ...eyebrow, color: c, fontWeight: 700 }}>{n.verb}</span>
        <span>· {new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <span>· {n.byDusty ? "Dusty's plan, your tap" : who ?? "by you"}</span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.45, color: T.ink, marginTop: 3 }}>
        <span style={{ color: T.ink3 }}>Why: </span>{n.reason}
      </div>
    </div>
  );
}
