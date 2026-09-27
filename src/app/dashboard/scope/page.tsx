"use client";

/**
 * Jobs — the board (DECISIONS §6). Threads is people; this is the work.
 *
 * One column per stage: New lead · Consultation · Estimating · Follow up ·
 * W.I.P. · Complete · Lost (src/lib/jobs/stages.ts maps them onto
 * jobs.status). On a phone the stage strip sits on top and the columns swipe
 * sideways, one per screen; on desktop all seven sit side by side.
 *
 * A card is a job: who it is for, where, residential / commercial /
 * government, how it reached us ("via Jeremy"), how many sections are scoped.
 * Tap the title for the scope builder; Move sends it to another stage.
 *
 * An unreviewed machine job is shown but marked "Suggested" with Accept — it
 * never counts until a person accepts it (DECISIONS §2b).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, Sheet } from "@/components/v34/primitives";
import { STAGES, STATUS_TAG, STATUS_NAME, JOB_TYPE_LABEL, LEAD_SOURCES, stageOf } from "@/lib/jobs/stages";

interface Job {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  origin: string | null;
  confirmed_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string | null;
  stage_changed_at: string | null;
  job_type: string | null;
  lead_source: string | null;
  referred_by_name: string | null;
  section_count: number;
  counts_toward_value: boolean;
}

const SOURCE_LABEL = Object.fromEntries(LEAD_SOURCES.map((l) => [l.k, l.label]));

export default function JobsBoard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [moving, setMoving] = useState<Job | null>(null);
  const [col, setCol] = useState(0);
  const lane = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/jobs")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) {
          if (b?.code === "no_org") { setNoOrg(true); setJobs([]); return; }
          throw new Error(b?.error || `HTTP ${r.status}`);
        }
        setJobs(Array.isArray(b.jobs) ? b.jobs : []);
      })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [reload]);

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || `HTTP ${r.status}`); }
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // The strip and the swipe are one control: tapping a stage scrolls to its
  // column; swiping the columns moves the highlighted stage.
  function goTo(i: number) {
    setCol(i);
    const el = lane.current;
    if (el) el.scrollTo({ left: (el.scrollWidth / STAGES.length) * i, behavior: "smooth" });
  }
  function onScroll() {
    const el = lane.current;
    if (!el || el.clientWidth >= el.scrollWidth - 4) return; // desktop: everything visible
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== col && i >= 0 && i < STAGES.length) setCol(i);
  }

  if (noOrg) {
    return <EmptyState tone="warn" title="This account isn't a member of any organisation"
      detail="You are signed in, but nothing is shared with this account yet." />;
  }
  if (error && jobs === null) return <EmptyState tone="warn" title="Couldn't load jobs" detail={error} />;

  const byStage = STAGES.map((s) => (jobs ?? []).filter((j) => stageOf(j.status).k === s.k));

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 140px)" }}>
      <NewJobSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <MoveSheet job={moving} onClose={() => setMoving(null)}
        onMove={(status) => { const j = moving; setMoving(null); if (j) void patch(j.id, { status }); }} />

      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2">
          <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, flex: 1 }}>Jobs</div>
          <button onClick={() => setNewOpen(true)} className="rounded px-3"
            style={{ height: 34, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.sm, fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
            + New job
          </button>
        </div>
        {error && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{error}</div>}

        {/* Stage strip — phone only; desktop shows every column's header. */}
        <div className="flex gap-1.5 overflow-x-auto mt-2 lg:hidden" style={{ scrollbarWidth: "none" }}>
          {STAGES.map((s, i) => (
            <button key={s.k} onClick={() => goTo(i)} className="shrink-0 rounded px-2.5 flex items-center gap-1.5"
              style={{ height: 30, border: `1px solid ${col === i ? T.ink : T.hair}`, background: col === i ? T.ink : T.card,
                       color: col === i ? "#fff" : T.ink2, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", cursor: "pointer" }}>
              {s.label}
              <span style={{ ...nums, fontSize: F.xs, opacity: 0.8 }}>{jobs ? byStage[i].length : "·"}</span>
            </button>
          ))}
        </div>
      </div>

      {jobs === null ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 70, background: T.hairSoft }} />)}
        </div>
      ) : (
        <div ref={lane} onScroll={onScroll}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory lg:snap-none lg:gap-2 lg:p-2"
          style={{ scrollbarWidth: "none" }}>
          {STAGES.map((s, i) => (
            <section key={s.k} className="snap-start shrink-0 w-full lg:w-auto lg:flex-1 lg:min-w-[200px] flex flex-col"
              aria-label={s.label}>
              <div className="hidden lg:flex items-baseline gap-2 px-2 py-1.5">
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</span>
                <span style={{ ...nums, fontSize: F.xs, color: T.ink3 }}>{byStage[i].length}</span>
              </div>
              <div className="flex-1 px-2.5 py-2 lg:px-0 lg:py-0 space-y-2">
                {byStage[i].length === 0 ? (
                  <div className="rounded px-3 py-4 text-center" style={{ fontSize: F.xs, color: T.ink3, border: `1px dashed ${T.hair}` }}>
                    {jobs.length === 0 && i === 0
                      ? "No jobs yet. + New job starts one — a job is the container from first contact onward."
                      : `Nothing in ${s.label}.`}
                  </div>
                ) : byStage[i].map((j) => (
                  <JobCard key={j.id} j={j} busy={busy === j.id}
                    next={i < STAGES.length - 2 ? STAGES[i + 1] : null}
                    onNext={(status) => void patch(j.id, { status })}
                    onMove={() => setMoving(j)}
                    onAccept={() => void patch(j.id, { accept: true })} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function JobCard({ j, busy, next, onNext, onMove, onAccept }: {
  j: Job; busy: boolean; next: (typeof STAGES)[number] | null;
  onNext: (status: string) => void; onMove: () => void; onAccept: () => void;
}) {
  const who = j.contact_name?.trim() || (j.contact_phone ? formatPhone(j.contact_phone) : "No customer yet");
  const tag = j.status ? STATUS_TAG[j.status] : null;
  const since = relTime(j.stage_changed_at ?? j.created_at);
  const source = j.referred_by_name ? `via ${j.referred_by_name}` : j.lead_source ? SOURCE_LABEL[j.lead_source] : null;
  const small = (c: string): React.CSSProperties => ({ ...eyebrow, fontSize: F.micro, color: c });
  const btn: React.CSSProperties = {
    height: 28, padding: "0 10px", borderRadius: 3, border: `1px solid ${T.hair}`, background: T.card,
    fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase",
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1, color: T.ink2, whiteSpace: "nowrap",
  };

  return (
    <div className="rounded px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.hair}`, color: T.ink }}>
      <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
        <Link href={`/dashboard/scope/${j.id}`} className="no-underline"
          style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, ...clip, flex: 1, minWidth: 0 }}>
          {j.title || j.address || "Untitled job"} ›
        </Link>
        {since && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{since}</span>}
      </div>
      <div style={{ fontSize: F.xs, color: T.ink2, ...clip, marginTop: 1 }}>
        {who}{j.address && j.title ? ` · ${j.address}` : ""}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5" style={{ marginTop: 4 }}>
        {tag && <span style={small(T.hiviz)}>{tag}</span>}
        {j.job_type && <span style={small(T.chalk)}>{JOB_TYPE_LABEL[j.job_type] ?? j.job_type}</span>}
        {source && <span style={small(T.violet)}>{source}</span>}
        <span style={small(j.section_count ? T.ink3 : T.hiviz)}>
          {j.section_count ? `${j.section_count} section${j.section_count === 1 ? "" : "s"}` : "Not scoped"}
        </span>
      </div>
      <div className="flex items-center gap-1.5" style={{ marginTop: 8 }}>
        {!j.counts_toward_value ? (
          <>
            <span style={{ ...eyebrow, color: T.hiviz, flex: 1 }}>Suggested — not counted</span>
            <button disabled={busy} onClick={onAccept} style={{ ...btn, background: T.ink, color: "#fff", borderColor: T.ink }}>Accept</button>
          </>
        ) : (
          <>
            <span className="flex-1" style={{ minWidth: 0 }} />
            <button disabled={busy} onClick={onMove} style={{ ...btn, flexShrink: 0 }}>Move</button>
            {next && (
              <button disabled={busy} onClick={() => onNext(next.enter)} title={`Move to ${next.label}`}
                style={{ ...btn, color: T.ink, borderColor: T.ink3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {next.label} ›
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ move */

function MoveSheet({ job, onClose, onMove }: { job: Job | null; onClose: () => void; onMove: (status: string) => void }) {
  const here = job ? stageOf(job.status) : null;
  return (
    <Sheet open={!!job} onClose={onClose} title="Move job" sub={job?.title || job?.address || "Untitled job"}>
      <div className="p-2">
        {STAGES.map((s) => (
          <div key={s.k}>
            <button onClick={() => onMove(s.enter)} disabled={here?.k === s.k && s.statuses.length === 1}
              className="w-full text-left px-3 py-2.5 rounded"
              style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase",
                       background: here?.k === s.k ? T.hairSoft : T.card, color: T.ink, cursor: "pointer" }}>
              {s.label}{here?.k === s.k ? " · here now" : ""}
            </button>
            {/* W.I.P. holds three statuses; a job inside it moves between them here. */}
            {s.statuses.length > 1 && here?.k === s.k && (
              <div className="flex gap-1.5 flex-wrap px-3 pb-2">
                {s.statuses.map((st) => (
                  <button key={st} onClick={() => onMove(st)} disabled={job?.status === st}
                    className="rounded-full px-2.5"
                    style={{ height: 26, fontSize: F.xs, border: `1px solid ${job?.status === st ? T.ink : T.hair}`,
                             background: job?.status === st ? T.ink : T.card, color: job?.status === st ? "#fff" : T.ink2, cursor: "pointer" }}>
                    {STATUS_NAME[st] ?? st}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- new job */

interface PickThread { contact_id: string; display_name: string; name_is_phone: boolean; phone: string | null; preview: string }

/**
 * Who is it for, what kind of work, and how did it reach us. The customer is
 * who pays; the source is who sent it — a referral from Jeremy has the
 * homeowner as customer and Jeremy as "referred by"; a GC's bid invite has the
 * GC as customer. Creates through POST /api/jobs (origin 'manual', confirmed —
 * a person is typing it) and opens the builder.
 */
function NewJobSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [threads, setThreads] = useState<PickThread[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [customer, setCustomer] = useState<PickThread | null | "none">(null);
  const [jobType, setJobType] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<PickThread | null>(null);
  const [picking, setPicking] = useState<"customer" | "referrer">("customer");

  useEffect(() => {
    if (!open || threads) return;
    let cancelled = false;
    fetch("/api/threads")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!cancelled) setThreads(Array.isArray(b.threads) ? b.threads : []); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [open, threads]);

  function close() {
    setCustomer(null); setJobType(null); setSource(null); setReferrer(null); setPicking("customer"); setQ(""); setErr(null);
    onClose();
  }

  async function create() {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (customer && customer !== "none") body.contact_id = customer.contact_id;
      if (jobType) body.job_type = jobType;
      if (source) body.lead_source = source;
      if (referrer) body.referred_by_contact_id = referrer.contact_id;
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = (threads ?? []).filter((t) => !needle
    || t.display_name.toLowerCase().includes(needle)
    || (digits.length >= 3 && (t.phone ?? "").replace(/\D/g, "").includes(digits))).slice(0, 60);
  const chip = (on: boolean): React.CSSProperties => ({
    height: 30, padding: "0 10px", borderRadius: 3, fontSize: F.xs, cursor: "pointer",
    fontFamily: disp, textTransform: "uppercase", letterSpacing: ".04em",
    border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
  });

  const choosing = customer === null || (picking === "referrer" && !referrer && source === "referral");
  const label = (t: PickThread | null | "none") => t === "none" ? "Nobody yet" : t ? t.display_name : "";

  return (
    <Sheet open={open} onClose={close} title="New job"
      sub={choosing ? (picking === "referrer" ? "Who sent it?" : "Who is it for? (who pays)") : "What kind of job?"}>
      {choosing ? (
        <>
          <div className="p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or number" autoFocus
              className="w-full rounded px-2.5 outline-none" style={{ height: 40, border: `1px solid ${T.hair}`, fontSize: F.sm }} />
            {picking === "customer" && (
              <button disabled={busy} onClick={() => setCustomer("none")} className="w-full rounded mt-2"
                style={{ height: 38, border: `1px dashed ${T.ink3}`, background: T.card, fontFamily: disp, fontSize: F.sm,
                         textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
                Nobody yet — attach later
              </button>
            )}
            {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
          </div>
          {threads === null && !err && <div className="px-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading threads…</div>}
          {shown.map((t) => (
            <button key={t.contact_id} disabled={busy}
              onClick={() => { if (picking === "customer") setCustomer(t); else setReferrer(t); setQ(""); }}
              className="w-full text-left px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}`, background: T.card, cursor: "pointer" }}>
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{t.display_name}</div>
              <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                {t.name_is_phone ? "" : `${formatPhone(t.phone)} · `}{t.preview}
              </div>
            </button>
          ))}
        </>
      ) : (
        <div className="p-3 space-y-3">
          <div>
            <div style={{ ...eyebrow, color: T.ink3 }}>Customer</div>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, flex: 1, ...clip }}>{label(customer)}</span>
              <button onClick={() => { setCustomer(null); setPicking("customer"); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Change</button>
            </div>
          </div>
          <div>
            <div style={{ ...eyebrow, color: T.ink3, marginBottom: 4 }}>Type</div>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(JOB_TYPE_LABEL).map(([k, l]) => (
                <button key={k} style={chip(jobType === k)} onClick={() => setJobType(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ ...eyebrow, color: T.ink3, marginBottom: 4 }}>How did it reach you?</div>
            <div className="flex gap-1.5 flex-wrap">
              {LEAD_SOURCES.map((l) => (
                <button key={l.k} style={chip(source === l.k)}
                  onClick={() => { const on = source === l.k; setSource(on ? null : l.k); if (on || l.k !== "referral") setReferrer(null); }}>
                  {l.label}
                </button>
              ))}
            </div>
            {source === "referral" && (
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                <span style={{ fontSize: F.sm, flex: 1, ...clip }}>
                  {referrer ? <>Referred by <b>{referrer.display_name}</b></> : <span style={{ color: T.ink3 }}>Who sent it?</span>}
                </span>
                <button onClick={() => { setReferrer(null); setPicking("referrer"); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                  {referrer ? "Change" : "Pick"}
                </button>
              </div>
            )}
          </div>
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
          <button disabled={busy || !jobType} onClick={() => void create()} className="w-full rounded"
            style={{ height: 40, background: jobType ? T.hiviz : T.hair, color: "#fff", fontFamily: disp, fontSize: F.md, fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
            {busy ? "Creating…" : jobType ? "Create and open the scope" : "Pick a type first"}
          </button>
          <div style={{ fontSize: F.xs, color: T.ink3 }}>
            Type is required — the database would otherwise quietly call it residential. Source can be set later. It starts in New lead.
          </div>
        </div>
      )}
    </Sheet>
  );
}
