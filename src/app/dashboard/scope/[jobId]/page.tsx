"use client";

/**
 * The Scope builder — one job, its sections, the takeoff, the budget's price
 * and the job minimum (day minimum × days, migration 057).
 *
 * Structure from v34's ScopeScreen (sections as cards with L × W, thickness,
 * a dark money panel) and, at lg+, the desktop design's scope builder
 * (docs/design/desktop-screens.html, 1h): sections in the middle, a dark
 * takeoff rail on the right that says "No price on this scope" and names
 * exactly what is missing rather than printing a guess.
 *
 * All the arithmetic is src/lib/engine — DECISIONS §3/§4, tested in
 * tests/engine.test.mjs. Nothing on this screen computes money itself.
 *
 * Edits apply to the screen immediately and save on blur, one field at a time.
 * A failed save says so on the section; the screen never pretends it saved.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RailMarket } from "@/components/v34/market-rates";
import { useDustyDocked } from "@/lib/v34/use-dusty-docked";
import { VoiceRecorder } from "@/components/v34/voice-recorder";
import { useParams } from "next/navigation";
import { T, F, disp, light, eyebrow, nums, clip, money, money0, formatPhone } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { FilesPanel, type FileRow } from "@/components/v34/files-panel";
import { SectionPhotos } from "@/components/v34/section-photos";
import { SectionDetails } from "@/components/v34/section-details";
import { ScopeBullets } from "@/components/v34/scope-of-work";
import { sowFromAnswer, sowQuestion } from "@/lib/scope-of-work";
import { setDustyUse } from "@/lib/v34/dusty-live";
import { USE_ASK } from "@/lib/dusty/use-block";
import { DustyEmblem } from "@/components/v34/dusty-avatar";
import { isDetailFile, type SectionShape } from "@/lib/plan-details";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { JobBudget, NotesToggle, type BudgetSummary } from "@/components/v34/job-budget";
import { BudgetSubTabs, useBudgetTab } from "@/components/v34/budget-tabs";
import { MarketRates } from "@/components/v34/market-rates";
import { ActualCosts } from "@/components/v34/actual-costs";
import { SheetViewer, type SheetGroup } from "@/components/v34/sheet-viewer";
import type { PlansData } from "@/components/v34/plan-room/shared";
import { sheetsFor } from "@/lib/section-sheets";
import { quotedLine } from "@/lib/find-on-sheet";
import {
  takeoff as takeoffOf, quantities, ruleQty,
  type SectionInput,
} from "@/lib/engine";
import { isReinforcementCard } from "@/lib/cost-cards";
import { useAccess } from "@/lib/v34/access-ctx";
import { can } from "@/lib/access";
import { SectionSizes } from "@/components/v34/section-sizes";
import { SectionTakeoffStrip, groupOf, shapesOf } from "@/components/v34/section-takeoff";
import { fmtQty } from "@/lib/takeoff";

interface Section extends SectionInput {
  id: string;
  rebar: string | null;
  /** The reinforcement card (step 3b): carried as the area's reinforcement line on the budget. */
  reinforcement_item_id?: string | null;
  reinforcement_source?: "set" | "default" | null;
  prep_notes: string | null;
  access_notes: string | null;
  sort_order: number;
  /** Follows its Plan Room takeoffs (migration 069). */
  takeoff_sync?: boolean;
  /** 'bid' when a forwarded bid made it (063); source_ref is the line it came from. */
  origin?: string | null;
  source_ref?: string | null;
}
interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null; customer_id?: string | null;
  job_type: string | null; lead_source: string | null; description?: string | null; origin?: string | null;
  archived_at?: string | null; archived_reason?: string | null; created_at?: string | null;
}
interface Contact { id: string; name: string | null; phone: string | null }
interface Why {
  filed_at: string | null; filed_by: "coy" | "dusty" | null;
  status_summary: string | null; recent_summary: string | null;
  evidence_quote: string | null; evidence_at: string | null;
  company: string | null; scope_summary: string | null;
}
// The trigger's fallback title when Dusty had no job title and no kind of
// work (migration 040). Not a name — shown as an empty box asking for one.
const PLACEHOLDER_TITLES = new Set(["New job", "Untitled scope"]);

const n1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export default function ScopeBuilder() {
  const { jobId } = useParams<{ jobId: string }>();
  const access = useAccess();
  // The job header's height, so the sticky wrapper can park it above the screen while the
  // dashboard header is hidden (the CSS under html[data-head-hide], v34-shell.css).
  const measureHead = useCallback((el: HTMLDivElement | null) => {
    const box = el?.parentElement;
    if (!el || !box) return;
    const ro = new ResizeObserver(() => box.style.setProperty("--sc-job-head-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [job, setJob] = useState<Job | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  // The crew on the job (migration 093) — null until 093 is applied.
  const [crew, setCrew] = useState<{ size: number | null; hours: number | null } | null>(null);
  // Which sections are open (Coy, 2026-10-08: "less busy and easier to read") — the rest fold to one
  // line. Remembered on the device per job; with nothing remembered a job with one section opens it.
  const [openSecs, setOpenSecs] = useState<Set<string> | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(`sc:open-sections:${jobId}`); setOpenSecs(v ? new Set(JSON.parse(v) as string[]) : null); } catch { setOpenSecs(null); }
  }, [jobId]);
  const toggleSec = useCallback((id: string, all: string[]) => setOpenSecs((cur) => {
    const n = new Set(cur ?? (all.length === 1 ? all : []));
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(`sc:open-sections:${jobId}`, JSON.stringify([...n].slice(-100))); } catch { /* no storage */ }
    return n;
  }), [jobId]);
  // Dusty docked on a desktop: the totals move into his panel (Coy, 2026-09-30).
  const docked = useDustyDocked();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!docked) return;
    let raf = 0;
    const find = () => { const el = document.getElementById("sc-dusty-slot"); if (el) setSlot(el); else raf = requestAnimationFrame(find); };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [docked]);
  const railSlot = docked && slot?.isConnected ? slot : null;
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [rcards, setRcards] = useState<RCard[]>([]);
  // The job's files, for each section's Photos strip (Coy, 2026-09-30).
  const [jobFiles, setJobFiles] = useState<FileRow[]>([]);
  const [filesTick, setFilesTick] = useState(0);
  useEffect(() => {
    let off = false;
    send(`/api/files?job_id=${jobId}`, "GET").then((b) => { if (!off) setJobFiles(b.files as FileRow[]); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, filesTick]);
  const fileChanged = useCallback((f: FileRow | null, removedId?: string) => {
    setJobFiles((a) => (removedId ? a.filter((x) => x.id !== removedId) : f ? [f, ...a.filter((x) => x.id !== f.id)] : a));
    setFilesTick((n) => n + 1);
  }, []);
  // Which areas' photos are off the proposal (display.picsOff on the draft) — the section's
  // "On the proposal" switch (Coy, 2026-10-05). null = no draft yet, or not theirs to see.
  const [picsOff, setPicsOff] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (access.limited) return;
    let off = false;
    send(`/api/jobs/${jobId}/proposal?display=1`, "GET")
      .then((b) => { if (!off) setPicsOff(b.draft ? ((b.display?.picsOff ?? {}) as Record<string, boolean>) : {}); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, access.limited]);
  const setPics = useCallback((sectionId: string, on: boolean) => {
    setPicsOff((m) => { const n = { ...(m ?? {}) }; if (on) delete n[sectionId]; else n[sectionId] = true; return n; });
    const patch = () => send(`/api/jobs/${jobId}/proposal`, "PATCH", { pics: { section_id: sectionId, on } });
    // No draft yet: opening the proposal makes one, then the switch is saved on it.
    void patch().catch(() => send(`/api/jobs/${jobId}/proposal`, "GET").then(patch)).catch(() => {
      setPicsOff((m) => { const n = { ...(m ?? {}) }; if (on) n[sectionId] = true; else delete n[sectionId]; return n; });
    });
  }, [jobId]);
  // The plan sheets each section's scope came from, to check it against (Coy, 2026-10-02).
  const [plans, setPlans] = useState<PlansData | null>(null);
  const [plansTick, setPlansTick] = useState(0);
  const [viewer, setViewer] = useState<{ title: string; groups: SheetGroup[]; start: string | null; find?: string | null } | null>(null);
  useEffect(() => {
    let off = false;
    send(`/api/jobs/${jobId}/plans`, "GET").then((b) => { if (!off) setPlans(b as PlansData); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, plansTick]);
  // The budget's own totals (migration 048). Since step 3b it is the ONLY price.
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  // Bumped when a section change may have changed the budget on the server
  // (an assembly loaded, a reinforcement line swapped, an area removed).
  const [budgetTick, setBudgetTick] = useState(0);
  // Market rate · Proposed budget · Actual costs (Budget v3, Coy 2026-10-09).
  const [tab, setTab] = useBudgetTab();
  // Each section card's budget slot (its cost items are drawn there by JobBudget).
  const [slots, setSlots] = useState<Record<string, HTMLElement>>({});
  const onSlot = useCallback((id: string, el: HTMLElement | null) => setSlots((prev) => {
    if (el ? prev[id] === el : !(id in prev)) return prev;
    const next = { ...prev };
    if (el) next[id] = el; else delete next[id];
    return next;
  }), []);

  const load = useCallback(async () => {
    try {
      const [j, s, r] = await Promise.all([
        send(`/api/jobs/${jobId}`, "GET"),
        send(`/api/jobs/${jobId}/sections`, "GET"),
        // Reinforcement is a card (step 3b). A failure leaves none to pick, not a broken page.
        send("/api/cost-items", "GET").catch(() => ({ items: [] })),
      ]);
      setRcards(((r.items ?? []) as Array<Record<string, unknown>>)
        .map((x) => ({ id: x.id as string, name: x.name as string, unit: x.unit as string, unit_cost: num(x.unit_cost),
          qty_rule: x.qty_rule as string, rule_params: (x.rule_params ?? {}) as Record<string, number> }))
        .filter(isReinforcementCard));
      setJob(j.job); setContact(j.contact ?? null); setWhy(j.why ?? null); setCrew(j.crew ?? null);
      setSections((s.sections as Section[]).map(numify));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  // A section's takeoffs changed (migration 069): its size, the plans' links and the budget move together.
  const takeoffChanged = useCallback(() => { void load(); setPlansTick((n) => n + 1); setBudgetTick((n) => n + 1); }, [load]);

  const t = useMemo(() => takeoffOf(sections ?? [], null), [sections]);

  // Drag a section by its grip to reorder (Coy, 2026-10-15: "click and drag it to an area and the 2 other
  // sections separate and it snaps in when the click is released"). The card follows the pointer, the
  // cards it passes slide out of its way, and on release the list is reordered and each section whose
  // place changed gets its sort_order. Styles are set on the cards directly, so nothing re-renders mid-drag.
  const secsRef = React.useRef(sections); secsRef.current = sections;
  const startDrag = (id: string, e: React.PointerEvent) => {
    const list = secsRef.current;
    if (!list) return;
    e.preventDefault();
    const cards = [...document.querySelectorAll<HTMLElement>("[data-sec-id]")];
    const from = cards.findIndex((c) => c.dataset.secId === id);
    if (from < 0) return;
    const rects = cards.map((c) => c.getBoundingClientRect());
    const me = cards[from];
    const step = rects[from].height + 6; // the card and the gap above the next
    const startY = e.clientY, startScroll = window.scrollY;
    let to = from;
    me.style.position = "relative"; me.style.zIndex = "30"; me.style.boxShadow = "0 8px 24px rgba(0,0,0,.18)";
    me.style.transition = "box-shadow .15s"; document.body.style.cursor = "grabbing"; document.body.style.userSelect = "none";
    cards.forEach((c, i) => { if (i !== from) c.style.transition = "transform .18s ease"; });
    const place = (clientY: number) => {
      const dy = clientY - startY + (window.scrollY - startScroll);
      me.style.transform = `translateY(${dy}px) scale(1.01)`;
      const mid = rects[from].top + rects[from].height / 2 + dy;
      to = from;
      for (let i = 0; i < cards.length; i++) {
        if (i === from) continue;
        const m = rects[i].top + rects[i].height / 2;
        if (i < from && mid < m) { to = Math.min(to, i); }
        if (i > from && mid > m) { to = Math.max(to, i); }
      }
      cards.forEach((c, i) => {
        if (i === from) return;
        const shift = from < to && i > from && i <= to ? -step : from > to && i >= to && i < from ? step : 0;
        c.style.transform = shift ? `translateY(${shift}px)` : "";
      });
      // Near the screen's edge, scroll the page.
      if (clientY < 80) window.scrollBy(0, -12); else if (clientY > window.innerHeight - 80) window.scrollBy(0, 12);
    };
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => { lastY = ev.clientY; place(ev.clientY); };
    const onScroll = () => place(lastY);
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up); window.removeEventListener("scroll", onScroll);
      cards.forEach((c) => { c.style.transition = ""; c.style.transform = ""; c.style.zIndex = ""; c.style.boxShadow = ""; c.style.position = ""; });
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      const a = secsRef.current;
      if (!a || to === from) return;
      const order = cards.map((c) => c.dataset.secId as string);
      const [m] = order.splice(from, 1); order.splice(to, 0, m);
      const byId = new Map(a.map((x) => [x.id, x]));
      const next = [...order.map((x) => byId.get(x)).filter((x): x is Section => !!x), ...a.filter((x) => !order.includes(x.id))];
      next.forEach((x, i) => { if (a[i]?.id !== x.id || x.sort_order !== i) void send(`/api/jobs/${jobId}/sections/${x.id}`, "PATCH", { sort_order: i }).catch(() => {}); });
      setSections(next.map((x, i) => ({ ...x, sort_order: i })));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up); window.addEventListener("scroll", onScroll, { passive: true });
  };

  const patchLocal = (id: string, patch: Partial<Section>) =>
    setSections((a) => (a ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function save(id: string, patch: Partial<Section>) {
    try {
      const b = await send(`/api/jobs/${jobId}/sections/${id}`, "PATCH", patch);
      patchLocal(id, numify(b.section));
      if ("work_type" in patch || "reinforcement_item_id" in patch) setBudgetTick((n) => n + 1);
      setSaveErr((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));
    } catch (e) {
      setSaveErr((m) => ({ ...m, [id]: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function addSection() {
    setAdding(true);
    try {
      const b = await send(`/api/jobs/${jobId}/sections`, "POST", {
        name: `Section ${(sections?.length ?? 0) + 1}`, work_type: "slab", sort_order: sections?.length ?? 0,
      });
      setSections((a) => [...(a ?? []), numify(b.section)]);
      toggleSec(b.section.id as string, (sections ?? []).map((x) => x.id));
      setBudgetTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeSection(id: string) {
    try {
      await send(`/api/jobs/${jobId}/sections/${id}`, "DELETE");
      setSections((a) => (a ?? []).filter((s) => s.id !== id));
      setBudgetTick((n) => n + 1);
    } catch (e) {
      setSaveErr((m) => ({ ...m, [id]: e instanceof Error ? e.message : String(e) }));
    }
  }

  // Crew, hours a day or days, from the Cost Analysis: an error message, or null when saved.
  const saveCrew = useCallback(async (patch: { duration_days?: number | null; crew_size?: number | null; crew_hours?: number | null }): Promise<string | null> => {
    try {
      const b = await send(`/api/jobs/${jobId}`, "PATCH", patch);
      if ("duration_days" in patch) setJob((j) => (j ? { ...j, duration_days: b.job.duration_days === null ? null : Number(b.job.duration_days) } : j));
      if ("crew_size" in patch || "crew_hours" in patch) setCrew((c) => ({ size: c?.size ?? null, hours: c?.hours ?? null,
        ...("crew_size" in patch ? { size: patch.crew_size ?? null } : {}), ...("crew_hours" in patch ? { hours: patch.crew_hours ?? null } : {}) }));
      return null;
    } catch (e) { return e instanceof Error ? e.message : String(e); }
  }, [jobId]);

  async function saveCrewDays(v: number | null) {
    try {
      const b = await send(`/api/jobs/${jobId}`, "PATCH", { duration_days: v });
      setJob((j) => (j ? { ...j, duration_days: b.job.duration_days === null ? null : Number(b.job.duration_days) } : j));
    } catch (e) {
      setSaveErr((m) => ({ ...m, job: e instanceof Error ? e.message : String(e) }));
    }
  }

  if (error) return <EmptyState tone="warn" title="Couldn't load this scope" detail={error} />;
  if (!job || !sections) {
    return <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 72, background: T.hairSoft }} />)}</div>;
  }

  const who = contact ? (contact.name || formatPhone(contact.phone)) : null;
  const realTitle = job.title && !PLACEHOLDER_TITLES.has(job.title.trim()) ? job.title : "";
  const titleHint = `Name this job${why?.company || contact?.name ? ` (e.g. ${why?.company || contact?.name} slab)` : ""}`;
  // Each section's sheets: the ones its bid line names, read off the plans (src/lib/section-sheets.ts).
  const planSheets = plans?.sheets ?? [];
  const sheetsOf = (x: Section) => sheetsFor(x.source_ref, planSheets);
  const openSheets = (focus: Section | null, start: string | null) => {
    const label = (x: Section) => x.name || `Section ${sections.indexOf(x) + 1}`;
    const others = sections.filter((x) => x !== focus);
    const groups: SheetGroup[] = focus
      ? [{ label: label(focus), ids: sheetsOf(focus).map((x) => x.id) }, { label: "Other sections' sheets", ids: others.flatMap((x) => sheetsOf(x).map((y) => y.id)) }]
      : sections.map((x) => ({ label: label(x), ids: sheetsOf(x).map((y) => y.id) }));
    setViewer({ title: focus ? `Sheets for ${label(focus)}` : "Plan sheets for this job's scope", groups, start, find: focus ? quotedLine(focus.source_ref) : null });
  };

  return (
    <div className={railSlot || viewer ? "lg:min-h-[calc(100dvh-var(--sc-head))]" : "lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:min-h-[calc(100dvh-var(--sc-head))]"} style={{ color: T.ink }}>
      {/* ================= sections ================= */}
      <div style={{ minWidth: 0 }} className="pb-24 lg:pb-6">
        {/* On a phone the job's header and its numbers stay at the top while the page scrolls,
            and the dashboard header slides away above them (Coy, 2026-10-05). */}
        <div className="sc-job-sticky sticky z-20 lg:static" style={{ top: "var(--sc-head)" }}>
        {/* Scrolling down slides this header away with the dashboard's; the dark strip of numbers under it
            stays at the top (Coy, 2026-10-10) — the wrapper sticks this header's height above the screen. */}
        <div ref={measureHead} className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          {/* Coy, 2026-10-05: the job's name top left, Summary · Plan room · Budget · Proposal top right —
              the same row on every view (JobHeaderRow; centred on a phone). The chips, who it's for,
              the description and "Why this job" moved to the Summary to clear the clutter here. */}
          <JobHeaderRow jobId={jobId} active="job" customerId={job.customer_id}
            subnav={can(access, "budget") ? <BudgetSubTabs tab={tab} onTab={setTab} hang /> : undefined}
            title={access.limited ? (realTitle || titleHint || "Job") : <input defaultValue={realTitle} placeholder={titleHint} aria-label="Job name"
              size={Math.max(6, (realTitle || titleHint || "").length + 1)}
              onBlur={(e) => { const v = e.target.value; if (v !== realTitle) void send(`/api/jobs/${jobId}`, "PATCH", { title: v }).then((b) => setJob((j) => j && { ...j, title: b.job.title })).catch((er) => setSaveErr((m) => ({ ...m, job: String(er.message ?? er) }))); }}
              className="sc-job-name bg-transparent outline-none text-center lg:text-left"
              style={{ minWidth: 0, maxWidth: "100%", fieldSizing: "content", fontFamily: light, fontWeight: 300, lineHeight: 1.15, color: T.ink } as React.CSSProperties} />} />
          {/* An onsite estimator has no Summary (081): they keep who it's for and their phone here. */}
          {access.limited && (
            <div style={{ fontSize: F.xs, color: who ? T.ink3 : T.hiviz, marginTop: 4, ...clip }}>
              {who ? <span style={{ color: T.ink2 }}>{contact?.name || "Customer"}{contact?.phone ? <> · <a href={`tel:${contact.phone}`} style={{ color: T.ink2 }}>{contact.phone}</a></> : null}</span>
                : "Not attached to a customer yet"}
              {job.address ? ` · ${job.address}` : ""}
            </div>
          )}
          {saveErr.job && <div style={{ fontSize: F.xs, color: T.red }}>{saveErr.job}</div>}
          {/* Desktop: the Budget's three tabs open the tools row (Dusty's emblem is on the job's tabs row). */}
          {can(access, "budget") && <div className="hidden lg:flex items-center gap-2 mt-2">
            <BudgetSubTabs tab={tab} onTab={setTab} />
            {tab === "proposed" && <><span className="flex-1" /><NotesToggle /></>}
          </div>}
        </div>

        {/* Phone: the takeoff rail sits below the sections, so the three
            numbers you read out loud ride along under the header. */}
        <div className="lg:hidden px-3 py-1.5 flex items-baseline gap-3"
          style={{ background: T.dark, color: "#fff", ...nums }}>
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700 }}>{railSize(t).n > 0 ? n1(railSize(t).n) : "—"}<span style={{ fontSize: F.xs, color: "#8E99A5" }}> {railSize(t).unit === "LF" ? "lf" : "sf"}</span></span>
          <span className="flex-1" />
          {budget?.has_lines ? (
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums }}>
              {budget.tiers.map((b) => b.priced ? money0(b.total) : "blocked").join(" · ")}
            </span>
          ) : (
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: "#8E99A5" }}>no price</span>
          )}
        </div>
        </div>

        {job.archived_at && (
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.redDim, color: T.ink, fontSize: F.sm }}>
            <span style={{ flex: 1 }}>This job is {job.archived_reason?.startsWith("deleted") ? "deleted" : "archived"} — it isn&apos;t on the board, the Dashboard or Dusty&apos;s lists.</span>
            <button onClick={() => void send(`/api/archive/restore`, "POST", { kind: "job", ids: [jobId] }).then(() => setJob((j) => j && { ...j, archived_at: null, archived_reason: null }))}
              className="rounded px-2.5" style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, cursor: "pointer" }}>Restore</button>
          </div>
        )}


        {can(access, "budget") && tab === "market" && <MarketRates jobId={jobId} refresh={budgetTick} onChanged={() => setBudgetTick((n) => n + 1)}
          onSheets={(sid, sheet) => { const x = sections.find((y) => y.id === sid); if (x) openSheets(x, sheet); }} />}
        {can(access, "budget") && tab === "actuals" && <ActualCosts jobId={jobId} refresh={budgetTick} />}

        {/* The proposed budget stays mounted under the other tabs, so its sections and lines keep their state. */}
        <div hidden={can(access, "budget") && tab !== "proposed"}>
        {/* The bid behind it is on the job's Summary only (Coy, 2026-10-10: "it should be in the summary page"). */}

        {/* The Draft budget box is gone (Coy, 2026-10-11): the budget comes from each section's scope of work, and its research is on Market rate. */}

        {sections.length === 0 && (
          <EmptyState title="No sections yet"
            detail="A driveway, a patio and a tear-out at one address are one job with three sections. Add the first one and give it the dimensions you were told." />
        )}

        {/* Sections counted from one takeoff group sit under it, as in the Plan Room (Coy, 2026-10-03). */}
        {(() => {
          const names = new Map(sections.map((x, i) => [x.id, x.name || `Section ${i + 1}`]));
          const order: Array<string | null> = [];
          const byKey = new Map<string | null, Section[]>();
          for (const x of sections) {
            const g = groupOf(x.id, plans);
            if (!byKey.has(g)) { byKey.set(g, []); order.push(g); }
            byKey.get(g)!.push(x);
          }
          // In the sections' own order, so dragging one moves it where it lands (Coy, 2026-10-15);
          // its takeoff group is named on its row.
          return sections.map((s) => {
                  const g = groupOf(s.id, plans);
                  const p = g ? plans?.params.find((x) => x.id === g) : null;
                  const list = byKey.get(g)!;
                  const tot = list.reduce((a, x) => { const t = shapesOf(x.id, plans); return t.total !== null && a !== null ? a + t.total : null; }, 0 as number | null);
                  const shapeIds = new Set(shapesOf(s.id, plans).ids);
                  const sh = shapesOf(s.id, plans);
                  return (
                    <SectionCard key={s.id} s={s} index={sections.indexOf(s)}
                      group={p ? { name: p.name, color: p.color, kind: p.kind, note: list.length > 1 && tot !== null ? `${list.length} sections · ${fmtQty(tot, { area: "SF", linear: "LF", count: "EA" }[p.kind])}` : null } : null}
                      open={openSecs ? openSecs.has(s.id) : sections.length === 1} onToggle={() => toggleSec(s.id, sections.map((x) => x.id))}
                      money={budget?.areas?.[s.id] ?? null} err={saveErr[s.id]} rcards={rcards} jobType={job.job_type} jobId={jobId} onSlot={onSlot}
                      sheets={sheetsOf(s)} hasPlans={planSheets.length > 0} onSheets={(start) => openSheets(s, start)}
                      takeoffUnit={s.takeoff_sync !== false && sh.unit ? sh.unit : null}
                      sizeTakeoff={s.takeoff_sync !== false && sh.unit ? { unit: sh.unit as "SF" | "LF" | "EA", total: sh.total, depth_in: null } : null}
                      takeoff={!can(access, "plan_room") ? null : <SectionTakeoffStrip jobId={jobId} sectionId={s.id} sectionName={s.name ?? null} following={s.takeoff_sync !== false}
                        plans={plans} sectionNames={names} onChanged={takeoffChanged} />}
                      photos={!can(access, "files") ? null : <>
                        <SectionPhotos jobId={jobId} sectionId={s.id} sectionName={s.name ?? null} plans={plans}
                        photos={jobFiles.filter((f) => (f.section_id === s.id || (f.takeoff_measurement_id && shapeIds.has(f.takeoff_measurement_id))) && (f.kind === "image" || f.kind === "video") && !isDetailFile(f))}
                        sections={sections.map((x) => ({ id: x.id, name: x.name ?? null }))} onChange={fileChanged}
                        onProposal={picsOff === null ? null : !picsOff[s.id]} onProposalChange={(on) => setPics(s.id, on)}
                        clipHref={can(access, "plan_room") ? `/dashboard/scope/${jobId}/files` : null} />
                        {/* Section cuts clipped off the plans (Coy, 2026-10-09), read by AI on a tap. */}
                        {can(access, "plan_room") && <SectionDetails jobId={jobId} sectionName={s.name ?? null} shape={detailShape(s)}
                          details={jobFiles.filter((f) => f.section_id === s.id && isDetailFile(f))}
                          sheetName={(id) => { const x = planSheets.find((y) => y.id === id); return x ? `${x.number ?? `p.${x.page}`}${x.title ? ` · ${x.title}` : ""}` : null; }}
                          onChange={fileChanged} onOpenSheet={(id) => setViewer({ title: `Sheet for ${s.name || "this section"}`, groups: [{ label: s.name || "This section", ids: [id] }], start: id })}
                          onUse={(p) => { patchLocal(s.id, p); void save(s.id, p); }} />}
                      </>}
                      onLocal={(p) => patchLocal(s.id, p)} onSave={(p) => void save(s.id, p)}
                      onRemove={() => void removeSection(s.id)}
                      onGrip={sections.length > 1 ? (e) => startDrag(s.id, e) : undefined} />
                  );
          });
        })()}

        <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
          <span className="lg:hidden"><NotesToggle /></span>
          <button onClick={() => void addSection()} disabled={adding} className="w-full lg:w-auto lg:px-5 rounded"
            style={{ height: 40, border: `1px dashed ${T.ink3}`, background: T.card, fontFamily: disp, fontSize: F.md,
                     fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: T.ink, cursor: "pointer" }}>
            {adding ? "Adding…" : "+ Add a section"}
          </button>
        </div>

        {/* The budget: lines from cost cards, good / better / best (migration 048). */}
        {can(access, "budget") && <div className="px-3 pb-3">
          <JobBudget jobId={job.id} sections={sections} days={job.duration_days} onSummary={setBudget} refresh={budgetTick} slots={slots}
            crew={crew} onCrew={saveCrew} />
        </div>}

        {/* Photos, plans, specs, receipts — Dusty reads them (migration 045). */}
        {can(access, "files") && <div className="px-3 pb-3">
          <FilesPanel jobId={job.id} sections={sections.map((x) => ({ id: x.id, name: x.name ?? null }))} />
        </div>}

        {/* Delete job at the bottom of the Budget too (Coy, 2026-10-09: "How do I delete a job after hitting new scope?"); also on the Summary. */}
        {!access.limited && <div className="px-3 pb-3 flex justify-end">
          <ArchiveButton kind="job" id={jobId} action="delete" what={realTitle ? `the job “${realTitle}”` : "this job"} then="/dashboard/scope"
            style={{ height: 28, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.red}`, background: T.card, color: T.red, fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Delete job</ArchiveButton>
        </div>}
        </div>
      </div>

      {viewer && plans && (
        <SheetViewer jobId={jobId} title={viewer.title} sheets={planSheets} files={plans.files} params={plans.params} measurements={plans.measurements} groups={viewer.groups} start={viewer.start}
          find={viewer.find} onClose={() => setViewer(null)} />
      )}

      {/* ================= takeoff rail ================= (hidden while the sheets are open beside the page) */}
      {!viewer && (() => {
        const rail = <TakeoffRail t={t} job={job} onCrewDays={(v) => void saveCrewDays(v)} jobType={job.job_type}
          workType={sections[0]?.work_type ?? null} budget={budget} inPanel={!!railSlot} crewSize={crew?.size ?? null} tick={budgetTick} />;
        return railSlot ? createPortal(rail, railSlot) : rail;
      })()}
    </div>
  );
}

/** A reinforcement card from the Price book (mesh by the sheet, rebar by the stick, fiber per yard). */
interface RCard { id: string; name: string; unit: string; unit_cost: number | null; qty_rule: string; rule_params: Record<string, number> }

/** PostgREST returns numeric columns as strings or numbers; the engine wants numbers or null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function numify(s: Section): Section {
  return { ...s, length_ft: num(s.length_ft), width_ft: num(s.width_ft), sqft_override: num(s.sqft_override),
    depth_in: num(s.depth_in), psi: num(s.psi), count_qty: num(s.count_qty) };
}
/* ------------------------------------------------------------- a section */

function splitFt(v: number | null): [number | "", number | ""] {
  if (v === null) return ["", ""];
  const ft = Math.floor(v);
  const inch = Math.round((v - ft) * 12 * 100) / 100;
  return [ft, inch === 0 ? "" : inch];
}

/** How a section is measured, each in its own colour (Coy, 2026-10-10: "color coded"). */
const MODES: [ "dims" | "area" | "linear" | "count", string, string][] = [
  ["dims", "Length × width", T.chalk], ["area", "Area only", T.green], ["linear", "Linear ft", T.hiviz], ["count", "Count", T.violet],
];

function SectionCard({ group, s, index, err, onLocal, onSave, onRemove, jobType, jobId, photos, sheets, hasPlans, onSheets, takeoff, takeoffUnit, sizeTakeoff, onSlot, open, onToggle, onGrip, money: m }: {
  sizeTakeoff?: { unit: "SF" | "LF" | "EA" | null; total: number | null; depth_in: number | null } | null;
  /** Its takeoff group, shown on the header row (Coy, 2026-10-15: the heading above it was confusing). */
  group?: { name: string; color: string; kind: "area" | "linear" | "count"; note: string | null } | null;
  s: Section; index: number; err?: string; rcards: RCard[]; jobType: string | null; jobId: string;
  /** Open, or folded to one line (Coy, 2026-10-08: "less busy and easier to read"). */
  open: boolean; onToggle: () => void;
  /** Press on the grip to drag the section up or down (Coy, 2026-10-15). */
  onGrip?: (e: React.PointerEvent) => void;
  /** Its own budget lines' totals, for the folded line. */
  money: { lines: number; cost: number; price: number; blocked: number } | null;
  /** Where the budget draws this section's cost items. */
  onSlot: (id: string, el: HTMLElement | null) => void;
  /** The plan sheets its bid line names (Coy, 2026-10-02: "verify the scopes on the sheets"). */
  sheets: Array<{ id: string; number: string | null; title: string | null }>; hasPlans: boolean; onSheets: (start: string | null) => void;
  /** The area's photos, under its dimensions. */
  photos?: React.ReactNode;
  /** Its Plan Room takeoffs (migration 069), and their unit while the size follows them. */
  takeoff?: React.ReactNode; takeoffUnit?: string | null;
  onLocal: (p: Partial<Section>) => void; onSave: (p: Partial<Section>) => void; onRemove: () => void;
}) {
  const q = quantities(s);
  const concrete = q.concrete;
  const sid = s.id;
  // Size rows (migration 111): while a section has them, its size is their total and the single size cells hide.
  const [sizeRows, setSizeRows] = useState(0);
  const onSizeSection = useCallback((x: Record<string, unknown>) => {
    const n = (k: string) => (x[k] === null || x[k] === undefined ? null : Number(x[k]));
    onLocal({ sqft_override: n("sqft_override"), length_ft: n("length_ft"), width_ft: n("width_ft"), count_qty: n("count_qty"), count_unit: (x.count_unit as string | null) ?? null, depth_in: n("depth_in") });
  }, [onLocal]);
  const budgetSlot = useCallback((el: HTMLDivElement | null) => onSlot(sid, el), [onSlot, sid]);

  // Measured by length × width, or by its area alone (Coy, 2026-10-02: government
  // work gives a bid item's area — "Concrete Walk … 1,769.80 SY" — not its sides).
  // Area mode keeps only the area (and the depth); the area is typed in sq ft or
  // sq yd and stored as sq ft (sqft_override), so the engine is unchanged.
  const bidSY = /\bSY\b/.test(s.source_ref ?? "");
  // Or by count (migration 065): "it's not an area, it's a quantity" — 8 EA.
  const bidEA = /\b\d[\d,.]*\s*(EA|EACH|LS)\b/i.test(s.source_ref ?? "");
  // Or in linear feet (Coy, 2026-10-02): grade beams, saw cuts, joints — "430 LF". The length
  // is the count in LF; a beam's width (in) and depth give its yards.
  const bidLF = /\b\d[\d,.]*\s*(LF|LIN\.?\s*FT)\b/i.test(s.source_ref ?? "");
  const [modeState, setMode] = useState<"dims" | "area" | "count" | "linear">(() =>
    (s.count_unit ?? "").toUpperCase() === "LF" && s.length_ft === null && s.sqft_override === null ? "linear"
      : s.count_qty != null && s.sqft_override === null && s.length_ft === null && s.width_ft === null ? "count"
      : s.length_ft === null && s.width_ft === null && s.sqft_override === null && bidLF ? "linear"
      : s.length_ft === null && s.width_ft === null && s.sqft_override === null && bidEA ? "count"
      : s.length_ft === null && s.width_ft === null && (s.sqft_override !== null || bidSY || jobType === "public") ? "area" : "dims");
  // While it follows its takeoffs, the shapes decide how it is measured.
  const mode = takeoffUnit === "SF" ? "area" : takeoffUnit === "LF" ? "linear" : takeoffUnit === "EA" ? "count" : modeState;
  const unitKey = `sc:area-unit:${s.id}`;
  const [unit, setUnitState] = useState<"sf" | "sy">(() => {
    try { const v = localStorage.getItem(unitKey); if (v === "sf" || v === "sy") return v; } catch { /* no storage */ }
    return bidSY || jobType === "public" ? "sy" : "sf";
  });
  const setUnit = (u: "sf" | "sy") => { setUnitState(u); try { localStorage.setItem(unitKey, u); } catch { /* no storage */ } };
  const toMode = (m: "dims" | "area" | "count" | "linear") => {
    if (m === mode) return;
    const wasLinear = mode === "linear";
    setMode(m);
    if (m === "count" || m === "linear") {
      // A linear count keeps its LF; the beam width belongs to linear only.
      const p = { length_ft: null, width_ft: null, sqft_override: null,
        count_unit: m === "linear" ? "LF" : (s.count_unit ?? "").toUpperCase() === "LF" ? "EA" : s.count_unit ?? "EA",
        count_qty: (m === "linear") === wasLinear ? s.count_qty ?? null : null };
      onLocal(p); onSave(p);
      return;
    } else if (s.count_qty != null || wasLinear) {
      const p = { count_qty: null, ...(wasLinear ? { width_ft: null, count_unit: null } : {}) };
      onLocal(p); onSave(p);
    }
    if (m === "area") {
      // Keep what L × W gave as the area, then drop the sides.
      const p = { length_ft: null, width_ft: null, sqft_override: q.sqft_source === "dimensions" ? q.sqft : s.sqft_override };
      onLocal(p); onSave(p);
    } else if (s.sqft_override !== null) {
      onLocal({ sqft_override: null }); onSave({ sqft_override: null });
    }
  };
  // The bid's own quantity ("… – 1,769.80 SY"), offered as one tap — never filled in by itself.
  const bidQty = (() => {
    const m = /([\d,]+(?:\.\d+)?)\s*(SY|SF|EA|EACH|LS|LF|LIN\.?\s*FT)\b/i.exec(s.source_ref ?? "");
    if (!m) return null;
    const raw = m[2].toUpperCase();
    return { n: Number(m[1].replace(/,/g, "")), u: (raw === "EACH" ? "EA" : raw.startsWith("LIN") ? "LF" : raw) as "SY" | "SF" | "EA" | "LS" | "LF" };
  })();
  const useBidQty = () => {
    if (!bidQty || !(bidQty.n > 0)) return;
    if (bidQty.u === "LF") {
      const p = { length_ft: null, sqft_override: null, count_qty: bidQty.n, count_unit: "LF", ...(mode === "linear" ? {} : { width_ft: null }) };
      setMode("linear"); onLocal(p); onSave(p);
      return;
    }
    if (bidQty.u === "EA" || bidQty.u === "LS") {
      const p = { length_ft: null, width_ft: null, sqft_override: null, count_qty: bidQty.n, count_unit: bidQty.u };
      setMode("count"); onLocal(p); onSave(p);
      return;
    }
    const p = { length_ft: null, width_ft: null, sqft_override: bidQty.u === "SY" ? Math.round(bidQty.n * 9 * 100) / 100 : bidQty.n, count_qty: null };
    setMode("area"); setUnit(bidQty.u === "SY" ? "sy" : "sf"); onLocal(p); onSave(p);
  };
  const bidQtyUsed = bidQty && (bidQty.u === "EA" || bidQty.u === "LS" || bidQty.u === "LF" ? q.count !== null : q.sqft !== null);
  const areaShown = s.sqft_override === null ? "" : unit === "sy" ? Math.round((s.sqft_override / 9) * 100) / 100 : s.sqft_override;

  const dimCell = (label: string, key: "length_ft" | "width_ft") => {
    const [ft, inch] = splitFt(s[key]);
    const set = (f: number | "", i: number | "") => {
      const v = f === "" && i === "" ? null : (Number(f) || 0) + (Number(i) || 0) / 12;
      onLocal({ [key]: v } as Partial<Section>);
    };
    return (
      <Cell label={label} missing={s[key] === null}
        source={s[key] === null ? "not set" : "you set it"}>
        <div className="flex items-baseline gap-1">
          <NumIn value={ft} onChange={(v) => set(v, inch)} onBlur={() => onSave({ [key]: s[key] } as Partial<Section>)} w={58} />
          <span style={{ fontSize: F.xs, color: T.ink3 }}>ft</span>
          <NumIn value={inch} onChange={(v) => set(ft, v)} onBlur={() => onSave({ [key]: s[key] } as Partial<Section>)} w={40} />
          <span style={{ fontSize: F.xs, color: T.ink3 }}>in</span>
        </div>
      </Cell>
    );
  };
  // The folded line: size, thickness, its price and price per unit, and a dot when something is missing.
  const sizeText = q.count !== null ? `${n1(q.count)} ${q.count_unit}` : q.sqft !== null ? `${n1(q.sqft)} SF${s.depth_in ? ` · ${s.depth_in}"` : ""}` : "size not set";
  const perText = m && m.lines > 0 && m.blocked === 0
    ? q.count !== null && q.count > 0 ? `${money(m.price / q.count)}/${q.count_unit}` : q.sqft ? `${money(m.price / q.sqft)}/SF` : ""
    : "";
  const missingWhat = [...q.missing, ...(m && m.blocked ? [`${m.blocked} item${m.blocked === 1 ? "" : "s"} not priced`] : [])].join(", ");
  const missingAny = missingWhat.length > 0;
  const unitSeg = (on: boolean): React.CSSProperties => ({ height: 22, padding: "0 7px", fontSize: 10, fontFamily: disp, fontWeight: 600, letterSpacing: ".05em",
    textTransform: "uppercase", whiteSpace: "nowrap", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, cursor: "pointer" });
  const seg = (on: boolean, c: string, divide: boolean): React.CSSProperties => ({ flex: "1 1 0", minWidth: 0, height: 30, padding: "0 4px",
    fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    background: on ? c : T.card, color: on ? T.card : c, borderLeft: divide ? `1px solid ${T.hair}` : "none", cursor: "pointer" });

  return (
    <div data-sec-id={s.id} style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, marginTop: index === 0 ? 0 : 6 }}>
      <div className={`px-3 ${open ? "pt-2.5" : "py-2"} flex items-center gap-2 flex-wrap`}>
        {onGrip && (
          <span role="button" aria-label="Drag to reorder" title="Drag to reorder" onPointerDown={onGrip}
            style={{ cursor: "grab", touchAction: "none", color: T.ink3, flex: "none", display: "flex", padding: "2px 0" }}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
              {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.4" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.4" />])}
            </svg>
          </span>
        )}
        {open ? (
          <input defaultValue={s.name ?? ""} placeholder={`Section ${index + 1} — name it`}
            onChange={(e) => onLocal({ name: e.target.value })} onBlur={(e) => onSave({ name: e.target.value })}
            className="bg-transparent outline-none" style={{ fontSize: F.sm, fontWeight: 600, minWidth: 0, flex: "1 1 140px" }} />
        ) : (
          <button onClick={onToggle} className="text-left flex items-center gap-1.5" style={{ fontSize: F.sm, fontWeight: 600, minWidth: 0, flex: "1 1 120px", cursor: "pointer", ...clip }}>
            {missingAny && <span title={missingWhat} style={{ width: 7, height: 7, borderRadius: 4, background: T.hiviz, flex: "none" }} />}
            {/* Tied to a takeoff: its kind in the group's colour, then ƒ (Coy, 2026-10-15). */}
            {group && <span title={`Takeoff group: ${group.name}`} className="inline-flex items-center gap-1" style={{ flex: "none" }}>
              <KindIcon kind={group.kind} color={group.color} />
              <span style={{ color: T.green, fontStyle: "italic", fontWeight: 700 }}>ƒ</span>
            </span>}
            <span style={clip}>{s.name || `Section ${index + 1}`}</span>
          </button>
        )}
        {group && open && (
          <span title={`Takeoff group: ${group.name}${group.note ? ` · ${group.note}` : ""}`} className="inline-flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink3, flex: "0 1 auto", minWidth: 0, ...clip }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: group.color, flex: "none" }} />
            <span style={clip}>{group.name}{group.note ? ` · ${group.note}` : ""}</span>
          </span>
        )}
        {open ? (
          // No kind-of-area picker here (Coy, 2026-10-10: "remove the section type completely from here").
          <>
            <Dictate jobId={jobId} s={s} onApply={(p) => { onLocal(p as Partial<Section>); onSave(p as Partial<Section>); }} />
            {/* The totals stay on the header when open too (Coy, 2026-10-15). */}
            <span className="flex items-baseline gap-2 text-right" style={{ marginLeft: "auto", fontSize: F.xs, color: T.ink2, ...nums }}>
              <span>{sizeText}</span>
              {m && m.lines > 0
                ? <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: T.ink }}>{money0(m.price)}{perText ? <span style={{ fontFamily: "inherit", fontWeight: 400, fontSize: F.xs, color: T.ink3 }}> {perText}</span> : null}</span>
                : <span style={{ color: T.ink3 }}>no items</span>}
            </span>
          </>
        ) : (
          <button onClick={onToggle} className="flex items-baseline gap-2 text-right" style={{ marginLeft: "auto", cursor: "pointer", fontSize: F.xs, color: T.ink2, ...nums }}>
            <span>{sizeText}</span>
            {m && m.lines > 0
              ? <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: T.ink }}>{money0(m.price)}{perText ? <span style={{ fontFamily: "inherit", fontWeight: 400, fontSize: F.xs, color: T.ink3 }}> {perText}</span> : null}</span>
              : <span style={{ color: T.ink3 }}>no items</span>}
          </button>
        )}
        {/* The fold button at the row's right end (Coy, 2026-10-10). */}
        <button onClick={onToggle} aria-expanded={open} aria-label={open ? `Fold ${s.name || `section ${index + 1}`}` : `Open ${s.name || `section ${index + 1}`}`}
          className="flex items-center justify-center rounded" style={{ width: 26, height: 26, flex: "none", border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
          <span aria-hidden="true" style={{ fontSize: 11, color: T.ink2, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
        </button>
      </div>
      <div style={open ? undefined : { display: "none" }}>
      {/* Where the scope came from, to check on the sheet (Coy, 2026-10-09: "verify … where the sections are on
          the plan set sheets that the job scope was pulled from"). A sheet opens with the bid's line boxed on it. */}
      {s.source_ref && (
        <div className="mx-3 mt-1.5 rounded px-2.5 py-1.5" style={{ background: T.sunk, border: `1px solid ${T.hairSoft}`, fontSize: F.xs }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ ...eyebrow, color: T.ink }}>{sheets.length ? "From the plans" : "From the bid"}</span>
            {sheets.map((x) => (
              <button key={x.id} onClick={() => onSheets(x.id)} title={x.title ?? undefined} className="rounded px-2"
                style={{ height: 24, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontSize: F.xs, fontWeight: 600, cursor: "pointer" }}>
                {x.number}
              </button>
            ))}
            {sheets.length > 0 && <button onClick={() => onSheets(sheets[0].id)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>See where on the sheet ›</button>}
          </div>
          <div style={{ color: T.ink2, lineHeight: 1.4, marginTop: 3 }}>
            {quotedLine(s.source_ref) ? <>“{quotedLine(s.source_ref)}”</> : s.source_ref.replace(/^"|"$/g, "")}
            {!sheets.length && hasPlans ? <span style={{ color: T.ink3 }}> · none of the sheets it names was read off the plans</span> : null}
          </div>
        </div>
      )}
      {/* How the section is measured: the full width, a colour each, no "Measured by" over it, and
          Takeoffs' button on the row under it (Coy, 2026-10-10). */}
      <div className="px-3 pt-2 flex items-center gap-x-2 gap-y-1.5 flex-wrap">
        {/* On a desktop a drop-down at the left, with Takeoffs' button beside it (Coy, 2026-10-15). */}
        <select aria-label="Measured by" className="hidden lg:block rounded px-2"
          value={takeoffUnit && s.takeoff_sync !== false ? "takeoffs" : mode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "takeoffs") window.dispatchEvent(new CustomEvent("sc:pull-takeoffs", { detail: s.id }));
            else toMode(v as "dims" | "area" | "linear" | "count");
          }}
          style={{ height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm }}>
          {MODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          {takeoff && <option value="takeoffs">Pull from Takeoffs</option>}
        </select>
        <span className="flex w-full lg:hidden rounded overflow-hidden" role="group" aria-label="Measured by" style={{ border: `1px solid ${T.hair}` }}>
          {MODES.map(([k, label, c], i) => (
            <button key={k} onClick={() => toMode(k)} aria-pressed={mode === k} style={seg(mode === k, c, i > 0)}>{label}</button>
          ))}
        </span>
        {bidQty && !bidQtyUsed && (
          <button onClick={useBidQty} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
            Use the bid&apos;s {bidQty.n.toLocaleString("en-US")} {bidQty.u}
          </button>
        )}
        {/* Any section can carry a pour (Coy, 2026-10-15: "Some groups don't have a width and depth and
            concrete volume"): a removal or prep section has none until this is ticked. */}
        {mode !== "count" && (
          <button type="button" aria-pressed={concrete}
            title={concrete ? "Take the pour off: no thickness or concrete on this section" : "Add thickness, width and concrete yards to this section"}
            onClick={() => { const w = concrete ? (mode === "linear" ? "other" : "demo") : (mode === "linear" ? "curb" : "slab"); onLocal({ work_type: w }); onSave({ work_type: w }); }}
            className="rounded px-2" style={{ height: 28, fontSize: F.sm, cursor: "pointer",
              border: `1px solid ${concrete ? T.green : T.hairStrong}`, background: concrete ? T.sunk : T.card, color: concrete ? T.green : T.ink2 }}>
            {concrete ? "✓ Concrete" : "+ Concrete"}
          </button>
        )}
        {takeoff}
      </div>

      <SectionSizes jobId={jobId} sectionId={s.id} mode={mode} concrete={concrete} takeoff={sizeTakeoff ?? null}
        onSection={onSizeSection} onRows={setSizeRows} />
      {sizeRows === 0 && <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 mt-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
        {mode === "dims" && dimCell("Length", "length_ft")}
        {mode === "dims" && dimCell("Width", "width_ft")}
        {mode === "count" && (
          <Cell label="How many" missing={q.count === null}
            source={q.count === null ? "type how many" : "items priced per each on this area take this number"}>
            <div className="flex items-baseline gap-1 flex-wrap">
              <NumIn value={s.count_qty ?? ""} w={80}
                onChange={(v) => onLocal({ count_qty: v === "" ? null : Number(v) })}
                onBlur={() => onSave({ count_qty: s.count_qty ?? null, count_unit: s.count_unit ?? "EA" })} />
              <input defaultValue={s.count_unit ?? "EA"} aria-label="Unit counted" maxLength={12}
                onBlur={(e) => { const u = e.target.value.trim().toUpperCase() || "EA"; onLocal({ count_unit: u }); onSave({ count_unit: u }); }}
                className="bg-transparent outline-none rounded px-1"
                style={{ width: 52, height: 28, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, textTransform: "uppercase" }} />
            </div>
          </Cell>
        )}
        {mode === "linear" && (
          <Cell label="Length" missing={q.count === null}
            source={q.count === null ? "type the linear feet" : "items priced per LF on this area take this length"}>
            <div className="flex items-baseline gap-1">
              <NumIn value={s.count_qty ?? ""} w={70}
                onChange={(v) => onLocal({ count_qty: v === "" ? null : Number(v) })}
                onBlur={() => onSave({ count_qty: s.count_qty ?? null, count_unit: "LF" })} />
              <span style={{ fontSize: F.xs, color: T.ink3 }}>LF</span>
            </div>
          </Cell>
        )}
        {mode === "linear" && concrete && (
          <Cell label="Width" missing={s.width_ft === null}
            source={s.width_ft === null ? "a beam or curb's width — for yards" : `${n1(q.sqft ?? 0)} sq ft in plan`}>
            <div className="flex items-baseline gap-1">
              <NumIn value={s.width_ft === null ? "" : Math.round(s.width_ft * 12 * 100) / 100} w={52}
                onChange={(v) => onLocal({ width_ft: v === "" ? null : Number(v) / 12 })}
                onBlur={() => onSave({ width_ft: s.width_ft })} />
              <span style={{ fontSize: F.xs, color: T.ink3 }}>in</span>
            </div>
          </Cell>
        )}
        {mode !== "count" && mode !== "linear" && <Cell label="Area" missing={q.sqft === null}
          source={mode === "area"
            ? (q.sqft === null ? "type the area" : unit === "sy" ? `= ${n1(q.sqft)} sq ft` : `= ${n2(q.sqft / 9)} sq yd`)
            : q.sqft_source === "dimensions" ? `length × width · ${n2(q.sqft! / 9)} sq yd` : "needs length and width"}>
          <div className="flex items-baseline gap-1 flex-wrap">
            {mode === "area" ? (
              <>
                <NumIn value={areaShown} w={100}
                  onChange={(v) => onLocal({ sqft_override: v === "" ? null : unit === "sy" ? Number(v) * 9 : Number(v) })}
                  onBlur={() => onSave({ sqft_override: s.sqft_override })} />
                <span className="inline-flex rounded overflow-hidden" role="group" aria-label="Area unit" style={{ border: `1px solid ${T.hair}` }}>
                  <button onClick={() => setUnit("sf")} aria-pressed={unit === "sf"} style={unitSeg(unit === "sf")}>sq ft</button>
                  <button onClick={() => setUnit("sy")} aria-pressed={unit === "sy"} style={unitSeg(unit === "sy")}>sq yd</button>
                </span>
              </>
            ) : (
              <>
                <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>{q.sqft === null ? "—" : n1(q.sqft)}</span>
                <span style={{ fontSize: F.xs, color: T.ink3 }}>sq ft</span>
              </>
            )}
          </div>
        </Cell>}
        {concrete && mode !== "count" && (
          <Cell label={mode === "linear" ? "Depth" : "Thickness"} missing={s.depth_in === null} source={s.depth_in === null ? "not set — never assumed" : "you set it"}>
            <div className="flex items-baseline gap-1">
              <NumIn value={s.depth_in ?? ""} w={52}
                onChange={(v) => onLocal({ depth_in: v === "" ? null : Number(v) })}
                onBlur={() => onSave({ depth_in: s.depth_in })} />
              <span style={{ fontSize: F.xs, color: T.ink3 }}>in</span>
            </div>
          </Cell>
        )}
        {concrete && mode !== "count" && (
          <Cell label="Concrete" missing={q.cy_neat === null}
            source={q.cy_neat === null ? (mode === "linear" ? "needs width and depth" : "needs area and thickness") : "neat · waste is on the concrete card"}>
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>
              {q.cy_neat === null ? "—" : `${n2(q.cy_neat)}`}
            </span>
            <span style={{ fontSize: F.xs, color: T.ink3 }}> cu yd</span>
          </Cell>
        )}
      </div>}

      {/* The section's own cost items (Coy, 2026-10-04: "the sections … have the budget line items in
          the sections themselves"). JobBudget draws them here; the panel below the sections is the job's totals. */}
      {/* The scope of work, a bullet a line (Coy, 2026-10-10) — the same list as under this area on the draft
          proposal; edited in either place. Kept in prep_notes (src/lib/scope-of-work.ts). */}
      <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
        <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
          <span style={{ ...eyebrow }}>Scope of work</span>
          {/* Dusty writes it (Coy, 2026-10-10: "the AI emblem so that Dusty can write the scope of work");
              "Use this" under his answer puts its bullets here. */}
          <button type="button" title="Ask Dusty to write it" aria-label="Ask Dusty to write the scope of work"
            onClick={() => {
              setDustyUse({ label: `as ${s.name ?? "this section"}'s scope of work`, apply: (text) => {
                const v = sowFromAnswer(text); if (!v) return false; onLocal({ prep_notes: v }); onSave({ prep_notes: v }); return true;
              } });
              window.dispatchEvent(new Event("sc:dusty-open"));
              setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: {
                text: `${sowQuestion(s.name ?? "section", s.prep_notes)}\n\n${USE_ASK}`,
                send: true } })), 250);
            }}
            className="inline-flex items-center justify-center" style={{ width: 22, height: 22, cursor: "pointer", background: "transparent" }}>
            <DustyEmblem size={20} still hidden />
          </button>
        </div>
        <ScopeBullets value={s.prep_notes} color={T.ink} muted={T.ink3} border={T.hair} fontSize={13}
          onSave={(v) => { onLocal({ prep_notes: v }); onSave({ prep_notes: v }); }} />
      </div>
      <div ref={budgetSlot} />
      {photos}
      {/* Beside the photos (Coy, 2026-10-05: "This button to pull from the aerial photos or other plan sheets
          should be in the same area as 'photos'"). */}
      {!sheets.length && hasPlans && (
        <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
          <span style={{ ...eyebrow }}>Plan sheets</span>
          <button onClick={() => onSheets(null)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Browse the set ›</button>
        </div>
      )}

      {/* Notes, typed or said (Coy, 2026-10-03: "Prep can be removed … Access … can be replaced by 'notes'.
          The notes can be typed or dictated verbally"). Kept in access_notes — no migration; neither column held anything. */}
      <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
        <SectionNotes value={s.access_notes} onLocal={(v) => onLocal({ access_notes: v })} onSave={(v) => onSave({ access_notes: v })} />
      </div>
      <div className="px-3 pb-2 flex items-center gap-2">
        {err && <span style={{ fontSize: F.xs, color: T.red }}>Not saved: {err}</span>}
        <span className="flex-1" />
        <button onClick={() => { if (window.confirm(`Remove ${s.name || "this section"}? Its cost items come off the budget.`)) onRemove(); }}
          aria-label="Remove section" style={{ ...eyebrow, color: T.red, cursor: "pointer", opacity: 0.8 }}>Remove section</button>
      </div>
      </div>
      {!open && err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>Not saved: {err}</div>}
    </div>
  );
}

/**
 * Dictate this section (Coy, 2026-09-28): tap, say "front drive, twenty four
 * by thirty, four inch, 6x6 mesh", tap again. Groq writes the words, Dusty
 * puts them in the boxes, and only numbers that were said are kept
 * (src/lib/dictate.ts). What changed shows as "Heard: …" with Undo.
 */
function Dictate({ jobId, s, onApply }: { jobId: string; s: Section; onApply: (p: Record<string, unknown>) => void }) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [heard, setHeard] = useState<{ text: string; prev: Record<string, unknown>; changed: string[]; note?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rec = React.useRef<MediaRecorder | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); rec.current?.stop(); }, []);

  const start = async () => {
    setErr(null); setHeard(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) { setErr("This browser can't record audio."); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErr("Microphone blocked — allow it for this site."); return; }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
      void send(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
    };
    rec.current = r;
    r.start();
    setState("rec");
    timer.current = setTimeout(() => r.state === "recording" && r.stop(), 60_000);
  };

  const send = async (blob: Blob) => {
    setState("busy");
    try {
      const fd = new FormData();
      fd.append("audio", blob, blob.type.includes("mp4") ? "section.mp4" : "section.webm");
      const r = await fetch(`/api/jobs/${jobId}/sections/${s.id}/dictate`, { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      const patch = (b.patch ?? {}) as Record<string, unknown>;
      const keys = Object.keys(patch);
      const prev = Object.fromEntries(keys.map((k) => [k, (s as unknown as Record<string, unknown>)[k] ?? null]));
      if (keys.length) onApply(patch);
      setHeard({ text: String(b.transcript ?? ""), prev, changed: keys, note: b.note ?? (keys.length ? undefined : "Nothing in that matched a box.") });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  };

  const LABEL: Record<string, string> = { length_ft: "length", width_ft: "width", depth_in: "thickness", psi: "PSI", work_type: "type",
    name: "name", reinforcement_item_id: "reinforcement", access_notes: "notes" };
  return (
    <>
      <button onClick={() => (state === "rec" ? rec.current?.stop() : state === "idle" ? void start() : undefined)}
        disabled={state === "busy"} aria-label={state === "rec" ? "Stop and fill the section" : "Dictate this section"}
        title={state === "rec" ? "Stop" : state === "busy" ? "Listening…" : "Dictate"}
        className={state === "rec" ? "sc-rec inline-flex items-center justify-center rounded" : "inline-flex items-center justify-center rounded"}
        style={{ width: 28, height: 28, flex: "none", border: `1px solid ${state === "rec" ? T.red : T.hair}`, background: state === "rec" ? T.red : T.card,
                 color: state === "rec" ? T.card : T.ink2, opacity: state === "busy" ? 0.55 : 1, cursor: "pointer" }}>
        {/* The icon alone (Coy, 2026-10-10: "just a simple icon, no words"). */}
        <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
          <rect x="5.4" y="1.6" width="4.2" height="7.6" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 7.4a4.5 4.5 0 0 0 9 0 M7.5 11.9v1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {(heard || err) && (
        <div className="w-full rounded px-2.5 py-1.5" style={{ background: err ? "#FBECE9" : "#EAF0FC", fontSize: F.xs, lineHeight: 1.4 }}>
          {err ? <span style={{ color: T.red }}>{err}</span> : heard && (
            <>
              <span style={{ color: T.ink2 }}>Heard: </span><span style={{ fontStyle: "italic" }}>“{heard.text}”</span>
              {heard.changed.length > 0 && <span style={{ color: T.ink2 }}> · filled {heard.changed.map((k) => LABEL[k] ?? k).join(", ")}</span>}
              {heard.note && <span style={{ color: T.ink3 }}> · {heard.note}</span>}
              {heard.changed.length > 0 && (
                <button onClick={() => { onApply(heard.prev); setHeard(null); }} style={{ marginLeft: 8, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Undo</button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Cell({ label, missing, source, children }: { label: string; missing: boolean; source: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2" style={{ borderRight: `1px solid ${T.hairSoft}`, borderBottom: `1px solid ${T.hairSoft}`, minWidth: 0,
                                         background: missing ? T.hivizDim : "transparent" }}>
      <div style={eyebrow}>{label}</div>
      <div style={{ minHeight: 28 }}>{children}</div>
      <div style={{ fontSize: 9.5, color: missing ? T.hiviz : T.ink3, ...clip }}>{source}</div>
    </div>
  );
}

function NumIn({ value, onChange, onBlur, w }: { value: number | ""; onChange: (v: number | "") => void; onBlur: () => void; w: number }) {
  return (
    <input type="number" inputMode="decimal" value={value} onBlur={onBlur}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className="bg-transparent outline-none rounded px-1"
      style={{ width: w, border: `1px solid ${T.hair}`, background: T.card, height: 28,
               fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }} />
  );
}

/** A section's notes: typed, or said — the mic records, Groq writes it down, and the words are added on. */
function SectionNotes({ value, onLocal, onSave }: { value: string | null; onLocal: (v: string | null) => void; onSave: (v: string | null) => void }) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A Save button while the box holds unsaved words (Coy, 2026-10-15: "Need a button to actually save the note").
  const [saved, setSaved] = useState<string | null>(value?.trim() || null);
  const [flash, setFlash] = useState(false);
  const save = (v: string | null) => { setSaved(v); onSave(v); setFlash(true); setTimeout(() => setFlash(false), 1500); };
  const dirty = (value?.trim() || null) !== saved;
  const said = async (blob: Blob) => {
    setRec(false); setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, blob.type.includes("mp4") ? "note.mp4" : "note.webm");
      const r = await fetch("/api/dusty/transcribe", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.text) throw new Error(b.error || `HTTP ${r.status}`);
      const next = [value?.trim(), String(b.text).trim()].filter(Boolean).join("\n").slice(0, 2000);
      onLocal(next); save(next);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div style={{ minWidth: 0 }}>
      <div className="flex items-center gap-2">
        <span style={eyebrow}>Notes</span>
        <span className="flex-1" />
        {flash && !dirty && <span style={{ fontSize: F.xs, color: T.green }}>✓ Saved</span>}
        {dirty && !rec && (
          <button onClick={() => save(value?.trim() || null)} onMouseDown={(e) => e.preventDefault()}
            className="rounded px-2.5" style={{ height: 26, fontSize: F.sm, fontWeight: 600, background: T.chalk, color: "#fff", cursor: "pointer" }}>
            Save
          </button>
        )}
        {!rec && (
          // The mic alone (Coy, 2026-10-05: "the microphone is enough"); recording shows the red dot and meter,
          // writing it down spins.
          <button onClick={() => setRec(true)} disabled={busy} aria-label={busy ? "Writing the note down" : "Say a note"} title={busy ? "Writing it down…" : "Say a note — it is written down here"}
            className="inline-flex items-center justify-center rounded" style={{ width: 30, height: 26, border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
            {busy
              ? <span className="animate-spin" aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${T.hair}`, borderTopColor: T.chalk }} />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
          </button>
        )}
      </div>
      {rec ? (
        <div className="mt-1"><VoiceRecorder onSend={(b) => void said(b)} onCancel={() => setRec(false)} /></div>
      ) : (
        <textarea value={value ?? ""} placeholder="Anything about this area — access, the pump, demo, what they want…" rows={2}
          onChange={(e) => onLocal(e.target.value || null)} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== saved) save(v); }}
          className="w-full rounded px-2 py-1.5 outline-none mt-1" style={{ border: `1px solid ${T.hair}`, fontSize: F.sm, resize: "vertical", background: T.card, color: T.ink }} />
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red }}>Didn&apos;t get that: {err}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- takeoff rail */

/** The job's size in its own unit: LF when every sized section is measured in linear feet (Coy, 2026-10-12: "showing Sq here even though the section is Lf"). */
function railSize(t: ReturnType<typeof takeoffOf>): { n: number; unit: "SF" | "LF"; extra: string } {
  const lf = t.sections.reduce((a, q) => a + (q.count !== null && (q.count_unit ?? "").toUpperCase() === "LF" ? q.count : 0), 0);
  const area = t.sections.some((q) => q.sqft !== null && !(q.count !== null && (q.count_unit ?? "").toUpperCase() === "LF"));
  if (lf > 0 && !area) return { n: lf, unit: "LF", extra: "" };
  return { n: t.sqft, unit: "SF", extra: lf > 0 ? ` + ${n1(lf)} lin ft` : "" };
}

function TakeoffRail({ t, job, onCrewDays, budget, inPanel, crewSize = null, tick = 0 }: {
  t: ReturnType<typeof takeoffOf>; crewSize?: number | null; tick?: number;
  job: Job; onCrewDays: (v: number | null) => void; jobType: string | null; workType: string | null;
  budget: BudgetSummary | null;
  /** Shown at the top of Dusty's docked panel: folded to the totals, scrolls on its own. */
  inPanel?: boolean;
}) {
  const [folded, setFolded] = useState(false);
  const [crew, setCrew] = useState<number | "">(job.duration_days ?? "");
  const dim = "#8E99A5";
  const line = { borderTop: `1px solid ${T.darkHair}` };

  const size = railSize(t);
  return (
    <aside style={{ background: T.dark, color: "#fff", ...(inPanel ? { maxHeight: folded ? undefined : "45vh", overflowY: "auto" as const } : {}) }}
      className={inPanel ? "" : "lg:sticky lg:top-[var(--sc-head)] lg:self-start lg:max-h-[calc(100dvh-var(--sc-head))] lg:overflow-y-auto"}>
      {inPanel ? (
        <button onClick={() => setFolded((f) => !f)} aria-expanded={!folded} className="w-full flex items-baseline gap-2 px-4 py-2 text-left" style={{ color: "#fff", cursor: "pointer" }}>
          <span style={{ ...eyebrow, color: dim }}>This job</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>
            {size.n > 0 ? `${n1(size.n)} ${size.unit === "LF" ? "lf" : "sf"}` : "—"}
            {budget?.has_lines ? ` · ${budget.tiers.map((b) => (b.priced ? money0(b.total) : "not priced")).join(" · ")}` : ""}
          </span>
          <span className="flex-1" />
          <span style={{ color: dim }}>{folded ? "▾" : "▴"}</span>
        </button>
      ) : null /* no title line (Coy, 2026-10-02: "remove … read this on the phone") */}
      {!(inPanel && folded) && (<>

      <div className="px-4 py-3" style={inPanel ? line : undefined}>
        <div style={{ ...eyebrow, color: dim }}>Total area</div>
        <div style={{ fontFamily: disp, fontSize: 28, fontWeight: 700, lineHeight: 1.05, ...nums }}>{size.n > 0 ? n1(size.n) : "—"}</div>
        <div style={{ fontSize: 13, color: "#C3CBD4", marginTop: 4, lineHeight: 1.4, ...nums }}>{size.unit === "LF" ? "lin ft" : "sq ft"}{size.extra} · {t.sections.length} section{t.sections.length === 1 ? "" : "s"}{t.incomplete ? " · incomplete" : ""}</div>
      </div>

      {/* No "Concrete to order" box (Coy, 2026-10-12: on a removal job it read the yards to tear out as concrete to buy). */}
      {budget?.has_lines ? (
        <>
          <BudgetRail budget={budget} sqft={t.sqft} crew={crew} crewSize={crewSize} />
        </>
      ) : (
        <>
          {/* No "No price yet" box or Assemblies button (Coy, 2026-10-02): assemblies load inside the budget's areas. */}
          <div className="px-4 py-3" style={line}>
            <label className="flex items-center gap-2" style={{ fontSize: F.xs, color: "#C3CBD4" }}>
              Days on this job
              <input type="number" inputMode="decimal" value={crew}
                onChange={(e) => setCrew(e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => onCrewDays(crew === "" ? null : Number(crew))}
                className="rounded px-1.5 outline-none" style={{ width: 60, height: 28, background: "#20262C", color: "#fff",
                  border: `1px solid ${T.darkHair}`, fontFamily: disp, fontSize: F.md, ...nums }} />
              <span style={{ color: dim }}>estimated</span>
            </label>
          </div>
        </>
      )}
      <RailMarket jobId={job.id} refresh={tick} />
      </>)}
    </aside>
  );
}

/**
 * The rail once the budget has lines: one total per tier (shared lines + the
 * tier's own), its cost, O.H., profit and margin, what blocks it, and the job
 * minimum (day minimum × days — Coy, 2026-09-30). The discount, O.H. and
 * margin live in the budget's own footer — one number, never two.
 */
function BudgetRail({ budget, sqft, crew, crewSize }: {
  budget: BudgetSummary; sqft: number; crew: number | ""; crewSize: number | null;
}) {
  const dim = "#8E99A5";
  const line = { borderTop: `1px solid ${T.darkHair}` };
  const min = budget.minimum;
  return (
    <>
      {budget.tiers.map((b) => {
        const under = min.ok && b.priced && b.total < min.minimum;
        return (
          <div key={b.option_id ?? "all"} className="px-4 py-3" style={b.priced ? line : { borderTop: `2px solid ${T.hiviz}`, background: "#2A1712" }}>
            <div style={{ ...eyebrow, color: b.priced ? dim : T.hiviz }}>{b.label ? `${b.label}` : "Price"} · budget</div>
            {b.priced ? (
              <>
                <div style={{ fontFamily: disp, fontSize: 28, fontWeight: 700, lineHeight: 1.05, ...nums }}>{money0(b.total)}</div>
                {/* Cost red, O.H. yellow, profit green, as the budget footer (Coy, 2026-10-15). */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1" style={{ fontFamily: disp, fontSize: 14, fontWeight: 700, ...nums }}>
                  <span style={{ color: "#F08A7A" }}>cost {money0(b.cost)}</span>
                  <span style={{ color: "#E8C452" }}>O.H. {money0(b.overhead)}</span>
                  <span style={{ color: "#7FD39C" }}>profit {money0(b.profit)} · {(b.margin * 100).toFixed(1)}%</span>
                  {b.tax > 0 ? <span style={{ color: "#C3CBD4" }}>tax {money0(b.tax)}</span> : !budget.tax_on ? <span style={{ color: dim }}>no tax</span> : null}
                  {sqft > 0 && <span style={{ color: "#C3CBD4" }}>{money(b.total / sqft)}/sf</span>}
                </div>
                {under && <div style={{ fontSize: F.xs, color: "#F3A89A", ...nums }}>under the job minimum of {money0(min.minimum)}</div>}
                {min.ok && min.days > 0 && <div style={{ fontSize: F.xs, color: "#9FD8B4", marginTop: 2, ...nums }}>net {money0(b.profit / min.days)} a day · gross {money0((b.total - b.tax - b.cost) / min.days)} a day</div>}
              </>
            ) : (
              <ul className="mt-1" style={{ fontSize: F.sm, color: "#fff", lineHeight: 1.5, paddingLeft: 16, listStyle: "square" }}>
                {b.blocked.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
          </div>
        );
      })}
      <div className="px-4 py-3" style={line}>
        {/* Crew days, crew size and the labor budget (Coy, 2026-10-15). */}
        {(() => {
          const days = crew !== "" ? crew : budget.days_auto;
          return (
            <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: "auto 1fr", fontSize: 13, color: "#C3CBD4", ...nums }}>
              <span style={{ color: dim }}>Crew days</span><span>{days !== null ? `${days}${crew === "" ? " · from the labor lines" : ""}` : "no labor lines in days or hours"}</span>
              <span style={{ color: dim }}>Crew size</span><span>{crewSize ? `${crewSize} people` : "not set"}</span>
              <span style={{ color: dim }}>Labor budget</span><span>{money0(budget.labor)}</span>
            </div>
          );
        })()}
        {min.ok && <div style={{ fontSize: 12, color: dim, marginTop: 6, lineHeight: 1.45, ...nums }}>Job minimum {money0(min.minimum)}: {min.days} days × {money0(min.day_minimum)} a day</div>}
      </div>
    </>
  );
}

/** How a section is measured, for what a plan detail's read can fill and count (src/lib/plan-details.ts). */
function detailShape(s: Section): SectionShape {
  const linear = (s.count_unit ?? "").toUpperCase() === "LF";
  const lf = linear && s.count_qty ? s.count_qty : null;
  const sqft = linear ? null : s.sqft_override ?? (s.length_ft && s.width_ft ? s.length_ft * s.width_ft : null);
  return { mode: linear ? "linear" : s.count_qty != null && sqft === null ? "count" : "area", lf, sqft };
}

/** A takeoff's kind as a small mark in its group's colour: a square for an area, a line, a dot for a count. */
function KindIcon({ kind, color }: { kind: "area" | "linear" | "count"; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-label={kind} style={{ flex: "none" }}>
      {kind === "area" ? <rect x="2" y="2" width="10" height="10" rx="1.5" fill={color} fillOpacity=".35" stroke={color} strokeWidth="1.6" />
        : kind === "linear" ? <path d="M2 11 12 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        : <circle cx="7" cy="7" r="4" fill={color} />}
    </svg>
  );
}
