"use client";
/**
 * Archived & deleted (migration 066; Coy, 2026-10-03). Every deleted customer and
 * job, newest first, each with Restore; archived threads are on Threads → Archived.
 * Nothing here was erased — the calls, texts and files stayed on record.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";

interface Row { id: string; title?: string | null; name?: string | null; address?: string | null; address_formatted?: string | null; archived_at: string; archived_reason: string | null }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ArchivedPage() {
  const [jobs, setJobs] = useState<Row[] | null>(null);
  const [customers, setCustomers] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    Promise.all([fetch("/api/archive?kind=job").then((r) => r.json()), fetch("/api/archive?kind=customer").then((r) => r.json())])
      .then(([j, c]) => { if (!off) { setJobs(j.items ?? []); setCustomers(c.items ?? []); } })
      .catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [tick]);
  const restore = useCallback(async (kind: "job" | "customer", id: string) => {
    const r = await fetch("/api/archive/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ids: [id] }) });
    if (!r.ok) setErr((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
    setTick((n) => n + 1);
  }, []);
  const list = (rows: Row[] | null, kind: "job" | "customer") => (
    <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      {rows === null && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>}
      {rows?.length === 0 && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>None.</div>}
      {rows?.map((r) => (
        <div key={r.id} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{(kind === "job" ? r.title : r.name) || (kind === "job" ? "Untitled job" : "Unnamed customer")}</div>
            <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
              {[r.address ?? r.address_formatted, `${r.archived_reason ?? "archived"} ${when(r.archived_at)}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={() => void restore(kind, r.id)} className="rounded px-2.5"
            style={{ ...eyebrow, height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, cursor: "pointer" }}>Restore</button>
        </div>
      ))}
    </div>
  );
  return (
    <div className="p-3 lg:p-5 flex flex-col gap-4" style={{ maxWidth: 820 }}>
      <div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, textTransform: "uppercase" }}>Archived &amp; deleted</div>
        <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45 }}>
          Nothing here was erased — the calls, texts and files are still on record. Restore puts it back in its lists.
          Archived threads are under <Link href="/dashboard/messages?f=archived" style={{ color: T.chalk }}>Threads → Archived</Link>.
        </div>
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      <section><div style={{ ...eyebrow, marginBottom: 4 }}>Customers</div>{list(customers, "customer")}</section>
      <section><div style={{ ...eyebrow, marginBottom: 4 }}>Jobs</div>{list(jobs, "job")}</section>
    </div>
  );
}
