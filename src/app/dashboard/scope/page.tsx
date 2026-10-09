"use client";

/**
 * Jobs — the board (DECISIONS §6). Threads is people; this is the work.
 *
 * One column per stage: New lead · Consultation · Estimating · Follow up ·
 * Won · In progress · Complete · Lost (src/lib/jobs/stages.ts maps them onto
 * jobs.status). On a phone the stage strip sits on top and the columns swipe
 * sideways, one per screen; on desktop all seven sit side by side.
 *
 * A card is a job: who it is for, where, residential / commercial /
 * government, how it reached us ("via Jeremy"), how many sections are scoped.
 * Tap the title for the scope builder; the four-way arrow sends it to another
 * stage, "Consultation »" to the next one.
 *
 * An unreviewed machine job is shown but marked "Suggested" with Accept — it
 * never counts until a person accepts it (DECISIONS §2b).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccess } from "@/lib/v34/access-ctx";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, MenuButton, PageHeader, Sheet } from "@/components/v34/primitives";
import { Emblem } from "@/components/site/marks";
import { STAGES, STATUS_TAG, STATUS_NAME, JOB_TYPE_LABEL, LEAD_SOURCES, stageOf } from "@/lib/jobs/stages";
import { BOARD_SORTS, cityCounts, filterJobs, sortJobs, type BoardFilter, type BoardSort } from "@/lib/jobs/board-view";

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
  city: string | null;
  created_at: string | null;
  stage_changed_at: string | null;
  job_type: string | null;
  lead_source: string | null;
  referred_by_name: string | null;
  section_count: number;
  counts_toward_value: boolean;
  /** Its customer was re-filed (migration 038): archive it, or keep it. */
  flag_reason: string | null;
  /** A short line on what they asked for (migration 039). */
  description: string | null;
}

const SOURCE_LABEL = Object.fromEntries(LEAD_SOURCES.map((l) => [l.k, l.label]));

export default function JobsBoard() {
  // An onsite estimator (081) sees their jobs but doesn't start, move or accept them.
  const { limited } = useAccess();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [moving, setMoving] = useState<Job | null>(null);
  const [col, setCol] = useState(0);
  const lane = useRef<HTMLDivElement | null>(null);
  // Sort and filters (Coy, 2026-10-04), remembered on this device.
  const [sort, setSortState] = useState<BoardSort>("newest");
  const [filter, setFilterState] = useState<BoardFilter>({ types: [], cities: [] });
  const [filterOpen, setFilterOpen] = useState(false);
  // On a phone: the swiping board, or one stage at a time as a list picked
  // from the ☰ panel (Coy, 2026-10-06). Remembered on this device.
  const [phoneView, setPhoneView] = useState<"board" | "list">("board");
  const [stagesOpen, setStagesOpen] = useState(false);
  // On a desktop: the board, or every job in one table (Coy, 2026-10-06:
  // "Can I have a list (table) view as well?"). Remembered on this device.
  const [deskView, setDeskView] = useState<"board" | "table">("board");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      try {
        const v = JSON.parse(localStorage.getItem("sc:jobs-board-view") ?? "null");
        if (v && BOARD_SORTS.some((x) => x.k === v.sort)) setSortState(v.sort);
        if (v && Array.isArray(v.types) && Array.isArray(v.cities)) setFilterState({ types: v.types, cities: v.cities });
        if (localStorage.getItem("sc:jobs-phone-view") === "list") setPhoneView("list");
        if (localStorage.getItem("sc:jobs-desk-view") === "table") setDeskView("table");
      } catch { /* no saved view */ }
    });
    return () => { off = true; };
  }, []);
  const saveView = (next: { sort: BoardSort; filter: BoardFilter }) => {
    try { localStorage.setItem("sc:jobs-board-view", JSON.stringify({ sort: next.sort, ...next.filter })); } catch { /* private window */ }
  };
  const setSort = (v: BoardSort) => { setSortState(v); saveView({ sort: v, filter }); };
  const setFilter = (v: BoardFilter) => { setFilterState(v); saveView({ sort, filter: v }); };
  const flipView = () => {
    const v = phoneView === "board" ? "list" : "board";
    setPhoneView(v);
    try { localStorage.setItem("sc:jobs-phone-view", v); } catch { /* private window */ }
    if (v === "board") requestAnimationFrame(() => goTo(col));
  };
  const flipDesk = () => {
    const v = deskView === "board" ? "table" : "board";
    setDeskView(v);
    try { localStorage.setItem("sc:jobs-desk-view", v); } catch { /* private window */ }
  };
  // ?new=1 — Dusty's + menu → New job (2026-10-01).
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off && new URLSearchParams(window.location.search).get("new") === "1") setNewOpen(true); });
    // Already on this page: the menu says so with an event.
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "job") setNewOpen(true); };
    window.addEventListener("sc:create", on);
    return () => { off = true; window.removeEventListener("sc:create", on); };
  }, []);

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

  const visible = sortJobs(filterJobs(jobs ?? [], filter), sort);
  const byStage = STAGES.map((s) => visible.filter((j) => stageOf(j.status).k === s.k));
  const nFilters = filter.types.length + filter.cities.length;
  const ctl: React.CSSProperties = { height: 30, border: `1px solid ${T.hair}`, background: T.card, borderRadius: 4, fontFamily: disp, fontSize: F.xs,
    textTransform: "uppercase", letterSpacing: ".05em", color: T.ink2, cursor: "pointer", padding: "0 8px" };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 140px)" }}>
      <NewJobSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter jobs" sub="Pick any — a job shows when it matches one of each">
        <div className="px-4 py-3 flex flex-col gap-4">
          <div className="lg:hidden">
            <div style={{ ...eyebrow, marginBottom: 6 }}>Sort</div>
            <div className="flex flex-wrap gap-1.5">
              {BOARD_SORTS.map((o) => {
                const on = sort === o.k;
                return (
                  <button key={o.k} onClick={() => setSort(o.k)} className="rounded-full px-3"
                    style={{ height: 30, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, fontSize: F.sm, cursor: "pointer" }}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          {([
            { k: "types" as const, title: "Job type", opts: [...Object.keys(JOB_TYPE_LABEL), "none"].map((t) => ({ v: t, l: t === "none" ? "Type?" : JOB_TYPE_LABEL[t], n: (jobs ?? []).filter((j) => (j.job_type ?? "none") === t).length })) },
            { k: "cities" as const, title: "City", opts: cityCounts(jobs ?? []).map((c) => ({ v: c.city, l: c.city === "none" ? "No city" : c.city, n: c.n })) },
          ]).map((g) => (
            <div key={g.k}>
              <div style={{ ...eyebrow, marginBottom: 6 }}>{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.opts.filter((o) => o.n > 0 || filter[g.k].includes(o.v)).map((o) => {
                  const on = filter[g.k].includes(o.v);
                  return (
                    <button key={o.v} onClick={() => setFilter({ ...filter, [g.k]: on ? filter[g.k].filter((x) => x !== o.v) : [...filter[g.k], o.v] })}
                      className="rounded-full px-3" style={{ height: 30, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, fontSize: F.sm, cursor: "pointer" }}>
                      {o.l} <span style={{ ...nums, opacity: 0.7 }}>{o.n}</span>
                    </button>
                  );
                })}
                {g.opts.every((o) => o.n === 0) && <span style={{ fontSize: F.sm, color: T.ink3 }}>None on the board yet.</span>}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setFilter({ types: [], cities: [] })} style={ctl}>Clear all</button>
            <button onClick={() => setFilterOpen(false)} style={{ ...ctl, background: T.ink, color: T.card, borderColor: T.ink }}>Show {visible.length} jobs</button>
          </div>
        </div>
      </Sheet>
      <MoveSheet job={moving} onClose={() => setMoving(null)}
        onMove={(status) => { const j = moving; setMoving(null); if (j) void patch(j.id, { status }); }} />

      {/* The page's header stays at the top while the dashboard header slides
          away on a phone (Coy, 2026-10-06). One row: ☰ · Jobs · Sort · Filter ·
          the view · + New job. */}
      <PageHeader title="Jobs" menu={<MenuButton onClick={() => setStagesOpen(true)} label="Job stages" />}
        sub="Every job from first call to done, by stage. Move a card along as the work moves."
        actions={<>
          {/* On a phone Sort is in the filter panel (Coy, 2026-10-09). */}
          <select value={sort} onChange={(e) => setSort(e.target.value as BoardSort)} aria-label="Sort jobs" title="Sort jobs" className="hidden lg:block" style={{ ...ctl, minWidth: 0, maxWidth: 140, flexShrink: 1 }}>
            {BOARD_SORTS.map((o) => <option key={o.k} value={o.k}>↕ {o.label}</option>)}
          </select>
          <button onClick={() => setFilterOpen(true)} aria-label={nFilters ? `Filter · ${nFilters} in use` : "Filter"} title="Filter by job type and city"
            className="shrink-0 flex items-center justify-center rounded"
            style={{ width: 30, height: 30, border: `1px solid ${nFilters ? T.hiviz : T.hair}`, background: nFilters ? T.hivizDim : T.card, cursor: "pointer", position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={nFilters ? T.hiviz : T.ink2} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3.5h15l-6 7v5.5l-3 1.5v-7z" /></svg>
            {nFilters > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 14, height: 14, borderRadius: 7, background: T.hiviz, color: T.onHiviz, fontSize: 9, fontWeight: 700, lineHeight: "14px", textAlign: "center", padding: "0 3px" }}>{nFilters}</span>}
          </button>
          <button onClick={flipView} className="lg:hidden shrink-0 flex items-center justify-center rounded"
            aria-label={phoneView === "board" ? "Show as a list" : "Show as a board"} title={phoneView === "board" ? "Show as a list" : "Show as a board"}
            style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, cursor: "pointer" }}>
            {phoneView === "board"
              ? <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10" /><circle cx="3.5" cy="5" r=".9" fill="currentColor" /><circle cx="3.5" cy="10" r=".9" fill="currentColor" /><circle cx="3.5" cy="15" r=".9" fill="currentColor" /></svg>
              : <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="4" height="14" rx=".8" /><rect x="8" y="3" width="4" height="9" rx=".8" /><rect x="13.5" y="3" width="4" height="11" rx=".8" /></svg>}
          </button>
          <div className="hidden lg:flex rounded overflow-hidden shrink-0" role="tablist" aria-label="View" style={{ border: `1px solid ${T.hair}` }}>
            {(["board", "table"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={deskView === v} onClick={() => { if (deskView !== v) flipDesk(); }}
                className="flex items-center gap-1.5 px-2.5" title={v === "board" ? "Board by stage" : "Every job in a table"}
                style={{ height: 30, background: deskView === v ? T.ink : T.card, color: deskView === v ? T.card : T.ink2, border: "none",
                         fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
                {v === "board"
                  ? <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="4" height="14" rx=".8" /><rect x="8" y="3" width="4" height="9" rx=".8" /><rect x="13.5" y="3" width="4" height="11" rx=".8" /></svg>
                  : <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="1" /><path d="M2.5 8h15M2.5 12.3h15M8 8v8.5" /></svg>}
                {v === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
          {/* On a phone the ScopeCrete emblem: Dusty asks "a new job, or edit one?"
              (Coy, 2026-10-09). The desktop keeps + New job. */}
          {!limited && <button onClick={() => { window.dispatchEvent(new Event("sc:dusty-open")); window.dispatchEvent(new Event("sc:dusty-jobs")); }}
            className="lg:hidden shrink-0 flex items-center justify-center rounded" aria-label="New or existing job — ask Dusty" title="New or existing job"
            style={{ width: 34, height: 34, border: `1px solid ${T.hiviz}`, background: T.card, cursor: "pointer" }}>
            <Emblem size={22} spin />
          </button>}
          {!limited && <button onClick={() => setNewOpen(true)} className="hidden lg:block rounded px-3 sc-new-btn shrink-0"
            style={{ height: 34, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.sm, fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", whiteSpace: "nowrap" }}>
            + New job
          </button>}
        </>}>
        {error && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{error}</div>}
        {nFilters > 0 && <div className="flex items-center gap-2 flex-wrap mt-2">
          {[...filter.types.map((t) => ({ k: "types" as const, v: t, l: t === "none" ? "Type?" : JOB_TYPE_LABEL[t] ?? t })),
            ...filter.cities.map((c) => ({ k: "cities" as const, v: c, l: c === "none" ? "No city" : c }))].map((chip) => (
            <button key={chip.k + chip.v} onClick={() => setFilter({ ...filter, [chip.k]: filter[chip.k].filter((x) => x !== chip.v) })}
              className="rounded-full px-2.5" style={{ height: 26, border: `1px solid ${T.ink}`, background: T.slab, fontSize: F.xs, color: T.ink, cursor: "pointer" }}>
              {chip.l} ×
            </button>
          ))}
          {nFilters > 0 && <button onClick={() => setFilter({ types: [], cities: [] })} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Clear</button>}
          {jobs && <span style={{ fontSize: F.xs, color: T.ink3 }}>{visible.length} of {jobs.length} jobs</span>}
        </div>}

        {/* Stage strip — phone only; desktop shows every column's header. */}
        <div className={`${phoneView === "list" ? "hidden" : "flex"} gap-1.5 overflow-x-auto mt-2 lg:hidden`} style={{ scrollbarWidth: "none" }}>
          {STAGES.map((s, i) => (
            <button key={s.k} onClick={() => goTo(i)} className="shrink-0 rounded px-2.5 flex items-center gap-1.5"
              style={{ height: 30, border: `1px solid ${col === i ? T.ink : T.hair}`, background: col === i ? T.ink : T.card,
                       color: col === i ? T.card : T.ink2, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", cursor: "pointer" }}>
              {s.label}
              <span style={{ ...nums, fontSize: F.xs, opacity: 0.8 }}>{jobs ? byStage[i].length : "·"}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      {jobs === null ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 70, background: T.hairSoft }} />)}
        </div>
      ) : (
        <>
        {phoneView === "list" && (
          <div className="lg:hidden px-2.5 py-2 space-y-2">
            <button onClick={() => setStagesOpen(true)} className="flex items-baseline gap-2" style={{ padding: "2px 2px 4px", background: "transparent", border: "none", cursor: "pointer", color: T.ink }}>
              <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase" }}>{STAGES[col].label}</span>
              <span style={{ ...nums, fontSize: F.xs, color: T.ink3 }}>{byStage[col].length}</span>
              <span aria-hidden="true" style={{ fontSize: F.xs, color: T.ink3 }}>▾</span>
            </button>
            {byStage[col].length === 0
              ? <div className="rounded px-3 py-4 text-center" style={{ fontSize: F.xs, color: T.ink3, border: `1px dashed ${T.hair}` }}>
                  {nFilters > 0 ? `Nothing in ${STAGES[col].label} matches the filter.` : `Nothing in ${STAGES[col].label}.`}
                </div>
              : byStage[col].map((j) => (
                <JobCard key={j.id} j={j} busy={busy === j.id} readOnly={limited}
                  next={col < STAGES.length - 2 ? STAGES[col + 1] : null}
                  onNext={(status) => void patch(j.id, { status })}
                  onMove={() => setMoving(j)}
                  onAccept={() => void patch(j.id, { accept: true })}
                  onFlag={(archive) => void patch(j.id, archive ? { archive: true } : { keep: true })} />
              ))}
          </div>
        )}
        {deskView === "table" && (
          <div className="hidden lg:block px-5 pb-6">
            <JobsTable jobs={visible} busy={busy} readOnly={limited} sort={sort} onSort={setSort}
              onMove={(j) => setMoving(j)} onAccept={(j) => void patch(j.id, { accept: true })} />
          </div>
        )}
        <div ref={lane} onScroll={onScroll}
          className={`flex-1 ${phoneView === "list" ? "hidden" : "flex"} ${deskView === "table" ? "lg:hidden" : "lg:flex"} overflow-x-auto snap-x snap-mandatory lg:snap-none lg:gap-2 lg:p-2`}
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
                    {jobs.length > 0 && nFilters > 0 ? `Nothing in ${s.label} matches the filter.` : jobs.length === 0 && i === 0
                      ? "No jobs yet. + New job starts one — a job is the container from first contact onward."
                      : `Nothing in ${s.label}.`}
                  </div>
                ) : byStage[i].map((j) => (
                  <JobCard key={j.id} j={j} busy={busy === j.id} readOnly={limited}
                    next={i < STAGES.length - 2 ? STAGES[i + 1] : null}
                    onNext={(status) => void patch(j.id, { status })}
                    onMove={() => setMoving(j)}
                    onAccept={() => void patch(j.id, { accept: true })}
                    onFlag={(archive) => void patch(j.id, archive ? { archive: true } : { keep: true })} />
                ))}
              </div>
            </section>
          ))}
        </div>
        </>
      )}

      {/* ☰ — every stage with its count; a tap shows it (Coy, 2026-10-06). */}
      {stagesOpen && (
        <div className="lg:hidden fixed inset-0 z-50" style={{ top: "var(--sc-head)", bottom: "var(--sc-foot)" }}>
          <button aria-label="Close" onClick={() => setStagesOpen(false)} className="absolute inset-0" style={{ background: "rgba(0,0,0,.36)", border: "none" }} />
          <nav aria-label="Job stages" className="absolute left-0 top-0 bottom-0 flex flex-col overflow-y-auto" style={{ width: 220, background: T.card, padding: "6px 4px" }}>
            <div style={{ ...eyebrow, padding: "6px 8px" }}>Stages</div>
            {STAGES.map((s, i) => (
              <button key={s.k} onClick={() => { setStagesOpen(false); if (phoneView === "board") goTo(i); else { setCol(i); window.scrollTo({ top: 0 }); } }}
                aria-current={col === i ? "true" : undefined} className="w-full text-left flex items-center gap-2"
                style={{ minHeight: 40, padding: "0 10px", borderRadius: 4, border: "none", background: col === i ? T.hivizDim : "transparent",
                         color: col === i ? T.hivizText : T.ink, fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" }}>
                <span style={{ flex: 1 }}>{s.label}</span>
                <span style={{ ...nums, fontSize: F.xs, color: T.ink3 }}>{jobs ? byStage[i].length : "·"}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- table */

// Every job in one table on a desktop (Coy, 2026-10-06): the job and what it
// is, who for, where, its stage, how it came in, and how long it has sat.
const STAGE_HUE: Record<string, string> = {
  new: T.hiviz, consult: T.violet, estimating: T.chalk, follow: T.hivizText, won: T.green, wip: T.green, complete: T.ink3, lost: T.red,
};

function JobsTable({ jobs, busy, readOnly, sort, onSort, onMove, onAccept }: {
  jobs: Job[]; busy: string | null; readOnly?: boolean; sort: BoardSort; onSort: (s: BoardSort) => void;
  onMove: (j: Job) => void; onAccept: (j: Job) => void;
}) {
  const router = useRouter();
  const th = (label: string, k?: BoardSort, alt?: BoardSort, align: "left" | "right" = "left"): React.ReactNode => {
    const on = k && (sort === k || sort === alt);
    return (
      <th scope="col" style={{ ...eyebrow, textAlign: align, padding: "10px 12px", color: on ? T.ink : T.ink3, whiteSpace: "nowrap",
                                position: "sticky", top: "calc(var(--sc-head) + var(--sc-subhead, 0px))", background: T.slab, zIndex: 1, borderBottom: `1px solid ${T.hair}` }}>
        {k ? (
          <button onClick={() => onSort(sort === k && alt ? alt : k)} style={{ all: "unset", cursor: "pointer" }}
            title={`Sort by ${label.toLowerCase()}`}>
            {label}{on ? (sort === "oldest" ? " ↑" : " ↓") : ""}
          </button>
        ) : label}
      </th>
    );
  };
  if (!jobs.length) {
    return <div className="rounded px-3 py-6 text-center" style={{ fontSize: F.sm, color: T.ink3, border: `1px dashed ${T.hair}` }}>No jobs match.</div>;
  }
  return (
    <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
      <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: F.sm }}>
        <thead>
          <tr>
            {th("Job", "az")}
            {th("Customer")}
            {th("Stage")}
            {th("Type")}
            {th("Source")}
            {th("Sections", undefined, undefined, "right")}
            {th("Created", "newest", "oldest")}
            {th("In stage", "moved")}
            {!readOnly && <th style={{ position: "sticky", top: "calc(var(--sc-head) + var(--sc-subhead, 0px))", background: T.slab, borderBottom: `1px solid ${T.hair}` }} />}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, i) => {
            const st = stageOf(j.status);
            const hue = STAGE_HUE[st.k] ?? T.ink3;
            const tag = j.status ? STATUS_TAG[j.status] : null;
            const who = j.contact_name?.trim() || (j.contact_phone ? formatPhone(j.contact_phone) : null);
            const source = j.referred_by_name ? `via ${j.referred_by_name}` : j.lead_source ? SOURCE_LABEL[j.lead_source] : null;
            const td: React.CSSProperties = { padding: "9px 12px", borderTop: i ? `1px solid ${T.hairSoft}` : "none", verticalAlign: "top" };
            return (
              <tr key={j.id} className="sc-job-row" onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) router.push(`/dashboard/scope/${j.id}/summary`); }}
                style={{ cursor: "pointer", opacity: busy === j.id ? 0.5 : 1 }}>
                <td style={{ ...td, maxWidth: 360 }}>
                  <Link href={`/dashboard/scope/${j.id}/summary`} className="no-underline" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink }}>
                    {j.title || "Untitled job"}
                  </Link>
                  {j.description && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, ...clip }}>{j.description}</div>}
                  {j.flag_reason && <div style={{ fontSize: F.xs, color: T.hivizText, marginTop: 2, ...clip }}>⚑ {j.flag_reason}</div>}
                </td>
                <td style={{ ...td, maxWidth: 260 }}>
                  <div style={{ color: who ? T.ink : T.ink3, ...clip }}>{who ?? "No customer yet"}</div>
                  {(j.city || j.address) && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{j.city ?? j.address}</div>}
                </td>
                <td style={td}>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2" style={{ height: 22, background: `color-mix(in srgb, ${hue} 14%, ${T.card})`, color: T.ink, fontSize: F.xs, whiteSpace: "nowrap" }}>
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: hue }} />
                    {st.label}{tag ? <span style={{ color: T.ink3 }}>· {tag}</span> : null}
                  </span>
                  {!j.counts_toward_value && <div style={{ ...eyebrow, fontSize: F.micro, color: T.hiviz, marginTop: 3 }}>Suggested</div>}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap", color: j.job_type ? T.ink2 : T.hiviz }}>{j.job_type ? JOB_TYPE_LABEL[j.job_type] ?? j.job_type : "Type?"}</td>
                <td style={{ ...td, color: source ? T.ink2 : T.ink3, maxWidth: 180, ...clip }}>{source ?? "—"}</td>
                <td style={{ ...td, ...nums, textAlign: "right", color: j.section_count ? T.ink2 : T.hiviz }}>{j.section_count || "—"}</td>
                <td style={{ ...td, ...nums, whiteSpace: "nowrap", color: T.ink2 }}>
                  {j.created_at ? new Date(j.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : "—"}
                </td>
                <td style={{ ...td, ...nums, whiteSpace: "nowrap", color: T.ink3 }}>{relTime(j.stage_changed_at ?? j.created_at) ?? "—"}</td>
                {!readOnly && (
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {!j.counts_toward_value
                      ? <button disabled={busy === j.id} onClick={() => onAccept(j)} className="rounded px-2.5"
                          style={{ height: 26, background: T.ink, color: T.card, border: `1px solid ${T.ink}`, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>Accept</button>
                      : <button disabled={busy === j.id} onClick={() => onMove(j)} className="rounded px-2.5"
                          style={{ height: 26, background: T.card, color: T.ink2, border: `1px solid ${T.hair}`, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>Move</button>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function JobCard({ j, busy, readOnly, next, onNext, onMove, onAccept, onFlag }: {
  j: Job; busy: boolean; readOnly?: boolean; next: (typeof STAGES)[number] | null;
  onNext: (status: string) => void; onMove: () => void; onAccept: () => void;
  onFlag: (archive: boolean) => void;
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
        <Link href={`/dashboard/scope/${j.id}/summary`} className="no-underline"
          style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, ...clip, flex: 1, minWidth: 0 }}>
          {j.title || "Untitled job"} ›
        </Link>
        {since && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }} title={j.stage_changed_at ? "Since it moved to this stage" : undefined}>{since}</span>}
      </div>
      {/* Coy, 2026-09-28: a 1–3 word title; the customer, the address and a
          short description under it — never the whole description as the title. */}
      <div style={{ fontSize: F.xs, color: T.ink2, ...clip, marginTop: 1 }}>
        {who}{j.address ? ` · ${j.address}` : ""}
      </div>
      {j.description && (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 1, display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>{j.description}</div>
      )}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5" style={{ marginTop: 4 }}>
        {tag && <span style={small(T.hiviz)}>{tag}</span>}
        {j.job_type
          ? <span style={small(T.chalk)}>{JOB_TYPE_LABEL[j.job_type] ?? j.job_type}</span>
          : <span style={small(T.hiviz)} title="Made automatically with no type — set it on the job">Type?</span>}
        {source && <span style={small(T.violet)}>{source}</span>}
        <span style={small(j.section_count ? T.ink3 : T.hiviz)}>
          {j.section_count ? `${j.section_count} section${j.section_count === 1 ? "" : "s"}` : "Not scoped"}
        </span>
        {j.created_at && (
          <span style={small(T.ink3)} title="When the job was made">
            Created {new Date(j.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}
          </span>
        )}
      </div>
      {j.flag_reason && !readOnly && (
        <div className="rounded px-2 py-1.5 mt-2" style={{ background: T.hivizDim, border: `1px solid ${T.hiviz}` }}>
          <div style={{ fontSize: F.xs, color: T.ink }}>{j.flag_reason}</div>
          <div className="flex gap-1.5 mt-1.5">
            <button disabled={busy} onClick={() => onFlag(true)} style={{ ...btn, background: T.ink, color: T.card, borderColor: T.ink }}>Archive</button>
            <button disabled={busy} onClick={() => onFlag(false)} style={btn}>Keep</button>
          </div>
        </div>
      )}
      {!readOnly && <div className="flex items-center gap-1.5" style={{ marginTop: 8 }}>
        {!j.counts_toward_value ? (
          <>
            <span style={{ ...eyebrow, color: T.hiviz, flex: 1 }}>Suggested — not counted</span>
            <button disabled={busy} onClick={onAccept} style={{ ...btn, background: T.ink, color: T.card, borderColor: T.ink }}>Accept</button>
          </>
        ) : (
          <>
            <span className="flex-1" style={{ minWidth: 0 }} />
            <button disabled={busy} onClick={onMove} aria-label="Move to another stage" title="Move to another stage"
              style={{ ...btn, flexShrink: 0, width: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 2.5v15M2.5 10h15M10 2.5l-2.2 2.2M10 2.5l2.2 2.2M10 17.5l-2.2-2.2M10 17.5l2.2-2.2M2.5 10l2.2-2.2M2.5 10l2.2 2.2M17.5 10l-2.2-2.2M17.5 10l-2.2 2.2" />
              </svg>
            </button>
            {next && (
              <button disabled={busy} onClick={() => onNext(next.enter)} title={`Move to ${next.label}`}
                style={{ ...btn, color: T.ink, borderColor: T.ink3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {next.label} »
              </button>
            )}
          </>
        )}
      </div>}
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
            {/* Won holds two statuses (not started, scheduled); a job inside it moves between them here. */}
            {s.statuses.length > 1 && here?.k === s.k && (
              <div className="flex gap-1.5 flex-wrap px-3 pb-2">
                {s.statuses.map((st) => (
                  <button key={st} onClick={() => onMove(st)} disabled={job?.status === st}
                    className="rounded-full px-2.5"
                    style={{ height: 26, fontSize: F.xs, border: `1px solid ${job?.status === st ? T.ink : T.hair}`,
                             background: job?.status === st ? T.ink : T.card, color: job?.status === st ? T.card : T.ink2, cursor: "pointer" }}>
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
    border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
  });

  const choosing = customer === null || (picking === "referrer" && !referrer && source === "referral");
  const label = (t: PickThread | null | "none") => t === "none" ? "Nobody yet" : t ? t.display_name : "";

  return (
    <Sheet open={open} onClose={close} title="New job"
      sub={choosing ? (picking === "referrer" ? "Who sent it?" : undefined) : "What kind of job?"}>
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
            style={{ height: 40, background: jobType ? T.hiviz : T.hair, color: T.onHiviz, fontFamily: disp, fontSize: F.md, fontWeight: 600,
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
