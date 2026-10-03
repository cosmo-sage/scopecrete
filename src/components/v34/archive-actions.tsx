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
import type { ArchiveAction, ArchiveKind } from "@/lib/archive";

export async function archiveNow(kind: ArchiveKind, ids: string[], action: ArchiveAction, via: "coy" | "dusty" = "coy") {
  const r = await fetch("/api/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ids, action, via }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sc:archived", { detail: { label: b.label, logId: b.log_id } }));
  return b as { log_id: string | null; count: number; label: string };
}

/**
 * One button: confirm, archive or delete, then go back to the list. `what` is
 * how the confirm names it ("Delete Angelle Materials?").
 */
export function ArchiveButton({ kind, id, action, what, then, style, children }: {
  kind: ArchiveKind; id: string; action: ArchiveAction; what: string; then: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const extra = kind === "customer" ? " Their people and open jobs go with them." : "";
    const q = action === "delete"
      ? `Delete ${what}?${extra} It leaves every list; the calls, texts and files stay on record, and you can restore it.`
      : `Archive ${what}? It comes back on its own if they call or text again.`;
    if (!window.confirm(q)) return;
    setBusy(true);
    try { await archiveNow(kind, [id], action); router.push(then); }
    catch (e) { window.alert(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return <button onClick={() => void go()} disabled={busy} style={{ cursor: "pointer", opacity: busy ? 0.5 : 1, ...style }}>{busy ? "…" : children}</button>;
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
