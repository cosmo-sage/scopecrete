"use client";
/**
 * A job's Schedule and Locations pages (Coy, 2026-10-18, on the job Space's Customer Account
 * shelf: "a new schedule page listed in the customer account" and "move this to a new account
 * page called locations … all the customer locations and jobsite locations listed distinctly").
 * The Summary's Appointments, Schedule and Job site cards moved here; nothing new is stored.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { JobSiteCard, type Party } from "@/components/v34/job-parties";
import { AppointmentsCard } from "@/components/v34/appointments-card";
import { ScheduleCard, type Job } from "@/components/v34/job-summary";
import { useWide } from "@/lib/v34/use-wide";

const PLACEHOLDER_TITLES = new Set(["New job", "Untitled scope"]);
const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4 };

interface Loaded { job: Job; customer: Party | null; owner: Party | null; site: { lat: number; lng: number } | null }

function useJob(jobId: string) {
  const [d, setD] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => fetch(`/api/jobs/${jobId}`).then(async (r) => {
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
    setD({ job: b.job as Job, customer: (b.customer as Party | null) ?? null, owner: (b.owner as Party | null) ?? null, site: (b.site as Loaded["site"]) ?? null });
  }).catch((e) => setErr(e instanceof Error ? e.message : String(e))), [jobId]);
  useEffect(() => { void load(); }, [load]);
  return { d, err, reload: load };
}

const siteOf = (j: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) => j.address
  ? (j.address.includes(",") ? j.address : [j.address, j.city, [j.state, j.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "))
  : null;

function Frame({ jobId, d, children }: { jobId: string; d: Loaded; children: React.ReactNode }) {
  const title = d.job.title && !PLACEHOLDER_TITLES.has(d.job.title.trim()) ? d.job.title : "Unnamed job";
  return (
    <div className="pb-24 lg:pb-8" style={{ color: T.ink, minHeight: "calc(100dvh - var(--sc-head))" }}>
      <div className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <JobHeaderRow jobId={jobId} active="summary" title={title} customerId={d.job.customer_id} />
      </div>
      <div className="flex flex-col" style={{ padding: "12px 12px 0", gap: 14, maxWidth: 1100 }}>{children}</div>
    </div>
  );
}

const Loading = () => <div className="p-3 space-y-2">{[1, 2].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 72, background: T.hairSoft }} />)}</div>;

export function JobSchedule({ jobId }: { jobId: string }) {
  const { d, err, reload } = useJob(jobId);
  if (err) return <EmptyState tone="warn" title="Couldn't load this job" detail={err} />;
  if (!d) return <Loading />;
  const won = ["won", "scheduled", "in_progress"].includes(d.job.status ?? "");
  const title = d.job.title && !PLACEHOLDER_TITLES.has(d.job.title.trim()) ? d.job.title : null;
  return (
    <Frame jobId={jobId} d={d}>
      <span style={{ ...eyebrow, color: T.ink3 }}>Schedule</span>
      {!d.job.archived_at && <AppointmentsCard jobId={jobId} card={card} about={title} address={siteOf(d.job)} />}
      {won
        ? <ScheduleCard jobId={jobId} job={d.job} card={card} onChange={() => void reload()} />
        : <div className="px-3 py-2.5" style={{ ...card, fontSize: F.sm, color: T.ink3 }}>The start day and days of work are set here once the job is won.</div>}
    </Frame>
  );
}

interface OtherJob { id: string; title: string | null; status: string | null; customer_id?: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }

function Place({ label, name, address, href }: { label: string; name: string | null; address: string | null; href?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
      <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {href ? <Link href={href} style={{ color: T.ink }}>{name || "Unnamed"}</Link> : (name || "Unnamed")}
          <span style={{ fontSize: 11, color: T.ink3, fontWeight: 500, marginLeft: 6 }}>{label}</span>
        </span>
        <span style={{ fontSize: 12, color: address ? T.ink2 : T.ink3 }}>{address || "No address yet"}</span>
      </div>
      {address && <Link href={`/dashboard/map?addr=${encodeURIComponent(address)}`} className="rounded px-2" style={{ height: 26, lineHeight: "24px", fontSize: 12, border: `1px solid ${T.hairStrong}`, color: T.ink2 }}>Map</Link>}
    </div>
  );
}

export function JobLocations({ jobId }: { jobId: string }) {
  const { d, err, reload } = useJob(jobId);
  const [wideRef, wide] = useWide<HTMLDivElement>(600);
  const [others, setOthers] = useState<OtherJob[] | null>(null);
  const customerId = d?.job.customer_id ?? null;
  useEffect(() => {
    if (!customerId) return;
    let off = false;
    fetch("/api/jobs").then((r) => r.json()).then((b) => { if (!off) setOthers(((b.jobs ?? []) as OtherJob[]).filter((j) => j.customer_id === customerId && j.id !== jobId)); })
      .catch(() => { if (!off) setOthers([]); });
    return () => { off = true; };
  }, [customerId, jobId]);
  if (err) return <EmptyState tone="warn" title="Couldn't load this job" detail={err} />;
  if (!d) return <Loading />;
  const address = siteOf(d.job);
  return (
    <Frame jobId={jobId} d={d}>
      <div ref={wideRef} className="flex flex-col gap-3">
        <span style={{ ...eyebrow, color: T.ink3 }}>This job site</span>
        <JobSiteCard jobId={jobId} address={address} stored={d.site} customer={d.customer} phone={!wide} onSaved={() => void reload()} />

        <section style={card} aria-label="Customer locations">
          <div className="px-3 py-2" style={{ ...eyebrow, color: T.ink3 }}>Customer locations</div>
          {d.customer
            ? <Place label="Customer · bill to" name={d.customer.name} address={d.customer.address} href={`/dashboard/customers/${d.customer.id}`} />
            : <div className="px-3 pb-2.5" style={{ fontSize: 12, color: T.ink3 }}>No customer on this job yet — put one on from the Summary.</div>}
          {d.owner && <Place label="Owner" name={d.owner.name} address={d.owner.address} href={`/dashboard/customers/${d.owner.id}`} />}
        </section>

        <section style={card} aria-label="Job sites">
          <div className="px-3 py-2" style={{ ...eyebrow, color: T.ink3 }}>Job sites</div>
          <Place label="This job" name={d.job.title} address={address} />
          {(others ?? []).map((j) => <Place key={j.id} label="Their other job" name={j.title} address={siteOf(j)} href={`/dashboard/scope/${j.id}/locations`} />)}
          {customerId && others === null && <div className="px-3 pb-2.5" style={{ fontSize: 12, color: T.ink3 }}>Looking for their other jobs…</div>}
        </section>
      </div>
    </Frame>
  );
}
