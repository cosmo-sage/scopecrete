"use client";

/**
 * The bid behind a job (migration 063, Coy 2026-10-01): what the bid reader
 * found in the forwarded email, its documents and the Box folder — the GC,
 * the estimator, when bids are due (red under 48 h), the pre-bid, the folder
 * — and the concrete scope it read, each item with the sheet and spec line
 * that shows it. Everything it made can be taken back with Undo bid.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, nums } from "@/lib/v34/tokens";

interface Bid {
  id: string; state: string; error: string | null; box_url: string | null; box_folder_name: string | null; email_id: string; packages: number
  facts: null | {
    project_name: string | null; gc_company: string | null; bid_due_text: string | null; bid_due_at: string | null; prebid_text: string | null
    estimator: { name: string | null; email: string | null; phone: string | null }; scope_summary: string | null; addendum?: boolean
  }
  files: { total: number; fetched: number; failed: number; scanned: number }; sheets: number
  made: { job: boolean; customer: boolean; contact: boolean }
  scope: Array<{ id: string; name: string | null; work_type: string; psi: number | null; depth_in: number | null; rebar: string | null; source_ref: string | null }>
}

const STATE: Record<string, string> = {
  waiting: "waiting for the email's attachments", listing: "listing the Box folder", fetching: "copying the files from Box",
  scanning: "reading the plans and specs", extracting: "Dusty is reading the bid", filing: "filing it", filed: "read",
  needs_setup: "needs the Box app keys", failed: "stuck", not_a_bid: "not a bid",
}

function due(at: string | null): { text: string; hot: boolean } | null {
  if (!at) return null
  const ms = Date.parse(at) - Date.now()
  const when = new Date(at).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  if (ms < 0) return { text: `${when} — passed`, hot: false }
  const h = Math.floor(ms / 3.6e6)
  return { text: `${when} · ${h < 48 ? `${h} h left` : `${Math.floor(h / 24)} days`}`, hot: h < 48 }
}

export function BidStrip({ jobId, onUndone, onSummary }: { jobId: string; onUndone: () => void
  /** The bid's scope summary, once loaded — the job header leaves out its copy of it. */
  onSummary?: (s: string | null) => void }) {
  const [bid, setBid] = useState<Bid | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  // Folded by default so it doesn't fill a phone (Coy, 2026-10-02); opening it is remembered.
  // (The strip draws nothing until its data arrives, so reading storage here can't mismatch the server's HTML.)
  const [open, setOpenState] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("sc:bid-open") === "1" } catch { return false } })
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem("sc:bid-open", v ? "1" : "0") } catch { /* no storage */ } }
  useEffect(() => {
    let off = false
    fetch(`/api/jobs/${jobId}/bid`).then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off) setBid(b?.bid ?? null) }).catch(() => {})
    return () => { off = true }
  }, [jobId, tick])
  useEffect(() => { onSummary?.(bid?.facts?.scope_summary ?? null) }, [bid, onSummary])
  // While the reader is still working, look again every 20 s.
  const working = !!bid && !["filed", "not_a_bid", "failed", "needs_setup"].includes(bid.state)
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => setTick((n) => n + 1), 20_000)
    return () => clearInterval(t)
  }, [working])
  if (!bid) return null

  const f = bid.facts
  const d = due(f?.bid_due_at ?? null)
  const undo = async () => {
    const what = [bid.made.job && "this job (archived)", bid.made.contact && "the contact it made", bid.made.customer && "the customer it made"].filter(Boolean).join(", ")
    if (!window.confirm(`Undo this bid? ${what ? `Takes back ${what}; ` : ""}the Box files it copied are hidden and the email goes back to Unfiled. Nothing is deleted.`)) return
    setBusy(true); setErr(null)
    const r = await fetch(`/api/bids/${bid.id}/undo`, { method: "POST" })
    const b = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return }
    onUndone()
  }
  const row = (label: string, v: React.ReactNode) => v ? (
    <div className="flex gap-2" style={{ fontSize: F.sm, minWidth: 0 }}>
      <span style={{ ...eyebrow, width: 74, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: T.ink }}>{v}</span>
    </div>
  ) : null

  return (
    // Full width like the section cards under it (Coy, 2026-10-02: "needs to be the same width as everything else").
    <section style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, marginBottom: 8 }} aria-label="The bid">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: open ? `1px solid ${T.hairSoft}` : "none" }}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5" style={{ cursor: "pointer", color: T.ink }}>
          <span aria-hidden="true" style={{ fontSize: 10, color: T.ink3, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Bid</span>
        </button>
        {!open && d && <span style={{ fontSize: F.xs, color: d.hot ? T.red : T.ink2, ...nums, ...clip, minWidth: 0 }}>due {d.text}</span>}
        <span style={{ fontSize: F.xs, color: bid.state === "filed" ? T.green : ["failed", "needs_setup"].includes(bid.state) ? T.red : T.ink3 }}>
          {STATE[bid.state] ?? bid.state}{bid.packages > 1 ? ` · ${bid.packages} emails` : ""}
        </span>
        <span className="flex-1" />
        <Link href={`/dashboard/documents?email=${bid.email_id}`} style={{ ...eyebrow, color: T.chalk }}>Email</Link>
        <button onClick={() => void undo()} disabled={busy} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>{busy ? "…" : "Undo bid"}</button>
      </div>
      {open && <><div className="px-3 py-2 flex flex-col gap-1">
        {row("Project", f?.project_name)}
        {row("GC", f?.gc_company)}
        {row("Estimator", f?.estimator?.name || f?.estimator?.email ? (
          <span>{f.estimator.name}{f.estimator.email ? <> · <a href={`mailto:${f.estimator.email}`} style={{ color: T.chalk }}>{f.estimator.email}</a></> : null}{f.estimator.phone ? <> · <a href={`tel:${f.estimator.phone}`} style={{ color: T.chalk }}>{f.estimator.phone}</a></> : null}</span>
        ) : null)}
        {row("Bids due", d ? <span style={{ color: d.hot ? T.red : T.ink, fontWeight: d.hot ? 600 : 400, ...nums }}>{d.text}</span> : f?.bid_due_text)}
        {row("Pre-bid", f?.prebid_text)}
        {row("Box", bid.box_url ? (
          <span><a href={bid.box_url} target="_blank" rel="noreferrer" style={{ color: T.chalk }}>{bid.box_folder_name ?? "the shared folder"}</a>
            <span style={{ color: T.ink3 }}> · {bid.files.fetched}/{bid.files.total} files copied{bid.files.failed ? `, ${bid.files.failed} failed` : ""} · {bid.sheets} sheets read</span></span>
        ) : bid.files.total ? <span style={{ color: T.ink3 }}>{bid.files.total} attachment{bid.files.total === 1 ? "" : "s"} · {bid.sheets} sheets read</span> : null)}
        {bid.error && <div style={{ fontSize: F.xs, color: T.red }}>{bid.error}</div>}
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      </div>
      {(bid.scope.length > 0 || f?.scope_summary) && (
        <div className="px-3 pb-2.5">
          <div className="flex items-baseline gap-2 mb-1">
            <span style={{ ...eyebrow, color: T.ink }}>Scope from the bid</span>
            <span className="flex-1" />
            {bid.sheets > 0 && <Link href={`/dashboard/scope/${jobId}/plans`} style={{ ...eyebrow, color: T.chalk }}>Plan room ›</Link>}
          </div>
          {f?.scope_summary && <p style={{ fontSize: F.sm, color: T.ink2, margin: "0 0 6px", lineHeight: 1.45 }}>{f.scope_summary}</p>}
          {bid.scope.map((s) => (
            <div key={s.id} className="py-1" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              <div className="flex items-baseline gap-2" style={{ fontSize: F.sm }}>
                <span style={{ fontWeight: 600, flex: 1, minWidth: 0, ...clip }}>{s.name}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{[s.psi && `${s.psi} psi`, s.depth_in && `${s.depth_in}"`, s.rebar].filter(Boolean).join(" · ")}</span>
              </div>
              {s.source_ref && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }} title={s.source_ref}>{s.source_ref}</div>}
            </div>
          ))}
        </div>
      )}
      </>}
    </section>
  )
}
