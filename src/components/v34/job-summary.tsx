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
import { T, F, disp, strong, eyebrow, nums, money, money0 } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { CustomerCard, OwnerCard, ContactsCard, type Party, type JobPerson } from "@/components/v34/job-parties";
import { useWide } from "@/lib/v34/use-wide";
import { JobChips } from "@/components/v34/job-chips";
import { BidStrip } from "@/components/v34/bid-strip";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { budget as priceBudget, jobMinimum, takeoff as takeoffOf, type BudgetLine, type BudgetSettings, type SectionInput, type TakeoffTotal } from "@/lib/engine";
import { signedLine, viewLine } from "@/lib/proposal-links";
import { ProposalOpenings } from "@/components/v34/proposal/openings";
import { dayLabel, todayCentral, validDay, whenLabel } from "@/lib/jobs/schedule";
import { JobBids } from "@/components/v34/bids/job-bids";
import { SpecsCard } from "@/components/v34/specs-card";
import { CameraLinkCard } from "@/components/v34/camera/camera-link-card";
import { BudgetStep, SendSheet, useBudget } from "@/components/v34/plan-room/budget-step";
import { call as planCall, isDrawing, type Param, type PlansData } from "@/components/v34/plan-room/shared";
import { BEFORE_WON, WON_STATUSES } from "@/lib/jobs/stages";
import type { Contract } from "@/lib/jobs/won";

export interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  city?: string | null; state?: string | null; zip?: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null; customer_id?: string | null;
  job_type: string | null; lead_source: string | null; description?: string | null; origin?: string | null;
  archived_at?: string | null; archived_reason?: string | null; created_at?: string | null; won_at?: string | null;
  scheduled_start?: string | null; scheduled_end?: string | null; schedule_state?: string | null;
}
interface Contact { id: string; name: string | null; phone: string | null; email?: string | null }
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
  events?: Array<{ event: string; occurred_at: string; user_agent: string | null }>;
  messages?: Array<{ name: string | null; body: string; at: string; contact_id?: string | null }>;
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
  const [, setContact] = useState<Contact | null>(null);
  const [customer, setCustomer] = useState<Party | null>(null);
  const [owner, setOwner] = useState<Party | null>(null);
  const [ownerSupported, setOwnerSupported] = useState(true);
  const [people, setPeople] = useState<JobPerson[]>([]);
  const [jobContacts, setJobContacts] = useState(false);
  const [wideRef, wide] = useWide<HTMLDivElement>(600);
  const [sections, setSections] = useState<SectionInput[] | null>(null);
  const [bd, setBd] = useState<BudgetData | null>(null);
  const [budgetErr, setBudgetErr] = useState<string | null>(null);
  const [links, setLinks] = useState<ProposalLink[] | null>(null);
  const [bidSummary, setBidSummary] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Everything GET /api/jobs/[id] gives the page, in one place so a reload reads the same.
  const take = useCallback((j: Record<string, unknown>) => {
    setJob(j.job as Job); setContact((j.contact as Contact | null) ?? null); setCustomer((j.customer as Party | null) ?? null);
    setOwner((j.owner as Party | null) ?? null); setOwnerSupported(j.owner_supported !== false);
    setPeople((j.people as JobPerson[] | undefined) ?? []); setJobContacts(j.job_contacts_supported === true);
    setContract((j.contract as Contract | null) ?? null);
  }, []);

  useEffect(() => {
    let off = false;
    Promise.all([send(`/api/jobs/${jobId}`, "GET"), send(`/api/jobs/${jobId}/sections`, "GET")])
      .then(([j, s]) => {
        if (off) return;
        take(j);
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
  }, [jobId, take]);

  // The photos the job's people texted come onto it once (migration 108) — kept from What's next.
  useEffect(() => { void send(`/api/jobs/${jobId}/texted-photos`, "POST", { auto: true }).catch(() => undefined); }, [jobId]);

  // A status change can stamp or clear the win date, which moves the contract: read the job again.
  const reload = useCallback(() => send(`/api/jobs/${jobId}`, "GET").then((j) => take(j)), [jobId, take]);
  const setChip = useCallback((field: string, value: string) => send(`/api/jobs/${jobId}`, "PATCH", { [field]: value })
    .then((b) => { setJob((j) => j && { ...j, status: b.job.status, job_type: b.job.job_type, lead_source: b.job.lead_source, won_at: b.job.won_at }); return field === "status" ? reload() : undefined; }), [jobId, reload]);

  if (error) return <EmptyState tone="warn" title="Couldn't load this job" detail={error} />;
  if (!job || !sections) {
    return <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 72, background: T.hairSoft }} />)}</div>;
  }

  const realTitle = job.title && !PLACEHOLDER_TITLES.has(job.title.trim()) ? job.title : "";
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4 };
  const siteParts = { address: job.address, city: job.city, state: job.state, zip: job.zip };
  const siteAddress = job.address
    ? (job.address.includes(",") ? job.address : [job.address, job.city, [job.state, job.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "))
    : null;
  // The job's person, or the first person on it, is who "Make X the customer" offers.
  const primary = people.find((p) => p.primary) ?? people[0] ?? null;
  const created = job.created_at ? `Created ${day(job.created_at, true)}` : null;
  const facts = [created, `${sections.length} section${sections.length === 1 ? "" : "s"}`,
    job.origin === "classification" ? "made when filed as a customer" : job.created_from_message_id ? "drafted from a message" : null].filter(Boolean).join(" · ");

  return (
    <div ref={wideRef} className="pb-24 lg:pb-8" style={{ color: T.ink, minHeight: "calc(100dvh - var(--sc-head))" }}>
      <div className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        {/* The chips sit right of the name on a desktop (Claude Design "Job Summary", 2026-10-13), in the body on a phone. */}
        <JobHeaderRow jobId={jobId} active="summary" title={realTitle || "Unnamed job"} customerId={job.customer_id}
          after={wide ? <span className="hidden lg:inline-flex" style={{ marginLeft: 20 }}><JobChips job={job} onSet={setChip} /></span> : undefined} />
      </div>

      {job.archived_at && (
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.redDim, color: T.ink, fontSize: F.sm }}>
          <span style={{ flex: 1 }}>This job is {job.archived_reason?.startsWith("deleted") ? "deleted" : "archived"} — it isn&apos;t on the board, the Dashboard or Dusty&apos;s lists.</span>
          <button onClick={() => void send(`/api/archive/restore`, "POST", { kind: "job", ids: [jobId] }).then(() => setJob((j) => j && { ...j, archived_at: null, archived_reason: null }))}
            className="rounded px-2.5" style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, cursor: "pointer" }}>Restore</button>
        </div>
      )}

      {/* Full width, no cap (Claude Design "Job Summary": "full width, no max-width"). */}
      <div className="flex flex-col" style={{ padding: wide ? "16px 24px 0" : "12px 12px 0", gap: 14 }}>
        {/* The job: its name, when it was made, how many sections, and what it is. */}
        <section aria-label="The job" className="flex flex-col gap-2">
          <div className="lg:hidden"><JobChips job={job} onSet={setChip} /></div>
          <div className="flex" style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "baseline" : "flex-start", gap: "4px 16px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 18, lineHeight: 1.2 }}>{realTitle || "Unnamed job"}</span>
            <span style={{ fontSize: 12, color: T.ink3 }}>{facts}</span>
          </div>
          {job.description && !bidSummary && <span style={{ fontSize: 13.5, lineHeight: 1.5, color: T.ink2, maxWidth: 900 }}>{job.description}</span>}
        </section>

        {/* Who pays, who it's for, the people on it — and where it is. */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 520px), 1fr))", alignItems: "stretch" }}>
          <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
              <CustomerCard jobId={jobId} customer={customer} primary={primary} jobType={job.job_type} siteAddress={siteAddress} site={siteParts} onSaved={() => void reload()} />
              <OwnerCard jobId={jobId} owner={owner} customer={customer} supported={ownerSupported}
                ownerPeople={people.filter((p) => p.side === "owner").length} onSaved={() => void reload()} />
            </div>
            <ContactsCard jobId={jobId} people={people} customer={customer} owner={owner} jobType={job.job_type} site={siteParts} onSaved={() => void reload()} picks={jobContacts} />
          </div>
        </div>
        {/* The Job site map is on Locations, appointments and the schedule on Schedule, and What's
            next is gone (Coy, 2026-10-18 — the job Space's Customer Account shelf). */}

        {WON_STATUSES.includes(job.status ?? "") && (
          <WonCard jobId={jobId} job={job} contract={contract} card={card} onChange={() => void reload()} />
        )}

        {/* "Why this job" is gone — what it said is in the facts above (Coy, 2026-10-09: "redundant"). */}

        {/* The bid behind it, when a forwarded bid email made or fed this job (migration 063). */}
        <BidStrip jobId={jobId} onSummary={setBidSummary} onUndone={() => { window.location.href = "/dashboard/scope"; }} />

        {/* Price, proposal and bids side by side as room allows (Claude Design "Job Summary"). */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", alignItems: "start" }}>
          <Totals jobId={jobId} job={job} sections={sections} bd={bd} err={budgetErr} card={card} />
          <ProposalState jobId={jobId} links={links} card={card}
            onWon={BEFORE_WON.includes(job.status ?? "") ? () => setChip("status", "won") : undefined} />
          <JobBids jobId={jobId} card={card} />
        </div>

        {/* The spec book's concrete pages as one file Dusty can read (2026-10-12). */}
        <SpecsCard jobId={jobId} card={card} />

        {/* A camera link texted to the customer — their photos and video land in Files (migration 128). */}
        <CameraLinkCard jobId={jobId} jobTitle={realTitle || null} people={people.filter((p) => p.on_job !== false)}
          sections={sections ?? []} card={card} />

        <FromThePlans jobId={jobId} sections={sections} />
      </div>

      {/* Delete lives at the very bottom (moved here from the Budget, 2026-10-05). */}
      {!job.archived_at && (
        <div style={{ padding: wide ? "24px 24px 0" : "24px 12px 0" }}>
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
      {/* Every opening, dated (Coy, 2026-10-23), with the signing and their messages from the link. */}
      {links && links.some((l) => (l.events?.length ?? 0) > 0 || (l.messages?.length ?? 0) > 0) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairSoft}` }}>
          <div style={{ ...eyebrow, marginBottom: 4 }}>Openings</div>
          <ProposalOpenings links={links} />
        </div>
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
export function ScheduleCard({ jobId, job, card, onChange }: {
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
