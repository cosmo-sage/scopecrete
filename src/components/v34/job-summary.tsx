"use client";
/**
 * Job › Summary (Coy, 2026-10-05, on his phone: "let's add a summary page to the left of the plan
 * room and we can put the budget tab in there along with some other information, including all the
 * chips that you find on the budget page" — and "all of the lines and words directly below the job
 * name and small font is the type of thing that we can add to the summary page to reduce the
 * clutter here"). One place for what the job IS: its chips (status, type, source, vendors), who it's
 * for, where and since when, its description, why it was made, the bid behind it, its totals at a
 * glance and the proposal's state — and Delete, at the bottom.
 *
 * Nothing here prices anything: the totals are the engine's budget() over the same budget API the
 * Budget view reads (DECISIONS §3), so the two can never disagree.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, money, money0, formatPhone } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { AddressInput } from "@/components/v34/address-input";
import { JobChips } from "@/components/v34/job-chips";
import { BidStrip } from "@/components/v34/bid-strip";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { budget as priceBudget, jobMinimum, takeoff as takeoffOf, type BudgetLine, type BudgetSettings, type SectionInput, type TakeoffTotal } from "@/lib/engine";
import { signedLine, viewLine } from "@/lib/proposal-links";
import { dayLabel, todayCentral, validDay, whenLabel } from "@/lib/jobs/schedule";
import { JobBids } from "@/components/v34/bids/job-bids";
import { SpecsCard } from "@/components/v34/specs-card";
import { BudgetStep, SendSheet, useBudget } from "@/components/v34/plan-room/budget-step";
import { call as planCall, isDrawing, type Param, type PlansData } from "@/components/v34/plan-room/shared";
import { BEFORE_WON, WON_STATUSES } from "@/lib/jobs/stages";
import type { Contract } from "@/lib/jobs/won";

interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null; customer_id?: string | null;
  job_type: string | null; lead_source: string | null; description?: string | null; origin?: string | null;
  archived_at?: string | null; archived_reason?: string | null; created_at?: string | null; won_at?: string | null;
  scheduled_start?: string | null; scheduled_end?: string | null; schedule_state?: string | null;
}
interface Contact { id: string; name: string | null; phone: string | null }
export interface Why {
  filed_at: string | null; filed_by: "coy" | "dusty" | null;
  status_summary: string | null; recent_summary: string | null;
  evidence_quote: string | null; evidence_at: string | null;
  company: string | null; scope_summary: string | null;
}
interface BudgetData {
  estimate: { tax_on: boolean; discount_amount: number } | null;
  lines: BudgetLine[]; settings: BudgetSettings;
  pricing: { day_minimum: number | null } | null;
  takeoff?: Record<string, TakeoffTotal>;
}
interface ProposalLink {
  id: string; status: string; decided_name?: string | null; decided_at?: string | null; sent_at: string | null; sent_via: string[] | null; view_count: number;
  last_viewed_at: string | null; revoked_at: string | null; created_at: string; version: { version: number } | null; number?: string | null;
}
const PLACEHOLDER_TITLES = new Set(["New job", "Untitled scope"]);

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const day = (iso: string, year = false) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "America/Chicago" });

export function JobSummary({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [customer, setCustomer] = useState<{ id: string; name: string | null } | null>(null);
  const [sections, setSections] = useState<SectionInput[] | null>(null);
  const [bd, setBd] = useState<BudgetData | null>(null);
  const [budgetErr, setBudgetErr] = useState<string | null>(null);
  const [links, setLinks] = useState<ProposalLink[] | null>(null);
  const [bidSummary, setBidSummary] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    Promise.all([send(`/api/jobs/${jobId}`, "GET"), send(`/api/jobs/${jobId}/sections`, "GET")])
      .then(([j, s]) => {
        if (off) return;
        setJob(j.job); setContact(j.contact ?? null); setCustomer(j.customer ?? null); setContract(j.contract ?? null);
        setSections(((s.sections ?? []) as Array<Record<string, unknown>>).map((x) => ({
          ...(x as unknown as SectionInput), length_ft: num(x.length_ft), width_ft: num(x.width_ft), sqft_override: num(x.sqft_override),
          depth_in: num(x.depth_in), psi: num(x.psi), count_qty: num(x.count_qty),
        })));
      })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    // The budget and the proposal's links load on their own; either failing leaves its card saying so.
    send(`/api/jobs/${jobId}/budget`, "GET").then((b) => { if (!off) setBd(b as BudgetData); }).catch((e) => { if (!off) setBudgetErr(e instanceof Error ? e.message : String(e)); });
    send(`/api/jobs/${jobId}/proposal/link`, "GET").then((b) => { if (!off) setLinks((b.links ?? []) as ProposalLink[]); }).catch(() => { if (!off) setLinks([]); });
    return () => { off = true; };
  }, [jobId]);

  // A status change can stamp or clear the win date, which moves the contract: read the job again.
  const reload = useCallback(() => send(`/api/jobs/${jobId}`, "GET").then((j) => { setJob(j.job); setContact(j.contact ?? null); setCustomer(j.customer ?? null); setContract(j.contract ?? null); }), [jobId]);
  const setChip = useCallback((field: string, value: string) => send(`/api/jobs/${jobId}`, "PATCH", { [field]: value })
    .then((b) => { setJob((j) => j && { ...j, status: b.job.status, job_type: b.job.job_type, lead_source: b.job.lead_source, won_at: b.job.won_at }); return field === "status" ? reload() : undefined; }), [jobId, reload]);

  if (error) return <EmptyState tone="warn" title="Couldn't load this job" detail={error} />;
  if (!job || !sections) {
    return <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 72, background: T.hairSoft }} />)}</div>;
  }

  const realTitle = job.title && !PLACEHOLDER_TITLES.has(job.title.trim()) ? job.title : "";
  const who = contact ? (contact.name || formatPhone(contact.phone)) : null;
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4 };

  return (
    <div className="pb-24 lg:pb-8" style={{ color: T.ink, minHeight: "calc(100dvh - var(--sc-head))" }}>
      <div className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <JobHeaderRow jobId={jobId} active="summary" title={realTitle || "Unnamed job"} customerId={job.customer_id} />
      </div>

      {job.archived_at && (
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.redDim, color: T.ink, fontSize: F.sm }}>
          <span style={{ flex: 1 }}>This job is {job.archived_reason?.startsWith("deleted") ? "deleted" : "archived"} — it isn&apos;t on the board, the Dashboard or Dusty&apos;s lists.</span>
          <button onClick={() => void send(`/api/archive/restore`, "POST", { kind: "job", ids: [jobId] }).then(() => setJob((j) => j && { ...j, archived_at: null, archived_reason: null }))}
            className="rounded px-2.5" style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, cursor: "pointer" }}>Restore</button>
        </div>
      )}

      <div className="mx-auto px-3 pt-3 space-y-3" style={{ maxWidth: 960 }}>
        {/* The job: its chips, who it's for, where, since when, and what it is. */}
        <section aria-label="The job" className="px-3 py-2.5" style={card}>
          <JobChips job={job} onSet={setChip} />
          {/* One fact a row: the customer, the address, when it was created, the sections (Coy, 2026-10-09). */}
          <div className="flex flex-col gap-0.5" style={{ fontSize: F.sm, color: T.ink2, marginTop: 8, lineHeight: 1.45 }}>
            <JobCustomer jobId={jobId} customer={customer} who={who} contactId={contact?.id ?? null} onSaved={() => void reload()} />
            <JobAddress jobId={jobId} address={job.address} onSaved={() => void reload()} />
            {job.created_at && <div>Created {day(job.created_at, true)}
              {job.origin === "classification" ? " · made when filed as a customer" : job.created_from_message_id ? " · drafted from a message" : ""}</div>}
            <div>{sections.length} section{sections.length === 1 ? "" : "s"}</div>
          </div>
          {job.description && !bidSummary && <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 4 }}>{job.description}</div>}
        </section>

        {WON_STATUSES.includes(job.status ?? "") && (
          <WonCard jobId={jobId} job={job} contract={contract} card={card} onChange={() => void reload()} />
        )}
        {["won", "scheduled", "in_progress"].includes(job.status ?? "") && (
          <ScheduleCard jobId={jobId} job={job} card={card} onChange={() => void reload()} />
        )}

        {/* "Why this job" is gone — what it said is in the facts above (Coy, 2026-10-09: "redundant"). */}

        {/* The bid behind it, when a forwarded bid email made or fed this job (migration 063). */}
        <BidStrip jobId={jobId} onSummary={setBidSummary} onUndone={() => { window.location.href = "/dashboard/scope"; }} />

        <div className="grid gap-3 lg:grid-cols-2">
          <Totals jobId={jobId} job={job} sections={sections} bd={bd} err={budgetErr} card={card} />
          <ProposalState jobId={jobId} links={links} card={card}
            onWon={BEFORE_WON.includes(job.status ?? "") ? () => setChip("status", "won") : undefined} />
        </div>

        <JobBids jobId={jobId} card={card} />

        {/* The spec book's concrete pages as one file Dusty can read (2026-10-12). */}
        <SpecsCard jobId={jobId} card={card} />

        <FromThePlans jobId={jobId} sections={sections} />
      </div>

      {/* Delete lives at the very bottom (moved here from the Budget, 2026-10-05). */}
      {!job.archived_at && (
        <div className="mx-auto px-3 pt-6" style={{ maxWidth: 960 }}>
          <div className="pt-3 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${T.hair}` }}>
            <span style={{ fontSize: F.xs, color: T.ink3 }}>Delete this job — it can be restored from Archived &amp; deleted.</span>
            <ArchiveButton kind="job" id={jobId} action="delete" what={realTitle ? `the job “${realTitle}”` : "this job"} then="/dashboard/scope"
              style={{ height: 28, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.red}`, background: T.card, color: T.red, fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0 }}>Delete job</ArchiveButton>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What the Plan Room measured, group by group, and the budget line that counts each — the Plan
 * Room's old Budget step (Coy, 2026-10-06: "we could move what's on this budget tab to the
 * summary page"). Shown only when the job has takeoff groups.
 */
function FromThePlans({ jobId, sections }: { jobId: string; sections: SectionInput[] }) {
  const [data, setData] = useState<PlansData | null>(null);
  const [tick, setTick] = useState(0);
  const [sending, setSending] = useState<Param | null>(null);
  const { b } = useBudget(jobId, tick);
  useEffect(() => {
    let off = false;
    planCall(`/api/jobs/${jobId}/plans`, "GET").then((d) => { if (!off) setData(d as PlansData); }).catch(() => { /* the card stays away */ });
    return () => { off = true; };
  }, [jobId, tick]);
  const scoped = useMemo(() => {
    if (!data) return null;
    const inRoom = new Set(data.files.filter((f) => f.in_plan_room).map((f) => f.id));
    const measured = new Set(data.measurements.map((m) => m.sheet_id));
    return { ...data, sheets: data.sheets.filter((x) => inRoom.has(x.file_id) && (isDrawing(x) || measured.has(x.id))) };
  }, [data]);
  if (!scoped || !scoped.params.length) return null;
  return (
    <section aria-label="From the plans">
      <div style={{ ...eyebrow, padding: "6px 2px 0" }}>From the plans</div>
      <div style={{ margin: "0 -12px" }}><BudgetStep jobId={jobId} data={scoped} b={b} sections={sections} onSend={setSending} /></div>
      <SendSheet jobId={jobId} p={sending} data={data} onClose={() => setSending(null)} onSent={() => setTick((n) => n + 1)} />
    </section>
  );
}

/** The job's price at a glance — the budget's own numbers (engine budget()), or what blocks them. */
function Totals({ jobId, job, sections, bd, err, card }: {
  jobId: string; job: Job; sections: SectionInput[]; bd: BudgetData | null; err: string | null; card: React.CSSProperties;
}) {
  const res = useMemo(() => bd ? priceBudget(bd.lines, [], bd.settings, sections, job.duration_days,
    { tax_on: bd.estimate?.tax_on ?? true, discount: bd.estimate?.discount_amount ?? 0, takeoff: bd.takeoff }) : null, [bd, sections, job.duration_days]);
  const area = useMemo(() => takeoffOf(sections, null), [sections]);
  const min = jobMinimum(bd?.pricing?.day_minimum ?? null, job.duration_days);
  const tier = res?.tiers[0] ?? null;
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-2 py-1" style={{ borderTop: `1px solid ${T.hairSoft}`, fontSize: F.sm, ...nums }}>
      <span style={{ color: T.ink3 }}>{label}</span><span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
  return (
    <section aria-label="Totals" className="px-3 py-2.5" style={card}>
      <div className="flex items-baseline gap-2">
        <span style={{ ...eyebrow }}>Price · from the budget</span>
        <span className="flex-1" />
        <Link href={`/dashboard/scope/${jobId}`} className="no-underline" style={{ ...eyebrow, color: T.chalk }}>Open the budget ›</Link>
      </div>
      {err ? <div style={{ fontSize: F.sm, color: T.red, marginTop: 6 }}>{err}</div>
        : !bd || !res ? <div className="rounded animate-pulse mt-2" style={{ height: 60, background: T.hairSoft }} />
        : !bd.lines.length ? <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6 }}>No price yet.</div>
        : tier && tier.priced ? (
          <>
            <div style={{ fontFamily: disp, fontSize: 34, fontWeight: 700, lineHeight: 1.05, marginTop: 4, ...nums }}>{money0(tier.total)}</div>
            <div style={{ marginTop: 6 }}>
              {row("Cost", money0(tier.cost))}
              {row("O.H.", money0(tier.overhead))}
              {row("Profit", money0(tier.profit))}
              {row("Margin", `${(tier.margin * 100).toFixed(1)}%`)}
              {row("Tax", tier.tax > 0 ? money0(tier.tax) : bd.estimate?.tax_on === false ? "off" : "none")}
              {tier.discount > 0 && row("Discount", `−${money0(tier.discount)}`)}
              {area.sqft > 0 && row("Per sq ft", `${money(tier.total / area.sqft)}/sf · ${area.sqft.toLocaleString("en-US", { maximumFractionDigits: 1 })} sf`)}
            </div>
            {min.ok && tier.total < min.minimum && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4, ...nums }}>Under the job minimum of {money0(min.minimum)}</div>}
          </>
        ) : (
          <ul className="mt-1.5" style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.5, paddingLeft: 16, listStyle: "square" }}>
            {(tier?.blocked ?? ["Not priced"]).map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
      {bd && (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6, lineHeight: 1.45, ...nums }}>
          Job minimum: {min.ok ? `${money0(min.minimum)} — ${min.days} days × ${money0(min.day_minimum)} a day` : `needs ${min.blocked.join(" and ")}`}
        </div>
      )}
    </section>
  );
}

/** Where the proposal stands: the newest link — sent or not, opened how often — and a way there. */
function ProposalState({ jobId, links, card, onWon }: {
  jobId: string; links: ProposalLink[] | null; card: React.CSSProperties; onWon?: () => Promise<unknown>;
}) {
  // A link the customer signed (097) leads; else the live one.
  const live = links?.find((l) => l.status === "accepted") ?? links?.find((l) => !l.revoked_at && l.status !== "void") ?? null;
  const signed = live ? signedLine(live) : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section aria-label="Proposal" className="px-3 py-2.5" style={card}>
      <div className="flex items-baseline gap-2">
        <span style={{ ...eyebrow }}>Proposal</span>
        <span className="flex-1" />
        <Link href={`/dashboard/scope/${jobId}/proposal`} className="no-underline" style={{ ...eyebrow, color: T.chalk }}>Open the proposal ›</Link>
      </div>
      {links === null ? <div className="rounded animate-pulse mt-2" style={{ height: 40, background: T.hairSoft }} />
        : live ? (
          <div style={{ fontSize: F.sm, color: T.ink, marginTop: 6, lineHeight: 1.5 }}>
            <b>{live.number ?? `v${live.version?.version ?? "?"}`} final</b> · {live.sent_at ? `sent ${day(live.sent_at)}${live.sent_via?.length ? ` · ${live.sent_via.map((v) => (v === "copy" ? "link copied" : v === "text" ? "by text" : "by email")).join(", ")}` : ""}` : "link made, not sent yet"}
            <div style={{ color: live.view_count ? T.green : T.ink2 }}>{viewLine(live)}</div>
            {signed && <div style={{ color: T.green, fontWeight: 600 }}>✓ {signed} — on the link</div>}
            {/* Send it again (Coy, 2026-10-11: "I don't see a way to resend proposals"). */}
            <Link href={`/dashboard/scope/${jobId}/proposal?send=1`} className="inline-block rounded no-underline" title="Opens the Preview to send the same link again"
              style={{ marginTop: 6, height: 28, lineHeight: "26px", padding: "0 10px", border: `1px solid ${T.hairStrong}`, color: T.ink, fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
              {live.sent_at ? "Resend" : "Send it"}
            </Link>
          </div>
        ) : (
          <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
            Nothing sent yet{links.length ? " — every earlier link is turned off or replaced" : ""}.
          </div>
        )}
      {links && links.length > 1 && (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>{links.length} links made on this job</div>
      )}
      {/* The customer said yes: one tap moves the job to Won and stamps the day (Coy, 2026-10-09). */}
      {live && onWon && !signed && (
        <div className="flex items-center gap-2" style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairSoft}` }}>
          <span style={{ flex: 1, fontSize: F.xs, color: T.ink2 }}>Did they say yes?</span>
          <button disabled={busy} onClick={() => { setBusy(true); setErr(null); onWon().catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}
            className="rounded px-3" style={{ height: 30, border: "none", background: T.green, color: "#fff", fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Marking…" : "Mark won"}
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </section>
  );
}

/**
 * When the work happens (Coy, 2026-10-09; src/lib/jobs/schedule.ts): the start day and the days of
 * work give the last day in work days (Mon–Fri). A start moves Won → Scheduled, clearing it moves it
 * back; "Told the customer" marks the date confirmed (schedule_state committed) rather than pencilled in.
 */
function ScheduleCard({ jobId, job, card, onChange }: {
  jobId: string; job: Job; card: React.CSSProperties; onChange: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayCentral();
  const save = (schedule: Record<string, unknown>) => {
    setErr(null); setBusy(true);
    send(`/api/jobs/${jobId}`, "PATCH", { schedule })
      .then(() => onChange())
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const start = job.scheduled_start ?? null;
  const confirmed = job.schedule_state === "committed";
  const input: React.CSSProperties = { height: 30, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 6px", background: T.card, color: T.ink };
  return (
    <section aria-label="Schedule" className="px-3 py-2.5" style={card}>
      <div className="flex items-baseline gap-2">
        <span style={eyebrow}>Schedule</span>
        <span className="flex-1" />
        {start && <span style={{ fontSize: F.xs, color: confirmed ? T.green : T.ink3, fontWeight: confirmed ? 600 : 400 }}>{confirmed ? "✓ Customer told" : "Pencilled in"}</span>}
      </div>
      <div className="flex items-end gap-3 flex-wrap" style={{ marginTop: 6 }}>
        <label style={{ fontSize: F.xs, color: T.ink2 }}>
          <div>Start</div>
          <input type="date" key={start ?? "none"} defaultValue={start ?? ""} disabled={busy} aria-label="Start day"
            onChange={(e) => { if (validDay(e.target.value)) save({ start: e.target.value }); }} style={input} />
        </label>
        <label style={{ fontSize: F.xs, color: T.ink2 }}>
          <div>Days of work</div>
          <input type="number" min={1} step={1} key={`d${job.duration_days ?? ""}`} defaultValue={job.duration_days ?? ""} disabled={busy} aria-label="Days of work"
            onBlur={(e) => { const v = e.target.value.trim(); const n = Number(v); if (v === "" ? job.duration_days != null : n > 0 && n !== Number(job.duration_days)) save({ days: v === "" ? null : n }); }}
            style={{ ...input, width: 76 }} />
        </label>
        {start && (
          <div style={{ fontSize: F.sm, color: T.ink, paddingBottom: 5, ...nums }}>
            {dayLabel(start)}{job.scheduled_end && job.scheduled_end !== start ? ` → ${dayLabel(job.scheduled_end)}` : ""}
            <span style={{ color: T.ink3 }}> · {whenLabel(start, today)}</span>
          </div>
        )}
      </div>
      {start ? (
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6, fontSize: F.xs }}>
          <label className="flex items-center gap-1.5" style={{ color: T.ink2, cursor: "pointer" }}>
            <input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => save({ confirmed: e.target.checked })} style={{ accentColor: T.green }} />
            Told the customer
          </label>
          <span className="flex-1" />
          {job.duration_days == null && <span style={{ color: T.ink3 }}>No days set — counted as one day.</span>}
          <button disabled={busy} onClick={() => save({ start: null })} style={{ border: "none", background: "none", color: T.red, cursor: "pointer", fontSize: F.xs, padding: 0 }}>Clear the date</button>
        </div>
      ) : (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>
          No start day yet. Pick one and the job moves to Scheduled on the board; the end is counted in work days, Mon–Fri.
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </section>
  );
}

/**
 * The win: the day it was won (stamped when the job moved to Won, changeable) and the contract —
 * the final proposal the customer said yes to, locked, plus signed change orders (src/lib/jobs/won.ts).
 */
function WonCard({ jobId, job, contract, card, onChange }: {
  jobId: string; job: Job; contract: Contract | null; card: React.CSSProperties; onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const todayDay = todayCentral();
  const wonDay = job.won_at ? new Date(job.won_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : "";
  const setDay = (v: string) => {
    setErr(null);
    send(`/api/jobs/${jobId}`, "PATCH", { won_on: v || null })
      .then(() => { setEditing(false); onChange(); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  const started = job.status === "in_progress" || job.status === "complete" || job.status === "closed";
  return (
    <section aria-label="Won" className="px-3 py-2.5" style={{ ...card, borderLeft: `3px solid ${T.green}` }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span style={{ ...eyebrow, color: T.green }}>Won</span>
        {editing ? (
          <input type="date" defaultValue={wonDay} max={todayDay} autoFocus aria-label="Day it was won"
            onChange={(e) => { if (e.target.value) setDay(e.target.value); }} onBlur={() => setEditing(false)}
            style={{ height: 28, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 6px", background: T.card, color: T.ink }} />
        ) : (
          <button onClick={() => setEditing(true)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: F.sm, fontWeight: 600, color: job.won_at ? T.ink : T.hiviz }}>
            {job.won_at ? day(job.won_at, true) : "Day not set — set it"} <span aria-hidden="true" style={{ color: T.ink3, fontWeight: 400 }}>✎</span>
          </button>
        )}
        <span className="flex-1" />
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{started ? "" : job.status === "scheduled" ? "Scheduled · not started" : "Not started"}</span>
      </div>
      {contract ? (
        <div style={{ marginTop: 6 }}>
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: disp, fontSize: 28, fontWeight: 700, lineHeight: 1.05, ...nums }}>{contract.contract_total == null ? "—" : money0(contract.contract_total)}</span>
            <span style={{ fontSize: F.xs, color: T.ink3 }}>contract</span>
          </div>
          <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2, lineHeight: 1.5, ...nums }}>
            <Link href={`/dashboard/scope/${jobId}/proposal`} style={{ color: T.chalk }}>
              Proposal {contract.number ?? `v${contract.version}`}
            </Link>{contract.finalized_at ? ` · final ${day(contract.finalized_at)}` : ""}{contract.total != null ? ` · ${money0(contract.total)}` : ""}
            {contract.change_order_count > 0 && ` + ${contract.change_order_count} signed change order${contract.change_order_count === 1 ? "" : "s"} ${money0(contract.change_orders)}`}
          </div>
          {contract.signed && (
            <div style={{ fontSize: F.xs, color: T.green, fontWeight: 600, marginTop: 2 }}>
              ✓ {signedLine({ status: "accepted", decided_name: contract.signed.name, decided_at: contract.signed.at })} on the link
            </div>
          )}
          {contract.later_version != null && (
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
              v{contract.later_version} was made after {contract.signed ? "the signed version" : "the win"} and isn&apos;t the contract. Work added after the yes is a change order (Budget → Actual costs).
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6, lineHeight: 1.45 }}>
          No final proposal from before the win, so there&apos;s no contract price yet. Freeze one on the Proposal (Preview), then set the day it was won.
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </section>
  );
}

/** The job's address, added or changed here (Coy, 2026-10-10: "I currently
 *  have no way to add or edit an address for a new or existing job"): the
 *  Map's address finder (Mapbox) fills street, city, state and zip; saved
 *  through the job's own PATCH. */
/**
 * Who the job is for, and Change (Coy, 2026-10-10: "I seem to have no way of attaching a customer
 * to a job/scope from inside the job"): pick a customer and the job goes on it, its person becoming
 * the customer's primary unless already one of theirs (PATCH /api/jobs/[id] {customer_id}).
 */
function JobCustomer({ jobId, customer, who, contactId, onSaved }: {
  jobId: string; customer: { id: string; name: string | null } | null; who: string | null; contactId: string | null; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Array<{ id: string; name: string; city: string | null }> | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || list) return;
    fetch("/api/customers").then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((b) => setList(((b.customers ?? []) as Array<{ id: string; name: string; city: string | null }>).sort((a, b2) => a.name.localeCompare(b2.name))))
      .catch(() => setList([]));
  }, [open, list]);
  const pick = async (id: string) => {
    setBusy(true); setErr(null);
    try { await send(`/api/jobs/${jobId}`, "PATCH", { customer_id: id }); setOpen(false); setQ(""); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const words = q.trim().toLowerCase();
  const shown = (list ?? []).filter((x) => x.id !== customer?.id && (!words || x.name.toLowerCase().includes(words))).slice(0, 30);
  const name = customer?.name || null;
  const person = who && who !== name ? who : null;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        {name ? <Link href={`/dashboard/customers/${customer!.id}`} style={{ color: T.ink, fontWeight: 600 }}>{name}</Link>
          : who && contactId ? <Link href={`/dashboard/messages/${contactId}`} style={{ color: T.ink, fontWeight: 600 }}>{who}</Link>
          : <span style={{ color: T.hiviz, fontWeight: 600 }}>Not attached to a customer yet</span>}
        {name && person && contactId && <Link href={`/dashboard/messages/${contactId}`} style={{ color: T.ink2 }}>{person}</Link>}
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ ...eyebrow, fontSize: 10.5, color: T.chalk, cursor: "pointer", background: "none", border: "none", padding: 0 }}>
          {open ? "Close" : customer ? "✎ Change customer" : "+ Attach a customer"}
        </button>
      </div>
      {open && (
        <div style={{ maxWidth: 520, margin: "4px 0 6px" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a customer…" aria-label="Find a customer"
            className="rounded px-2 w-full" style={{ height: 34, border: `1px solid ${T.hairStrong}`, fontSize: 14, background: T.card, color: T.ink }} />
          <div className="flex flex-col mt-1" style={{ maxHeight: 260, overflowY: "auto" }}>
            {list === null ? <span style={{ fontSize: F.sm, color: T.ink3, padding: "6px 0" }}>Loading…</span>
              : shown.length === 0 ? <span style={{ fontSize: F.sm, color: T.ink3, padding: "6px 0" }}>No customer by that name. Make it on Customers → + New.</span>
              : shown.map((x) => (
                <button key={x.id} disabled={busy} onClick={() => void pick(x.id)} className="text-left flex items-baseline gap-2"
                  style={{ padding: "8px 2px", borderBottom: `1px solid ${T.hairSoft}`, fontSize: F.sm, color: T.ink, cursor: "pointer", background: "none" }}>
                  <span className="flex-1 min-w-0" style={{ fontWeight: 600 }}>{x.name}</span>
                  {x.city && <span style={{ color: T.ink3, fontSize: 12 }}>{x.city}</span>}
                </button>
              ))}
          </div>
          {err && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

function JobAddress({ jobId, address, onSaved }: { jobId: string; address: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (body: Record<string, string | null>) => {
    setBusy(true); setErr(null);
    try { await send(`/api/jobs/${jobId}`, "PATCH", body); setEditing(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  if (!editing) return (
    <div className="flex items-baseline gap-2">
      <span style={{ color: address ? T.ink2 : T.ink3 }}>{address || "No address yet"}</span>
      <button onClick={() => { setV(address ?? ""); setEditing(true); }}
        style={{ ...eyebrow, fontSize: 10.5, color: T.chalk, cursor: "pointer", background: "none", border: "none", padding: 0 }}>
        {address ? "✎ Change" : "+ Add address"}
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5" style={{ maxWidth: 520, margin: "2px 0 4px" }}>
      <AddressInput value={v} onChange={setV}
        style={{ width: "100%", height: 34, padding: "0 10px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 14 }}
        onPick={(m) => void save({ address: m.line1, city: m.city ?? null, state: m.state ?? null, zip: m.zip ?? null })} />
      <span style={{ fontSize: 11, color: T.ink3 }}>Start typing — pick the address from the list.</span>
      <span className="flex gap-2">
        <button disabled={busy || !v.trim()} onClick={() => void save({ address: v.trim() })} className="rounded px-3"
          style={{ height: 30, background: T.ink, color: T.card, fontWeight: 600, cursor: "pointer", border: "none" }}>{busy ? "Saving…" : "Save as typed"}</button>
        <button onClick={() => setEditing(false)} className="rounded px-3"
          style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer" }}>Cancel</button>
      </span>
      {err && <span style={{ color: T.red, fontSize: 11 }}>{err}</span>}
    </div>
  );
}
