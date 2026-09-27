"use client";

/**
 * Scope — jobs, the spine of the product (DECISIONS.md §1, §2).
 *
 * Reads /api/jobs, which is now a real writer as well as a reader. Until work
 * order 13 nothing in the system created a `jobs` row, so this screen was empty
 * for a structural reason rather than a wiring one.
 *
 * The old empty-state copy said "A job is created when a scope is built and
 * won." That is wrong and was teaching a workflow the database does not
 * implement: `status` DEFAULTS to 'lead', and won_at / lost_at / declined_at
 * arrive later. A job is the container from first contact, not the reward for
 * winning.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, Badge, Sheet } from "@/components/v34/primitives";

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
  counts_toward_value: boolean;
}

export default function ScopeScreen() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const apply = useCallback((b: { code?: string; jobs?: unknown }, ok: boolean) => {
    if (!ok) {
      if (b?.code === "no_org") { setNoOrg(true); setJobs([]); return; }
      throw new Error((b as { error?: string })?.error || "Couldn't load jobs");
    }
    setJobs(Array.isArray(b.jobs) ? (b.jobs as Job[]) : []);
  }, []);

  const fetchJobs = () => fetch("/api/jobs").then(async (r) => ({ ok: r.ok, b: await r.json().catch(() => ({})) }));

  const load = useCallback(async () => {
    try { const { ok, b } = await fetchJobs(); apply(b, ok); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchJobs()
      .then(({ ok, b }) => { if (!cancelled) apply(b, ok); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [apply]);

  // Accepting is one job at a time and goes through PATCH {accept:true}. The
  // route sets confirmed_at/confirmed_by; the client never sends them.
  async function accept(id: string) {
    setAccepting(id);
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(null);
    }
  }

  if (noOrg) {
    return <EmptyState tone="warn" title="This account isn't a member of any organisation"
      detail="You are signed in, but nothing is shared with this account yet." />;
  }
  if (error) return <EmptyState tone="warn" title="Couldn't load jobs" detail={error} />;

  if (jobs === null) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded animate-pulse" style={{ height: 56, background: T.hairSoft }} />
        ))}
      </div>
    );
  }

  const counted = jobs.filter((j) => j.counts_toward_value).length;
  const unreviewed = jobs.length - counted;

  return (
    <div>
      <NewScopeSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div style={eyebrow}>Scope</div>
        <div className="flex items-center gap-2">
          <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, flex: 1 }}>
            Jobs and sections
          </div>
          <button onClick={() => setNewOpen(true)} className="rounded px-3"
            style={{ height: 34, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.sm, fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
            + New scope
          </button>
        </div>
        {jobs.length > 0 && (
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, ...nums }}>
            {counted} job{counted === 1 ? "" : "s"}
            {unreviewed > 0 && ` · ${unreviewed} awaiting your review`}
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState title="No jobs yet"
          detail="A job is the container for a piece of work, from first contact onward — it starts as a lead and is won or lost later. Start one with + New scope." />
      ) : (
        jobs.map((j, i) => {
          const who = j.contact_name || j.contact_phone || "No contact";
          const when = relTime(j.created_at);
          return (
            <div key={j.id} className="px-3 py-2.5"
              style={{ background: T.card, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
              <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
                <Link href={`/dashboard/scope/${j.id}`} className="no-underline"
                  style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, ...clip }}>
                  {j.title || j.job_number || "Untitled job"} ›
                </Link>
                <span className="flex-1" />
                {j.status && <Badge s={j.status} />}
                {when && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>}
              </div>

              <div style={{ fontSize: F.xs, color: T.ink3, ...clip, marginTop: 2 }}>
                {who}{j.address ? ` · ${j.address}` : ""}
                {/* job_number renders only when it exists. Nothing generates one
                    — the scheme is unconfirmed, and a made-up number that looks
                    official is worse than a blank. */}
                {j.job_number ? ` · ${j.job_number}` : ""}
              </div>

              {/* An unreviewed machine job is SHOWN but excluded from the count
                  above until accepted. Visible and uncounted, never hidden. */}
              {!j.counts_toward_value && (
                <div className="flex items-center gap-2 mt-2">
                  <span style={{ ...eyebrow, color: T.hiviz }}>Suggested — not counted</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => void accept(j.id)}
                    disabled={accepting === j.id}
                    className="rounded px-3"
                    style={{
                      height: 32, border: `1px solid ${T.hair}`, background: T.card,
                      fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                      textTransform: "uppercase", cursor: accepting === j.id ? "default" : "pointer",
                    }}>
                    {accepting === j.id ? "Accepting…" : "Accept"}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* --------------------------------------------------------- new scope sheet */

interface PickThread { contact_id: string; display_name: string; name_is_phone: boolean; phone: string | null; preview: string }

/**
 * Who is this for? Pick from the threads, or start with nobody and attach
 * later. Creates the job through POST /api/jobs (origin 'manual', confirmed —
 * a person is typing it) and opens the builder.
 */
function NewScopeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [threads, setThreads] = useState<PickThread[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || threads) return;
    let cancelled = false;
    fetch("/api/threads")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!cancelled) setThreads(Array.isArray(b.threads) ? b.threads : []); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [open, threads]);

  async function create(contactId: string | null) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactId ? { contact_id: contactId } : {}),
      });
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

  return (
    <Sheet open={open} onClose={onClose} title="New scope" sub="Who is it for?">
      <div className="p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or number" autoFocus
          className="w-full rounded px-2.5 outline-none" style={{ height: 40, border: `1px solid ${T.hair}`, fontSize: F.sm }} />
        <button disabled={busy} onClick={() => void create(null)} className="w-full rounded mt-2"
          style={{ height: 38, border: `1px dashed ${T.ink3}`, background: T.card, fontFamily: disp, fontSize: F.sm,
                   textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
          Nobody yet — attach later
        </button>
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
      </div>
      {threads === null && !err && <div className="px-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading threads…</div>}
      {shown.map((t) => (
        <button key={t.contact_id} disabled={busy} onClick={() => void create(t.contact_id)}
          className="w-full text-left px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}`, background: T.card, cursor: "pointer" }}>
          <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{t.display_name}</div>
          <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
            {t.name_is_phone ? "" : `${formatPhone(t.phone)} · `}{t.preview}
          </div>
        </button>
      ))}
    </Sheet>
  );
}
