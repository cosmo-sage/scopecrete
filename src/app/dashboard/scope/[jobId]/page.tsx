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
import { JOB_TYPE_LABEL, LEAD_SOURCES, stageOf } from "@/lib/jobs/stages";
import { T, F, disp, eyebrow, nums, clip, money, money0, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, Badge } from "@/components/v34/primitives";
import {
  price as priceJob, floor as floorOf, takeoff as takeoffOf, quantities,
  type CostSettings, type OverheadItem, type SectionInput,
} from "@/lib/engine";

interface Section extends SectionInput {
  id: string;
  rebar: string | null;
  prep_notes: string | null;
  access_notes: string | null;
  sort_order: number;
}
interface Job {
  id: string; title: string | null; status: string | null; address: string | null;
  contact_id: string | null; duration_days: number | null; created_from_message_id: string | null;
  job_type: string | null; lead_source: string | null;
}
interface Contact { id: string; name: string | null; phone: string | null }

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
  const [sections, setSections] = useState<Section[] | null>(null);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [overhead, setOverhead] = useState<OverheadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [discount, setDiscount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [j, s, c] = await Promise.all([
        send(`/api/jobs/${jobId}`, "GET"),
        send(`/api/jobs/${jobId}/sections`, "GET"),
        send("/api/settings/cost", "GET"),
      ]);
      setJob(j.job); setContact(j.contact ?? null);
      setSections((s.sections as Section[]).map(numify));
      setSettings(c.settings ? numifySettings(c.settings) : null);
      setOverhead((c.overhead ?? []).map((o: OverheadItem) => ({ ...o, amount: Number(o.amount) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const t = useMemo(() => takeoffOf(sections ?? [], settings?.concrete_overage_pct ?? null), [sections, settings]);
  const priced = useMemo(() => priceJob(sections ?? [], settings ?? EMPTY, { discount }), [sections, settings, discount]);
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

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:min-h-[calc(100dvh-var(--sc-head))]" style={{ color: T.ink }}>
      {/* ================= sections ================= */}
      <div style={{ minWidth: 0 }} className="pb-24 lg:pb-6">
        <div className="px-3 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <Link href="/dashboard/scope" className="no-underline" style={{ ...eyebrow, color: T.ink2 }}>‹ Jobs</Link>
          <div className="flex items-start gap-2 mt-1">
            <div style={{ minWidth: 0, flex: 1 }}>
              <input defaultValue={job.title ?? ""} placeholder="Name this scope"
                onBlur={(e) => { const v = e.target.value; if (v !== (job.title ?? "")) void send(`/api/jobs/${jobId}`, "PATCH", { title: v }).then((b) => setJob((j) => j && { ...j, title: b.job.title })).catch((er) => setSaveErr((m) => ({ ...m, job: String(er.message ?? er) }))); }}
                className="w-full bg-transparent outline-none"
                style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1, color: T.ink }} />
              <div style={{ fontSize: F.xs, color: who ? T.ink3 : T.hiviz, ...clip }}>
                {who ? (
                  <Link href={`/dashboard/messages/${contact!.id}`} style={{ color: T.ink2 }}>{who}</Link>
                ) : "Not attached to a customer yet"}
                {job.address ? ` · ${job.address}` : ""}
                {` · ${sections.length} section${sections.length === 1 ? "" : "s"}`}
                {job.created_from_message_id ? " · drafted from a message" : " · entered by hand"}
              </div>
            </div>
            {job.status && <Badge s={job.status} />}
          </div>
          {saveErr.job && <div style={{ fontSize: F.xs, color: T.red }}>{saveErr.job}</div>}
          <JobMeta job={job} onSet={(field, value) => void send(`/api/jobs/${jobId}`, "PATCH", { [field]: value })
            .then((b) => setJob((j) => j && { ...j, job_type: b.job.job_type, lead_source: b.job.lead_source }))
            .catch((er) => setSaveErr((m) => ({ ...m, job: String(er.message ?? er) })))} />
        </div>

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
          <SectionCard key={s.id} s={s} index={i} err={saveErr[s.id]}
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

function SectionCard({ s, index, err, onLocal, onSave, onRemove, overage }: {
  s: Section; index: number; err?: string; overage: number | null;
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
          <NoteIn label="Reinforcement" value={s.rebar} onLocal={(v) => onLocal({ rebar: v })} onSave={(v) => onSave({ rebar: v })} placeholder="not set" />
          <NoteIn label="Prep" value={s.prep_notes} onLocal={(v) => onLocal({ prep_notes: v })} onSave={(v) => onSave({ prep_notes: v })} placeholder="not noted" />
          <NoteIn label="Access" value={s.access_notes} onLocal={(v) => onLocal({ access_notes: v })} onSave={(v) => onSave({ access_notes: v })} placeholder="not noted" />
        </div>
      )}
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>Not saved: {err}</div>}
    </div>
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
 * Residential / commercial / government, and how the job reached us — the two
 * facts the Jobs board shows on every card. One tap each.
 * (Who referred it is picked when the job is created on the board.)
 */
function JobMeta({ job, onSet }: { job: Job; onSet: (field: "job_type" | "lead_source", value: string) => void }) {
  const chip = (on: boolean): React.CSSProperties => ({
    height: 26, padding: "0 9px", borderRadius: 3, fontSize: F.xs, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: disp, textTransform: "uppercase", letterSpacing: ".04em",
    border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 8 }}>
      <span style={{ ...eyebrow, color: T.ink3 }}>{stageOf(job.status).label}</span>
      <span style={{ width: 1, height: 16, background: T.hair }} />
      {Object.entries(JOB_TYPE_LABEL).map(([k, l]) => (
        // Picks one of the three. An automatic job may start with none
        // (migration 038) and shows no chip on until one is chosen.
        <button key={k} style={chip(job.job_type === k)} onClick={() => { if (job.job_type !== k) onSet("job_type", k); }}>{l}</button>
      ))}
      <span style={{ width: 1, height: 16, background: T.hair }} />
      <select value={job.lead_source ?? ""} onChange={(e) => onSet("lead_source", e.target.value)}
        className="rounded px-1.5 outline-none"
        style={{ height: 26, fontSize: F.xs, border: `1px solid ${job.lead_source ? T.ink : T.hair}`, background: T.card, color: T.ink }}>
        <option value="">Source: not set</option>
        {LEAD_SOURCES.map((l) => <option key={l.k} value={l.k}>{l.label}</option>)}
      </select>
    </div>
  );
}
