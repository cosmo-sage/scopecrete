"use client";

/**
 * The job header's four categories — Status · Type · Source · Vendors (Coy,
 * 2026-09-28: "each category should be clickable and expand with a popup that
 * shows the list of selection options"). Each chip shows what is set, or asks
 * with a "?"; tapping opens a sheet of the choices. Saving goes through the
 * existing routes: PATCH /api/jobs/[id] and /api/jobs/[id]/vendors.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, formatPhone } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { JOB_TYPE_LABEL, LEAD_SOURCES, STAGES, STATUS_NAME, stageOf } from "@/lib/jobs/stages";

export interface ChipJob { id: string; status: string | null; job_type: string | null; lead_source: string | null }
type Field = "status" | "job_type" | "lead_source";
type Crew = { contact_id: string; name: string | null; phone: string | null; role: string | null };
type Vendor = { id: string; name: string | null; phone: string | null; subtype: string | null };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const words = (s: string | null) => (s ?? "").replace(/_/g, " ");

export function JobChips({ job, onSet }: {
  job: ChipJob;
  /** Save one field; resolves when the server has it. */
  onSet: (field: Field, value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<null | "status" | "type" | "source" | "vendors">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [crew, setCrew] = useState<Crew[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    fetch(`/api/jobs/${job.id}/vendors`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setCrew(Array.isArray(b?.vendors) ? b.vendors : []); }).catch(() => {});
    return () => { off = true; };
  }, [job.id, tick]);
  useEffect(() => {
    if (open !== "vendors" || vendors.length) return;
    let off = false;
    fetch("/api/people?bucket=vendor").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && Array.isArray(b?.people)) setVendors(b.people); }).catch(() => {});
    return () => { off = true; };
  }, [open, vendors.length]);

  const pick = async (field: Field, value: string) => {
    setBusy(true); setErr(null);
    try { await onSet(field, value); setOpen(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const crewRun = async (p: Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await p; setTick((n) => n + 1); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const stage = stageOf(job.status);
  const source = LEAD_SOURCES.find((l) => l.k === job.lead_source)?.label ?? null;
  const type = job.job_type ? JOB_TYPE_LABEL[job.job_type] ?? job.job_type : null;

  const chip = (set: boolean, colour: string = T.ink): React.CSSProperties => ({
    height: 28, padding: "0 9px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 5,
    fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".04em",
    border: `1px ${set ? "solid" : "dashed"} ${set ? colour : T.ink3}`, background: T.card, color: set ? colour : T.ink3,
  });
  const caret = <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.7 }}>▾</span>;
  const row = (on: boolean): React.CSSProperties => ({
    width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 4, cursor: busy ? "default" : "pointer",
    border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink,
    fontSize: F.sm, opacity: busy ? 0.6 : 1,
  });
  const free = vendors.filter((v) => !(crew ?? []).some((c) => c.contact_id === v.id));
  const bySubtype = free.reduce<Record<string, Vendor[]>>((m, v) => {
    const k = words(v.subtype) || "other";
    (m[k] ??= []).push(v);
    return m;
  }, {});

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 8 }}>
        <button style={chip(true, T.hiviz)} onClick={() => setOpen("status")} aria-label="Job status">
          <span style={{ color: T.ink3 }}>Status</span> {stage.label}
          {stage.statuses.length > 1 && job.status && STATUS_NAME[job.status] !== stage.label ? ` · ${STATUS_NAME[job.status]}` : ""} {caret}
        </button>
        <button style={chip(!!type)} onClick={() => setOpen("type")} aria-label="Job type">
          {type ?? "Type?"} {caret}
        </button>
        <button style={chip(!!source)} onClick={() => setOpen("source")} aria-label="Lead source">
          {source ?? "Source?"} {caret}
        </button>
        <button style={chip(!!crew?.length, T.chalk)} onClick={() => setOpen("vendors")} aria-label="Vendors on this job">
          Vendors{crew ? ` (${crew.length})` : ""} {caret}
        </button>
      </div>
      {err && !open && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}

      <Sheet open={open === "status"} onClose={() => setOpen(null)} title="Job status" below>
        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {STAGES.map((s) => (
            <div key={s.k}>
              <button disabled={busy} style={row(stage.k === s.k && s.statuses.length === 1)}
                onClick={() => { if (!s.statuses.includes(job.status ?? "")) void pick("status", s.enter); else setOpen(null); }}>
                {s.label}
              </button>
              {s.statuses.length > 1 && stage.k === s.k && (
                <div className="flex gap-1 flex-wrap" style={{ marginTop: 4, paddingLeft: 10 }}>
                  {s.statuses.map((st) => (
                    <button key={st} disabled={busy} onClick={() => void pick("status", st)} className="rounded-full px-2.5"
                      style={{ height: 26, fontSize: F.xs, cursor: "pointer", border: `1px solid ${job.status === st ? T.ink : T.hair}`,
                               background: job.status === st ? T.ink : T.card, color: job.status === st ? T.card : T.ink2 }}>
                      {STATUS_NAME[st] ?? st}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        </div>
      </Sheet>

      <Sheet open={open === "type"} onClose={() => setOpen(null)} title="Job type" below>
        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {Object.entries(JOB_TYPE_LABEL).map(([k, l]) => (
            <button key={k} disabled={busy} style={row(job.job_type === k)} onClick={() => void pick("job_type", k)}>{l}</button>
          ))}
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        </div>
      </Sheet>

      <Sheet open={open === "source"} onClose={() => setOpen(null)} title="How it reached you" below>
        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {LEAD_SOURCES.map((l) => (
            <button key={l.k} disabled={busy} style={row(job.lead_source === l.k)} onClick={() => void pick("lead_source", l.k)}>{l.label}</button>
          ))}
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        </div>
      </Sheet>

      <Sheet open={open === "vendors"} onClose={() => setOpen(null)} title="Crew & suppliers" below
        sub="Subs, suppliers and rentals on this job">
        <div className="px-4 pb-4">
          <div style={{ ...eyebrow, color: T.ink3, marginBottom: 4 }}>On this job</div>
          {!crew?.length && <div style={{ fontSize: F.sm, color: T.ink3, marginBottom: 8 }}>Nobody yet.</div>}
          {(crew ?? []).map((c) => (
            <div key={c.contact_id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <Link href={`/dashboard/messages/${c.contact_id}`} className="flex-1 min-w-0" style={{ color: T.chalk, fontSize: F.sm }}>
                {c.name ?? formatPhone(c.phone)}
              </Link>
              {c.role && <span style={{ fontSize: F.xs, color: T.ink3 }}>{words(c.role)}</span>}
              <button disabled={busy} onClick={() => void crewRun(send(`/api/jobs/${job.id}/vendors?contact_id=${c.contact_id}`, "DELETE"))}
                style={{ fontSize: F.xs, color: T.red, cursor: "pointer" }}>Remove</button>
            </div>
          ))}
          <div style={{ ...eyebrow, color: T.ink3, margin: "12px 0 4px" }}>Add</div>
          {!free.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>No other vendors filed yet. File someone as a vendor on Threads.</div>}
          {Object.entries(bySubtype).map(([g, vs]) => (
            <div key={g} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: F.xs, color: T.ink2, textTransform: "capitalize", marginBottom: 3 }}>{g}</div>
              <div className="flex flex-col gap-1">
                {vs.map((v) => (
                  <button key={v.id} disabled={busy} style={row(false)}
                    onClick={() => void crewRun(send(`/api/jobs/${job.id}/vendors`, "POST", { contact_id: v.id }))}>
                    + {v.name ?? formatPhone(v.phone)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        </div>
      </Sheet>
    </>
  );
}
