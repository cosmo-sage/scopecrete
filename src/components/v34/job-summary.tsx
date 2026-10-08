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
import { JobChips } from "@/components/v34/job-chips";
import { BidStrip } from "@/components/v34/bid-strip";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { budget as priceBudget, jobMinimum, takeoff as takeoffOf, type BudgetLine, type BudgetSettings, type SectionInput, type TakeoffTotal } from "@/lib/engine";
import { viewLine } from "@/lib/proposal-links";
import { JobBids } from "@/components/v34/bids/job-bids";
import { BudgetStep, SendSheet, useBudget } from "@/components/v34/plan-room/budget-step";
import { call as planCall, isDrawing, type Param, type PlansData } from "@/components/v34/plan-room/shared";

interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null; customer_id?: string | null;
  job_type: string | null; lead_source: string | null; description?: string | null; origin?: string | null;
  archived_at?: string | null; archived_reason?: string | null; created_at?: string | null;
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
  id: string; status: string; sent_at: string | null; sent_via: string[] | null; view_count: number;
  last_viewed_at: string | null; revoked_at: string | null; created_at: string; version: { version: number } | null;
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
  const [why, setWhy] = useState<Why | null>(null);
  const [sections, setSections] = useState<SectionInput[] | null>(null);
  const [bd, setBd] = useState<BudgetData | null>(null);
  const [budgetErr, setBudgetErr] = useState<string | null>(null);
  const [links, setLinks] = useState<ProposalLink[] | null>(null);
  const [bidSummary, setBidSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    Promise.all([send(`/api/jobs/${jobId}`, "GET"), send(`/api/jobs/${jobId}/sections`, "GET")])
      .then(([j, s]) => {
        if (off) return;
        setJob(j.job); setContact(j.contact ?? null); setWhy(j.why ?? null);
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

  const setChip = useCallback((field: string, value: string) => send(`/api/jobs/${jobId}`, "PATCH", { [field]: value })
    .then((b) => setJob((j) => j && { ...j, status: b.job.status, job_type: b.job.job_type, lead_source: b.job.lead_source })), [jobId]);

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
          <div style={{ fontSize: F.sm, color: who ? T.ink2 : T.hiviz, marginTop: 8, lineHeight: 1.45 }}>
            {who ? <Link href={`/dashboard/messages/${contact!.id}`} style={{ color: T.ink }}>{who}</Link> : "Not attached to a customer yet"}
            {job.address ? ` · ${job.address}` : ""}
            {` · ${sections.length} section${sections.length === 1 ? "" : "s"}`}
            {job.created_at ? ` · created ${day(job.created_at, true)}` : ""}
            {job.origin === "classification" ? " · made when filed as a customer" : job.created_from_message_id ? " · drafted from a message" : ""}
          </div>
          {job.description && !bidSummary && <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 4 }}>{job.description}</div>}
        </section>

        {why && <WhyThisJob why={why} contact={contact} description={job.description ?? null} />}

        {/* The bid behind it, when a forwarded bid email made or fed this job (migration 063). */}
        <BidStrip jobId={jobId} onSummary={setBidSummary} onUndone={() => { window.location.href = "/dashboard/scope"; }} />

        <div className="grid gap-3 lg:grid-cols-2">
          <Totals jobId={jobId} job={job} sections={sections} bd={bd} err={budgetErr} card={card} />
          <ProposalState jobId={jobId} links={links} card={card} />
        </div>

        <JobBids jobId={jobId} card={card} />

        <FromThePlans jobId={jobId} />
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
function FromThePlans({ jobId }: { jobId: string }) {
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
      <div style={{ margin: "0 -12px" }}><BudgetStep jobId={jobId} data={scoped} b={b} onSend={setSending} /></div>
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
        : !bd.lines.length ? <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6 }}>No price yet — the budget has no lines. Add items from the Price book on the Budget.</div>
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
function ProposalState({ jobId, links, card }: { jobId: string; links: ProposalLink[] | null; card: React.CSSProperties }) {
  const live = links?.find((l) => !l.revoked_at && l.status !== "void") ?? null;
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
            <b>v{live.version?.version ?? "?"} final</b> · {live.sent_at ? `sent ${day(live.sent_at)}${live.sent_via?.length ? ` · ${live.sent_via.map((v) => (v === "copy" ? "link copied" : v === "text" ? "by text" : "by email")).join(", ")}` : ""}` : "link made, not sent yet"}
            <div style={{ color: live.view_count ? T.green : T.ink2 }}>{viewLine(live)}</div>
          </div>
        ) : (
          <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
            Nothing sent yet{links.length ? " — every earlier link is turned off or replaced" : ""}. The draft is on the Proposal; Preview there sends it.
          </div>
        )}
      {links && links.length > 1 && (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>{links.length} links made on this job</div>
      )}
    </section>
  );
}

/**
 * Why this job exists — for one made when a contact was filed as a customer
 * (migration 038). Coy, 2026-09-29: "I have no reference for why this job was
 * created… No idea what the job is or why it was classified as a customer."
 * (Was an ⓘ sheet on the Budget; on the Summary since 2026-10-05.)
 */
export function WhyThisJob({ why, contact, description }: { why: Why; contact: Contact | null; description: string | null }) {
  const when = why.filed_at ? day(why.filed_at) : null;
  const whom = contact ? (contact.name || formatPhone(contact.phone)) : "this contact";
  return (
    <section className="rounded px-3 py-2.5" aria-label="Why this job"
      style={{ background: T.chalkDim, border: `1px solid ${T.hair}` }}>
      <span style={{ ...eyebrow, color: T.chalk }}>Why this job</span>
      <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.45, marginTop: 2 }}>
        Made{when ? ` ${when}` : ""} when {why.filed_by === "dusty" ? "Dusty filed" : "you filed"} {whom} as a customer
        {why.company ? <> — Dusty thinks it&apos;s <b>{why.company}</b></> : null}.
      </div>
      {why.status_summary && (
        <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 4 }}>
          <span style={{ ...eyebrow, color: T.ink3 }}>Dusty · </span>{why.status_summary}
        </div>
      )}
      {why.scope_summary && why.scope_summary !== description && (
        <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 4 }}>
          <span style={{ ...eyebrow, color: T.ink3 }}>The work · </span>{why.scope_summary}
        </div>
      )}
      {why.evidence_quote && (
        <div style={{ fontSize: F.sm, color: T.ink2, fontStyle: "italic", lineHeight: 1.45, marginTop: 5, paddingLeft: 7, borderLeft: `2px solid ${T.chalk}` }}>
          “{why.evidence_quote}”
        </div>
      )}
      {contact && (
        <Link href={`/dashboard/messages/${contact.id}`} className="inline-block mt-1.5 no-underline" style={{ ...eyebrow, color: T.chalk }}>
          Open their page →
        </Link>
      )}
    </section>
  );
}
