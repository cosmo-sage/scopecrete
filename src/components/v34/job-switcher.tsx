"use client";
/**
 * The job switcher (Coy, 2026-10-08: "Jobtread has a job switcher panel that slides in on the
 * right side of the page that lists the jobs, latest first. Its accessed by clicking on the job at
 * the top. The job name needs to look clickable."). A tap on the job's name at the top of any job
 * view opens it: every job not archived, newest first, with a search; a pick opens the same view
 * (Summary, Takeoffs, Budget or Proposal) on that job. Read through GET /api/jobs, so RLS decides
 * which jobs are listed (an onsite estimator sees only theirs).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, clip, relTime } from "@/lib/v34/tokens";
import { Drawer, SearchBubble } from "@/components/v34/primitives";
import { stageOf } from "@/lib/jobs/stages";

type J = { id: string; title: string | null; status: string | null; address: string | null; city: string | null; contact_name: string | null; contact_phone: string | null; created_at: string };

export function JobSwitcher({ open, onClose, jobId, href }: {
  open: boolean; onClose: () => void; jobId: string;
  /** Where a pick goes: the same view on that job. */
  href: (id: string) => string;
}) {
  const [jobs, setJobs] = useState<J[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open || jobs) return;
    let live = true;
    fetch("/api/jobs").then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setErr(b?.error || `HTTP ${r.status}`); return; }
      setJobs((b.jobs ?? []) as J[]);
    }).catch((e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [open, jobs]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (jobs ?? []).filter((j) => {
      if (!words.length) return true;
      const hay = [j.title, j.address, j.city, j.contact_name, j.contact_phone].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [jobs, q]);

  return (
    <Drawer open={open} onClose={onClose} title="Jobs" sub={jobs ? `${jobs.length} · newest first` : undefined}>
      <div className="px-3 pt-3 pb-2" style={{ position: "sticky", top: 0, background: T.card, zIndex: 1 }}>
        <SearchBubble value={q} onChange={setQ} placeholder="Find a job — name, customer, street…" />
      </div>
      {err && <div className="px-4 py-3" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
      {!jobs && !err && <div className="px-4 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading jobs…</div>}
      {jobs && !shown.length && <div className="px-4 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>No job matches “{q}”.</div>}
      <nav aria-label="Jobs">
        {shown.map((j) => {
          const here = j.id === jobId;
          const who = [j.contact_name || j.contact_phone, j.city || j.address].filter(Boolean).join(" · ");
          return (
            <Link key={j.id} href={href(j.id)} onClick={onClose} aria-current={here ? "page" : undefined} className="no-underline block px-4 py-2.5"
              style={{ borderTop: `1px solid ${T.hairSoft}`, background: here ? T.hivizDim : "transparent", borderLeft: `3px solid ${here ? T.hiviz : "transparent"}` }}>
              <div className="flex items-baseline gap-2">
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0, ...clip }}>{j.title || "Untitled job"}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, flexShrink: 0 }}>{relTime(j.created_at)}</span>
              </div>
              <div className="flex items-baseline gap-2" style={{ fontSize: F.xs, color: T.ink2 }}>
                <span style={{ flex: 1, minWidth: 0, ...clip }}>{who}</span>
                <span style={{ flexShrink: 0, color: T.ink3, textTransform: "uppercase", letterSpacing: ".05em" }}>{stageOf(j.status).label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </Drawer>
  );
}

/** The ▾ that says the job's name opens the switcher, drawn after the name. */
export function SwitchChevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0, color: T.ink3 }}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
