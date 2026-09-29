"use client";

/**
 * The Scope builder — one job, its sections, the takeoff and (when the
 * settings exist) the price and the floor.
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
import Link from "next/link";
import { useParams } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, money, money0, formatPhone } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { JobChips } from "@/components/v34/job-chips";
import { FilesPanel } from "@/components/v34/files-panel";
import {
  price as priceJob, floor as floorOf, takeoff as takeoffOf, quantities, reinforcementQty,
  type CostSettings, type OverheadItem, type ReinforcementType, type SectionInput,
} from "@/lib/engine";

interface Section extends SectionInput {
  id: string;
  rebar: string | null;
  reinforcement_source?: "set" | "default" | null;
  prep_notes: string | null;
  access_notes: string | null;
  sort_order: number;
}
interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null;
  job_type: string | null; lead_source: string | null; description?: string | null; origin?: string | null;
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

const WORK_TYPES: [string, string][] = [
  ["slab", "Slab"], ["driveway", "Driveway"], ["patio", "Patio"], ["sidewalk", "Sidewalk"],
  ["footing", "Footing"], ["curb", "Curb"], ["demo", "Demo"], ["prep", "Prep"], ["other", "Other"],
];

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
  const [job, setJob] = useState<Job | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [whyHidden, setWhyHidden] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [overhead, setOverhead] = useState<OverheadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [rtypes, setRtypes] = useState<ReinforcementType[]>([]);

  const load = useCallback(async () => {
    try {
      const [j, s, c, r] = await Promise.all([
        send(`/api/jobs/${jobId}`, "GET"),
        send(`/api/jobs/${jobId}/sections`, "GET"),
        send("/api/settings/cost", "GET"),
        // Reinforcement types (migration 042). A failure leaves none to pick, not a broken page.
        send("/api/settings/reinforcement", "GET").catch(() => ({ types: [] })),
      ]);
      setRtypes(((r.types ?? []) as Array<Record<string, unknown>>).map((x) => ({
        ...(x as unknown as ReinforcementType),
        unit_cost: num(x.unit_cost), sheet_sqft: num(x.sheet_sqft), spacing_in: num(x.spacing_in),
        stick_ft: num(x.stick_ft), lap_pct: num(x.lap_pct), per_cy: num(x.per_cy),
      })));
      setJob(j.job); setContact(j.contact ?? null); setWhy(j.why ?? null);
      setSections((s.sections as Section[]).map(numify));
      setSettings(c.settings ? numifySettings(c.settings) : null);
      setOverhead((c.overhead ?? []).map((o: OverheadItem) => ({ ...o, amount: Number(o.amount) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const t = useMemo(() => takeoffOf(sections ?? [], settings?.concrete_overage_pct ?? null), [sections, settings]);
  const priced = useMemo(() => priceJob(sections ?? [], settings ?? EMPTY, { discount, reinforcement: rtypes }), [sections, settings, discount, rtypes]);
  const fl = useMemo(() => (priced.priced ? floorOf(priced.cost.total, settings ?? EMPTY, overhead, job?.duration_days ?? null) : null),
    [priced, settings, overhead, job]);

  const patchLocal = (id: string, patch: Partial<Section>) =>
    setSections((a) => (a ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function save(id: string, patch: Partial<Section>) {
    try {
      const b = await send(`/api/jobs/${jobId}/sections/${id}`, "PATCH", patch);
      patchLocal(id, numify(b.section));
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
    } catch (e) {
      setSaveErr((m) => ({ ...m, [id]: e instanceof Error ? e.message : String(e) }));
    }
  }

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

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:min-h-[calc(100dvh-var(--sc-head))]" style={{ color: T.ink }}>
      {/* ================= sections ================= */}
      <div style={{ minWidth: 0 }} className="pb-24 lg:pb-6">
        <div className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <Link href="/dashboard/scope" className="no-underline" style={{ ...eyebrow, color: T.ink2 }}>‹ Jobs</Link>
          <div className="flex items-start gap-2 mt-1">
            <div style={{ minWidth: 0, flex: 1 }}>
              <input defaultValue={realTitle} placeholder={titleHint} aria-label="Job name"
                onBlur={(e) => { const v = e.target.value; if (v !== realTitle) void send(`/api/jobs/${jobId}`, "PATCH", { title: v }).then((b) => setJob((j) => j && { ...j, title: b.job.title })).catch((er) => setSaveErr((m) => ({ ...m, job: String(er.message ?? er) }))); }}
                className="w-full bg-transparent outline-none"
                style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1, color: T.ink }} />
              <div style={{ fontSize: F.xs, color: who ? T.ink3 : T.hiviz, ...clip }}>
                {who ? (
                  <Link href={`/dashboard/messages/${contact!.id}`} style={{ color: T.ink2 }}>{who}</Link>
                ) : "Not attached to a customer yet"}
                {job.address ? ` · ${job.address}` : ""}
                {` · ${sections.length} section${sections.length === 1 ? "" : "s"}`}
                {job.origin === "classification" ? " · made when filed as a customer" : job.created_from_message_id ? " · drafted from a message" : " · entered by hand"}
              </div>
            </div>
          </div>
          {job.description && <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{job.description}</div>}
          {saveErr.job && <div style={{ fontSize: F.xs, color: T.red }}>{saveErr.job}</div>}
          <JobChips job={job} onSet={(field, value) => send(`/api/jobs/${jobId}`, "PATCH", { [field]: value })
            .then((b) => setJob((j) => j && { ...j, status: b.job.status, job_type: b.job.job_type, lead_source: b.job.lead_source }))} />
        </div>

        {why && !whyHidden && <WhyThisJob why={why} contact={contact} description={job.description ?? null} onHide={() => setWhyHidden(true)} />}

        {/* Phone: the takeoff rail sits below the sections, so the three
            numbers you read out loud ride along under the header. */}
        <div className="lg:hidden sticky z-10 px-3 py-1.5 flex items-baseline gap-3"
          style={{ top: "var(--sc-head)", background: T.dark, color: "#fff", ...nums }}>
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700 }}>{t.sqft > 0 ? n1(t.sqft) : "—"}<span style={{ fontSize: F.xs, color: "#8E99A5" }}> sf</span></span>
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: T.hiviz }}>
            {(t.cy_order ?? t.cy_neat) > 0 ? n2(t.cy_order ?? t.cy_neat) : "—"}<span style={{ fontSize: F.xs, color: "#8E99A5" }}> cu yd{t.cy_order === null ? " neat" : ""}</span>
          </span>
          <span className="flex-1" />
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: priced.priced ? "#fff" : "#8E99A5" }}>
            {priced.priced ? money0(priced.price.total) : "no price"}
          </span>
        </div>

        {sections.length === 0 && (
          <EmptyState title="No sections yet"
            detail="A driveway, a patio and a tear-out at one address are one job with three sections. Add the first one and give it the dimensions you were told." />
        )}

        {sections.map((s, i) => (
          <SectionCard key={s.id} s={s} index={i} err={saveErr[s.id]} rtypes={rtypes} jobType={job.job_type} jobId={jobId}
            onLocal={(p) => patchLocal(s.id, p)} onSave={(p) => void save(s.id, p)}
            onRemove={() => void removeSection(s.id)} overage={settings?.concrete_overage_pct ?? null} />
        ))}

        <div className="px-3 py-3">
          <button onClick={() => void addSection()} disabled={adding} className="w-full rounded"
            style={{ height: 40, border: `1px dashed ${T.ink3}`, background: T.card, fontFamily: disp, fontSize: F.md,
                     fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: T.ink, cursor: "pointer" }}>
            {adding ? "Adding…" : "+ Add a section"}
          </button>
        </div>

        {/* Photos, plans, specs, receipts — Dusty reads them (migration 045). */}
        <div className="px-3 pb-3">
          <FilesPanel jobId={job.id} sections={sections.map((x) => ({ id: x.id, name: x.name ?? null }))} />
        </div>
      </div>

      {/* ================= takeoff rail ================= */}
      <TakeoffRail t={t} priced={priced} fl={fl} job={job} discount={discount} setDiscount={setDiscount}
        onCrewDays={(v) => void saveCrewDays(v)} hasSettings={!!settings} />
    </div>
  );
}

const EMPTY: CostSettings = {
  concrete_price_per_cy: null, concrete_overage_pct: null, shortload_threshold_cy: null, shortload_pct: null,
  form_finish_per_sqft: null, demo_per_sqft: null, mobilization_fee: null, sales_tax_pct: null, tax_applies_to: null,
  markup_material_pct: null, markup_labor_pct: null, markup_equipment_pct: null,
  owner_fee_pct: null, estimator_fee_pct: null, tax_reserve_pct: null, assumed_billable_days: null,
  comp_mode: null, comp_monthly_draw: null,
};

/** PostgREST returns numeric columns as strings or numbers; the engine wants numbers or null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function numify(s: Section): Section {
  return { ...s, length_ft: num(s.length_ft), width_ft: num(s.width_ft), sqft_override: num(s.sqft_override),
    depth_in: num(s.depth_in), psi: num(s.psi) };
}
function numifySettings(raw: Record<string, unknown>): CostSettings {
  const out = { ...EMPTY } as Record<string, unknown>;
  for (const k of Object.keys(EMPTY)) {
    out[k] = k === "tax_applies_to" || k === "comp_mode" ? (raw[k] ?? null) : num(raw[k]);
  }
  return out as unknown as CostSettings;
}

/* ------------------------------------------------------------- a section */

function splitFt(v: number | null): [number | "", number | ""] {
  if (v === null) return ["", ""];
  const ft = Math.floor(v);
  const inch = Math.round((v - ft) * 12 * 100) / 100;
  return [ft, inch === 0 ? "" : inch];
}

function SectionCard({ s, index, err, onLocal, onSave, onRemove, overage, rtypes, jobType, jobId }: {
  s: Section; index: number; err?: string; overage: number | null; rtypes: ReinforcementType[]; jobType: string | null; jobId: string;
  onLocal: (p: Partial<Section>) => void; onSave: (p: Partial<Section>) => void; onRemove: () => void;
}) {
  const q = quantities(s);
  const concrete = q.concrete;

  const dimCell = (label: string, key: "length_ft" | "width_ft") => {
    const [ft, inch] = splitFt(s[key]);
    const set = (f: number | "", i: number | "") => {
      const v = f === "" && i === "" ? null : (Number(f) || 0) + (Number(i) || 0) / 12;
      onLocal({ [key]: v } as Partial<Section>);
    };
    return (
      <Cell label={label} missing={s[key] === null && s.sqft_override === null}
        source={s[key] === null ? (s.sqft_override !== null ? "using area" : "not set") : "you set it"}>
        <div className="flex items-baseline gap-1">
          <NumIn value={ft} onChange={(v) => set(v, inch)} onBlur={() => onSave({ [key]: s[key] } as Partial<Section>)} w={58} />
          <span style={{ fontSize: F.xs, color: T.ink3 }}>ft</span>
          <NumIn value={inch} onChange={(v) => set(ft, v)} onBlur={() => onSave({ [key]: s[key] } as Partial<Section>)} w={40} />
          <span style={{ fontSize: F.xs, color: T.ink3 }}>in</span>
        </div>
      </Cell>
    );
  };

  return (
    <div style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, marginTop: index === 0 ? 0 : 8 }}>
      <div className="px-3 pt-2.5 flex items-center gap-2 flex-wrap">
        <span style={{ ...eyebrow }}>Section {index + 1}</span>
        <input defaultValue={s.name ?? ""} placeholder="Name it"
          onChange={(e) => onLocal({ name: e.target.value })} onBlur={(e) => onSave({ name: e.target.value })}
          className="bg-transparent outline-none" style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, minWidth: 0, flex: "1 1 140px" }} />
        <select value={s.work_type} onChange={(e) => { onLocal({ work_type: e.target.value }); onSave({ work_type: e.target.value }); }}
          className="rounded px-1.5 outline-none" style={{ height: 28, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.xs }}>
          {WORK_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Dictate jobId={jobId} s={s} onApply={(p) => { onLocal(p as Partial<Section>); onSave(p as Partial<Section>); }} />
        <button onClick={onRemove} aria-label="Remove section" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Remove</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 mt-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
        {dimCell("Length", "length_ft")}
        {dimCell("Width", "width_ft")}
        <Cell label="Area" missing={q.sqft === null}
          source={q.sqft_source === "override" ? "you set the area" : q.sqft_source === "dimensions" ? "length × width" : "needs L × W or an area"}>
          <div className="flex items-baseline gap-1">
            {q.sqft_source === "override" || (s.length_ft === null && s.width_ft === null) ? (
              <NumIn value={s.sqft_override ?? ""} w={70}
                onChange={(v) => onLocal({ sqft_override: v === "" ? null : Number(v) })}
                onBlur={() => onSave({ sqft_override: s.sqft_override })} />
            ) : (
              <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>{q.sqft === null ? "—" : n1(q.sqft)}</span>
            )}
            <span style={{ fontSize: F.xs, color: T.ink3 }}>sq ft</span>
          </div>
        </Cell>
        {concrete && (
          <Cell label="Thickness" missing={s.depth_in === null} source={s.depth_in === null ? "not set — never assumed" : "you set it"}>
            <div className="flex items-baseline gap-1">
              <NumIn value={s.depth_in ?? ""} w={52}
                onChange={(v) => onLocal({ depth_in: v === "" ? null : Number(v) })}
                onBlur={() => onSave({ depth_in: s.depth_in })} />
              <span style={{ fontSize: F.xs, color: T.ink3 }}>in</span>
            </div>
          </Cell>
        )}
        {concrete && (
          <Cell label="Concrete" missing={q.cy_neat === null}
            source={q.cy_neat === null ? "needs area and thickness" : overage === null ? "neat · no waste set" : `neat · +${overage}% waste to order`}>
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>
              {q.cy_neat === null ? "—" : `${n2(q.cy_neat)}`}
            </span>
            <span style={{ fontSize: F.xs, color: T.ink3 }}> cu yd</span>
          </Cell>
        )}
      </div>

      {concrete && (
        <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
          <ReinforcementPick s={s} q={q} rtypes={rtypes} jobType={jobType}
            onPick={(id) => { onLocal({ reinforcement_type_id: id, reinforcement_source: id ? "set" : null }); onSave({ reinforcement_type_id: id }); }} />
          <NoteIn label="Prep" value={s.prep_notes} onLocal={(v) => onLocal({ prep_notes: v })} onSave={(v) => onSave({ prep_notes: v })} placeholder="not noted" />
          <NoteIn label="Access" value={s.access_notes} onLocal={(v) => onLocal({ access_notes: v })} onSave={(v) => onSave({ access_notes: v })} placeholder="not noted" />
        </div>
      )}
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>Not saved: {err}</div>}
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
    name: "name", reinforcement_type_id: "reinforcement", prep_notes: "prep", access_notes: "access" };
  return (
    <>
      <button onClick={() => (state === "rec" ? rec.current?.stop() : state === "idle" ? void start() : undefined)}
        disabled={state === "busy"} aria-label={state === "rec" ? "Stop and fill the section" : "Dictate this section"}
        className={state === "rec" ? "sc-rec inline-flex items-center gap-1 rounded px-2" : "inline-flex items-center gap-1 rounded px-2"}
        style={{ height: 28, border: `1px solid ${state === "rec" ? T.red : T.hair}`, background: state === "rec" ? T.red : "#fff",
                 color: state === "rec" ? "#fff" : T.ink2, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>
        <svg width="12" height="12" viewBox="0 0 15 15" aria-hidden="true">
          <rect x="5.4" y="1.6" width="4.2" height="7.6" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 7.4a4.5 4.5 0 0 0 9 0 M7.5 11.9v1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {state === "rec" ? "Stop" : state === "busy" ? "Listening…" : "Dictate"}
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

/**
 * Reinforcement from Coy's list (migration 042), priced by its own unit. A
 * default is labelled as one; the quantity shows in the unit he buys.
 */
function ReinforcementPick({ s, q, rtypes, jobType, onPick }: {
  s: Section; q: ReturnType<typeof quantities>; rtypes: ReinforcementType[]; jobType: string | null;
  onPick: (id: string | null) => void;
}) {
  const t = rtypes.find((r) => r.id === s.reinforcement_type_id) ?? null;
  const qty = t ? reinforcementQty(q, t) : null;
  const plural = (w: string) => (w.endsWith("s") ? w : `${w}s`);
  const source = !t ? (s.reinforcement_type_id ? "removed from settings" : "none chosen — not in the price")
    : s.reinforcement_source === "default" ? `default for ${jobType ? `${JOB_WORD[jobType] ?? jobType} ` : ""}${plural(s.work_type)}` : "you set it";
  return (
    <label className="block" style={{ minWidth: 0 }}>
      <span style={eyebrow}>Reinforcement</span>
      <select value={s.reinforcement_type_id ?? ""} onChange={(e) => onPick(e.target.value || null)}
        className="w-full rounded px-2 outline-none mt-0.5"
        style={{ height: 32, border: `1px solid ${t ? T.hair : T.hiviz}`, background: "#fff", fontSize: F.sm }}>
        <option value="">{rtypes.length ? "None" : "None — add types in cost settings"}</option>
        {rtypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <span style={{ display: "block", fontSize: 9.5, color: T.ink3 }}>
        {source}{qty && qty.ok ? ` · ${qty.qty.toLocaleString("en-US")} ${qty.unit}${qty.qty !== 1 && ["sheet", "stick", "bag"].includes(qty.unit) ? "s" : ""}` : ""}
        {qty && !qty.ok ? ` · needs ${qty.missing.join(", ")}` : ""}
      </span>
      {s.rebar && <span style={{ display: "block", fontSize: 9.5, color: T.ink2 }}>Note: {s.rebar}</span>}
    </label>
  );
}

const JOB_WORD: Record<string, string> = { residential: "residential", commercial: "commercial", public: "government" };

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
      style={{ width: w, border: `1px solid ${T.hair}`, background: "#fff", height: 28,
               fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }} />
  );
}

function NoteIn({ label, value, onLocal, onSave, placeholder }: {
  label: string; value: string | null; placeholder: string;
  onLocal: (v: string | null) => void; onSave: (v: string | null) => void;
}) {
  return (
    <label className="block" style={{ minWidth: 0 }}>
      <span style={eyebrow}>{label}</span>
      <input value={value ?? ""} placeholder={placeholder}
        onChange={(e) => onLocal(e.target.value || null)} onBlur={(e) => onSave(e.target.value || null)}
        className="w-full rounded px-2 outline-none mt-0.5" style={{ height: 32, border: `1px solid ${T.hair}`, fontSize: F.sm }} />
    </label>
  );
}

/* ----------------------------------------------------------- takeoff rail */

function TakeoffRail({ t, priced, fl, job, discount, setDiscount, onCrewDays, hasSettings }: {
  t: ReturnType<typeof takeoffOf>;
  priced: ReturnType<typeof priceJob>;
  fl: ReturnType<typeof floorOf> | null;
  job: Job; discount: number; setDiscount: (n: number) => void;
  onCrewDays: (v: number | null) => void; hasSettings: boolean;
}) {
  const [showFloor, setShowFloor] = useState(false);
  const [crew, setCrew] = useState<number | "">(job.duration_days ?? "");
  const dim = "#8E99A5";
  const line = { borderTop: `1px solid ${T.darkHair}` };

  const orderCy = t.cy_order ?? t.cy_neat;
  return (
    <aside style={{ background: T.dark, color: "#fff" }} className="lg:sticky lg:top-[var(--sc-head)] lg:self-start lg:max-h-[calc(100dvh-var(--sc-head))] lg:overflow-y-auto">
      <div className="px-4 pt-3 pb-3">
        <div style={{ ...eyebrow, color: dim }}>Takeoff</div>
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600 }}>Read this on the phone</div>
      </div>

      <div className="px-4 py-3" style={line}>
        <div style={{ ...eyebrow, color: dim }}>Total area</div>
        <div style={{ fontFamily: disp, fontSize: 40, fontWeight: 700, lineHeight: 1, ...nums }}>{t.sqft > 0 ? n1(t.sqft) : "—"}</div>
        <div style={{ ...eyebrow, color: dim }}>sq ft · {t.sections.length} section{t.sections.length === 1 ? "" : "s"}{t.incomplete ? " · incomplete" : ""}</div>
      </div>

      <div className="px-4 py-3" style={line}>
        <div style={{ ...eyebrow, color: dim }}>Concrete to order</div>
        <div style={{ fontFamily: disp, fontSize: 40, fontWeight: 700, lineHeight: 1, ...nums, color: T.hiviz }}>
          {orderCy > 0 ? n2(orderCy) : "—"}
        </div>
        <div style={{ ...eyebrow, color: dim }}>
          cubic yards · {t.overage_pct === null ? "neat — no waste % recorded" : `${t.overage_pct}% waste`}
        </div>
        {t.sections.map((q, i) => (
          <div key={q.id ?? i} className="flex justify-between py-1.5" style={{ ...line, fontSize: F.sm, marginTop: i === 0 ? 8 : 0 }}>
            <span style={{ color: "#C3CBD4", ...clip }}>{q.name || `Section ${i + 1}`}{q.sqft !== null ? ` · ${n1(q.sqft)} sf` : ""}</span>
            <span style={{ ...nums, fontWeight: 600 }}>
              {!q.concrete ? (q.work_type === "demo" ? "demo" : "no pour") : q.cy_neat === null ? `needs ${q.missing.join(", ")}` : `${n2(q.cy_neat)} cu yd`}
            </span>
          </div>
        ))}
      </div>

      {!priced.priced ? (
        <div className="px-4 py-3" style={{ borderTop: `2px solid ${T.hiviz}`, background: "#2A1712" }}>
          <div style={{ ...eyebrow, color: T.hiviz }}>No price on this scope</div>
          <div style={{ fontSize: F.sm, color: "#DCC9C2", lineHeight: 1.45, marginTop: 4 }}>
            {hasSettings ? "The quantities above are arithmetic on the numbers you gave. A price also needs:" :
              "The quantities above are arithmetic on the numbers you gave. No cost settings are recorded, so this scope carries yards, not dollars. It needs:"}
          </div>
          <ul className="mt-1.5" style={{ fontSize: F.sm, color: "#fff", lineHeight: 1.5, paddingLeft: 16, listStyle: "square" }}>
            {priced.blocked.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <Link href="/dashboard/cash" className="inline-flex items-center rounded px-3 mt-2.5 no-underline"
            style={{ height: 36, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.md, fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: ".06em" }}>Record cost settings</Link>
        </div>
      ) : (
        <>
          <div className="px-4 py-3" style={line}>
            <div style={{ ...eyebrow, color: dim }}>Price</div>
            <div style={{ fontFamily: disp, fontSize: 40, fontWeight: 700, lineHeight: 1, ...nums }}>{money0(priced.price.total)}</div>
            <div style={{ ...eyebrow, color: dim, ...nums }}>
              cost {money0(priced.cost.total)} · margin {(priced.margin * 100).toFixed(1)}%
              {t.sqft > 0 ? ` · ${money(priced.price.total / t.sqft)}/sf` : ""}
            </div>
          </div>

          <div className="px-4 py-2" style={line}>
            {(["materials", "labor", "equipment"] as const).map((k) => (
              <div key={k} className="py-1">
                <div className="flex justify-between" style={{ fontSize: F.sm, ...nums }}>
                  <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{k}</span>
                  <span>{money0(priced.cost[k])} → {money0(priced.price[k])}</span>
                </div>
                {priced.lines.filter((l) => l.type === k).map((l) => (
                  <div key={l.label} className="flex justify-between" style={{ fontSize: F.xs, color: "#9AA5B1", ...nums }}>
                    <span style={{ ...clip, paddingRight: 8 }}>{l.label}</span>
                    <span>{l.unit === "load" || l.unit === "job" ? money0(l.cost) : `${n2(l.qty)} ${l.unit} × ${money(l.rate)}`}</span>
                  </div>
                ))}
              </div>
            ))}
            {priced.price.tax > 0 && (
              <div className="flex justify-between py-1" style={{ fontSize: F.sm, ...nums }}>
                <span style={{ fontWeight: 600 }}>Sales tax</span><span>{money0(priced.price.tax)}</span>
              </div>
            )}
          </div>

          {/* The discount slider with the floor as a live red line (DECISIONS §4). */}
          <div className="px-4 py-3" style={line}>
            <div className="flex justify-between items-baseline">
              <span style={{ ...eyebrow, color: dim }}>Discount</span>
              <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums }}>{money0(discount)}</span>
            </div>
            <div className="relative" style={{ marginTop: 4 }}>
              <input type="range" min={0} max={Math.max(0, Math.round(priced.price.subtotal))} step={25} value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))} className="w-full" aria-label="Discount" />
              {fl && fl.ok && fl.floor < priced.price.subtotal && (
                <span aria-hidden="true" className="absolute" style={{ top: -2, bottom: -2, width: 2, background: T.red,
                  left: `${((priced.price.subtotal - fl.floor) / priced.price.subtotal) * 100}%` }} />
              )}
            </div>
            <div style={{ fontSize: 9.5, color: dim }}>Touches the price only — cost stays what it is.</div>
          </div>

          <div className="px-4 py-3" style={line}>
            <button onClick={() => setShowFloor((v) => !v)} className="w-full text-left" style={{ color: "#fff", cursor: "pointer" }}>
              <div className="flex justify-between items-baseline">
                <span style={{ ...eyebrow, color: dim }}>Bid floor {showFloor ? "▴" : "▾"}</span>
                <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums,
                               color: fl && fl.ok ? (priced.price.total < fl.floor ? T.red : "#fff") : dim }}>
                  {fl && fl.ok ? money0(fl.floor) : "—"}
                </span>
              </div>
              {fl && fl.ok && priced.price.total < fl.floor && (
                <div style={{ fontSize: F.xs, color: "#F3A89A" }}>This price is under the floor.</div>
              )}
            </button>

            <label className="flex items-center gap-2 mt-2" style={{ fontSize: F.xs, color: "#C3CBD4" }}>
              Crew days on this job
              <input type="number" inputMode="decimal" value={crew}
                onChange={(e) => setCrew(e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => onCrewDays(crew === "" ? null : Number(crew))}
                className="rounded px-1.5 outline-none" style={{ width: 60, height: 28, background: "#20262C", color: "#fff",
                  border: `1px solid ${T.darkHair}`, fontFamily: disp, fontSize: F.md, ...nums }} />
              <span style={{ color: dim }}>estimated</span>
            </label>

            {fl && !fl.ok && (
              <div style={{ fontSize: F.xs, color: "#C3CBD4", marginTop: 6, lineHeight: 1.45 }}>
                The floor needs: {fl.blocked.join(", ")}.
              </div>
            )}
            {showFloor && fl && fl.ok && (
              <div className="mt-2" style={{ fontSize: F.xs, color: "#C3CBD4", lineHeight: 1.6, ...nums }}>
                <div>Hard cost {money0(fl.hard_cost)}</div>
                <div>+ nut share {money0(fl.nut_share)}: {money0(fl.nut_monthly)}/mo{fl.draw_included ? ` (incl. ${money0(fl.draw_included)} draw)` : ""} is {money(fl.nut_per_crew_day)} a crew-day, × {fl.crew_days} crew days ({fl.crew_days_basis})</div>
                <div>÷ {(1 - fl.off_top_pct / 100).toFixed(2)} ({fl.off_top_pct}% off the top)</div>
              </div>
            )}
          </div>

          <div className="px-4 py-3" style={{ ...line, fontSize: F.xs, color: dim, lineHeight: 1.45 }}>
            Not in this price: {priced.excluded.join("; ")}.
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * Why this job exists — for one made when a contact was filed as a customer
 * (migration 038). Coy, 2026-09-29: "I have no reference for why this job was
 * created… No idea what the job is or why it was classified as a customer."
 */
function WhyThisJob({ why, contact, description, onHide }: { why: Why; contact: Contact | null; description: string | null; onHide: () => void }) {
  const when = why.filed_at ? new Date(why.filed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : null;
  const whom = contact ? (contact.name || formatPhone(contact.phone)) : "this contact";
  return (
    <section className="mx-3 mt-2.5 rounded px-3 py-2.5" aria-label="Why this job"
      style={{ background: T.chalkDim, border: `1px solid ${T.hair}` }}>
      <div className="flex items-baseline gap-2">
        <span style={{ ...eyebrow, color: T.chalk }}>Why this job</span>
        <span className="flex-1" />
        <button onClick={onHide} aria-label="Hide" style={{ color: T.ink3, fontSize: F.md, lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}>×</button>
      </div>
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
