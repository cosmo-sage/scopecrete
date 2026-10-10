"use client";

/**
 * Put a customer on a job they aren't on yet (Coy, 2026-10-10: "Here I should be able to add this
 * customer to an existing job. Or start a new job."). Search the org's jobs, pick one: PATCH
 * /api/jobs/[id] {customer_id} moves the job onto this customer, its person becoming the customer's
 * primary unless already one of theirs. Used on the customer page and in Dusty's customer question.
 */

import React, { useEffect, useState } from "react";
import { T, F } from "@/lib/v34/tokens";

type JobRow = { id: string; title: string | null; city: string | null; contact_name?: string | null };

export function JobPickList({ customerId, exclude, onDone, font }: {
  customerId: string; exclude?: string[]; onDone: (jobId: string) => void; font?: string;
}) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/jobs").then((r) => (r.ok ? r.json() : { jobs: [] })).then((b) => { if (!off) setJobs(b.jobs ?? []); }).catch(() => { if (!off) setJobs([]); });
    return () => { off = true; };
  }, []);
  const skip = new Set(exclude ?? []);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (jobs ?? []).filter((j) => !skip.has(j.id) && words.every((w) => [j.title, j.city, j.contact_name].filter(Boolean).join(" ").toLowerCase().includes(w))).slice(0, 12);
  const pick = async (id: string) => {
    setBusy(id); setErr(null);
    const r = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customerId }) });
    const b = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErr(b?.error ?? "Couldn't add them to that job."); return; }
    onDone(id);
  };
  return (
    <div style={{ fontFamily: font }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which job? Name, customer, city…" autoFocus aria-label="Find a job"
        className="w-full rounded" style={{ height: 34, padding: "0 10px", border: `1px solid ${T.hairStrong}`, background: T.card, fontSize: F.sm, color: T.ink, fontFamily: font }} />
      <div className="flex flex-col" style={{ marginTop: 6, maxHeight: 300, overflowY: "auto" }}>
        {!jobs && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>Finding your jobs…</div>}
        {jobs && shown.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>No job by that name.</div>}
        {shown.map((j) => (
          <button key={j.id} disabled={!!busy} onClick={() => void pick(j.id)} className="text-left"
            style={{ padding: "8px 2px", borderBottom: `1px solid ${T.hairSoft}`, background: "none", cursor: "pointer", fontFamily: font, opacity: busy && busy !== j.id ? 0.5 : 1 }}>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: T.ink }}>{busy === j.id ? "Adding…" : j.title || "Untitled job"}</div>
            {(j.contact_name || j.city) && <div style={{ fontSize: F.xs, color: T.ink3 }}>{[j.contact_name, j.city].filter(Boolean).join(" · ")}</div>}
          </button>
        ))}
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
