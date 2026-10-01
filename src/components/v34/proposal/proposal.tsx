"use client";
/**
 * Job › Proposal (migration 060; Claude Design, design/proposal). Coy,
 * 2026-10-01: "Go ahead with the proposals."
 *
 * The job's budget made presentable for the customer: the job panel on the
 * left (project type, cost → price with the margin, the sub split, which
 * warranty and contract load), the document in the middle. The budget is the
 * only pricer — priceDraft() runs the engine's budget() and rounds the
 * customer's price up to the next $50 (the proposal only). Every change is
 * saved to the draft; Mark final freezes what the customer was shown.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, strong, nums } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { setDustyUse } from "@/lib/v34/dusty-live";
import {
  drawsCheck, parseClauses, plainText, priceDraft, termsText, warrantyText,
  type Clause, type DocTemplate, type Draw, type DraftInput, type ProposalDisplay, type ProposalPrice,
} from "@/lib/proposal";
import type { BudgetSettings, TakeoffTotal } from "@/lib/engine";
import { ProposalDocument, SECTIONS, usd, usd0, type DocArea, type DocVM } from "./document";

interface ProjectType {
  id: string; key: string; label: string; overhead_pct: number | null; margin_pct: number | null;
  show_item_prices: boolean; show_qty: boolean; show_tax_line: boolean; draws: Draw[];
  warranty_template_id: string | null; terms_template_id: string | null; cover: "photo" | "none"; sort_order: number;
}
interface Prop {
  id: string; job_id: string; version: number; status: "draft" | "final"; option_id: string | null; project_type: string | null;
  display: ProposalDisplay; draws: Draw[]; warranty: { template_id?: string | null; title?: string; body?: string };
  terms: { template_id?: string | null; clauses?: Clause[] }; scope_intro: string | null; cover_file_id: string | null;
  split: "none" | "20_80" | "30_70"; snapshot: Snapshot | null; finalized_at: string | null; created_at: string;
}
interface Snapshot {
  number: string; made_at: string; job: { title: string | null; address: string | null; job_type: string | null };
  customer: Rec | null; contact: Rec | null; org: { name: string } | null;
  display: ProposalDisplay; draws: Draw[]; scope_intro: string | null; cover_file_id: string | null;
  warranty_text: { title: string; body: string; template: { name: string } | null; starter: boolean; edited: boolean };
  terms_text: { title: string; clauses: Clause[]; template: { name: string } | null; starter: boolean; edited: boolean };
  sections: Rec[]; price: ProposalPrice;
}
type Rec = Record<string, unknown>;
interface Bundle {
  job: Rec & { id: string; title: string | null; job_number: string | null; address: string | null; description: string | null; job_type: string | null; duration_days: unknown };
  estimate: { id: string; tax_on: boolean; discount_amount: number; margin_pct: number | null; overhead_pct: number | null } | null;
  proposal: Prop; finals: Array<{ id: string; version: number; finalized_at: string; snapshot: Snapshot }>;
  options: Array<{ id: string; label: string }>;
  lines: DraftInput["lines"]; sections: Array<Rec & { id: string }>;
  settings: BudgetSettings; takeoff: Record<string, TakeoffTotal>;
  org: { id: string; name: string; logo_light: boolean; logo_dark: boolean; logo_stamp: string | null } | null;
  types: ProjectType[]; templates: DocTemplate[];
  customer: Rec | null; contact: Rec | null;
  photos: Array<{ id: string; name: string | null; url: string | null }>;
}

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
/** Pending saves, one timer per field — so typing in the warranty doesn't send every letter. One proposal page is open at a time. */
const timers = new Map<string, { t: ReturnType<typeof setTimeout>; run: () => void }>();
/** Send every pending save now (leaving the page, or before Mark final). */
function flushSaves() { const all = [...timers.values()]; timers.clear(); for (const x of all) { clearTimeout(x.t); x.run(); } }
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function areasOf(rows: Rec[]): DocArea[] {
  return rows.map((s) => {
    const L = n(s.length_ft), W = n(s.width_ft), o = n(s.sqft_override);
    return { id: String(s.id), name: str(s.name), work_type: str(s.work_type), length_ft: L, width_ft: W,
      sqft: o ?? (L && W ? L * W : null), depth_in: n(s.depth_in), psi: n(s.psi), rebar: str(s.rebar) };
  });
}

export function Proposal({ jobId }: { jobId: string }) {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<Prop | null>(null);
  const [margin, setMargin] = useState<number | null>(null);
  // ?v=N (from Documents) opens that final version.
  const [viewFinal, setViewFinal] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = Number(new URLSearchParams(window.location.search).get("v"));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const [panel, setPanel] = useState(false);
  const [coverPick, setCoverPick] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [wideRef, wide] = useWide<HTMLDivElement>(1000);

  const load = useCallback(async () => {
    try {
      const d = (await call(`/api/jobs/${jobId}/proposal`, "GET")) as Bundle;
      setB(d); setP(d.proposal); setMargin(d.settings.margin_pct); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [jobId]);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/proposal`, "GET")
      .then((d: Bundle) => { if (!off) { setB(d); setP(d.proposal); setMargin(d.settings.margin_pct); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [jobId]);

  // Saves: each field on its own short timer, so typing in the warranty doesn't send every letter.
  const save = useCallback((field: string, value: unknown, wait = 450) => {
    clearTimeout(timers.get(field)?.t);
    const run = () => {
      timers.delete(field);
      call(`/api/jobs/${jobId}/proposal`, "PATCH", { [field]: value }).then(() => setErr(null))
        .catch((e) => setErr(`Not saved: ${e instanceof Error ? e.message : e}`));
    };
    timers.set(field, { t: setTimeout(run, wait), run });
  }, [jobId]);
  useEffect(() => () => flushSaves(), []);
  const change = useCallback(<K extends keyof Prop>(k: K, v: Prop[K], wait?: number) => {
    setP((x) => (x ? { ...x, [k]: v } : x));
    save(k as string, v, wait);
  }, [save]);

  const isFinal = p?.status === "final";
  const finalShown = viewFinal !== null && viewFinal !== p?.version ? b?.finals.find((f) => f.version === viewFinal) ?? null : null;
  const type = b?.types.find((t) => t.key === p?.project_type) ?? null;
  const orgName = b?.org?.name ?? "";

  const priced = useMemo(() => {
    if (!b || !p) return null;
    return priceDraft({
      lines: b.lines, optionIds: b.options.map((o) => o.id),
      settings: { ...b.settings, margin_pct: margin }, sections: b.sections as unknown as DraftInput["sections"],
      days: n(b.job.duration_days), tax_on: b.estimate?.tax_on ?? true, discount: b.estimate?.discount_amount ?? 0, takeoff: b.takeoff,
      option_id: p.option_id, display: p.display ?? {}, draws: p.draws ?? [],
    });
  }, [b, p, margin]);

  const logo = (v: "light" | "dark") => (b?.org?.[v === "light" ? "logo_light" : "logo_dark"] ? `/api/org/logo/${v}${b.org.logo_stamp ? `?v=${encodeURIComponent(b.org.logo_stamp)}` : ""}` : null);

  const vm: DocVM | null = useMemo(() => {
    if (!b || !p) return null;
    const snap = finalShown?.snapshot ?? (isFinal ? p.snapshot : null);
    const cust = snap ? snap.customer : b.customer;
    const cont = snap ? snap.contact : b.contact;
    const customer = {
      name: str(cust?.name) ?? str(cont?.name), address: str(cust?.address_formatted) ?? ([str(cust?.address_line1), str(cust?.city), str(cust?.state)].filter(Boolean).join(", ") || null),
      phone: str(cont?.phone), email: str(cont?.email),
    };
    const org = { name: snap?.org?.name ?? orgName, logo: logo("light"), logoOnDark: logo("dark") ?? logo("light") };
    if (snap) {
      const coverUrl = b.photos.find((f) => f.id === snap.cover_file_id)?.url ?? null;
      return {
        number: snap.number, date: snap.made_at, readOnly: true, typeKey: p.project_type, typeLabel: type?.label ?? "",
        org, customer, job: { title: snap.job.title, address: snap.job.address, description: null }, coverUrl,
        scopeIntro: snap.scope_intro, areas: areasOf(snap.sections), priced: snap.price, display: snap.display, draws: snap.draws,
        check: snap.price.ok ? drawsCheck(snap.draws, snap.price.total) : null,
        warranty: { ...snap.warranty_text, template: snap.warranty_text.template?.name ?? null },
        terms: { ...snap.terms_text, template: snap.terms_text.template?.name ?? null }, typeDraws: [],
      };
    }
    const w = warrantyText(p.warranty, b.templates, orgName);
    const t = termsText(p.terms, b.templates, orgName);
    return {
      number: `${b.job.job_number ?? "P"}-${p.version}`, date: new Date().toISOString(), readOnly: false,
      typeKey: p.project_type, typeLabel: type?.label ?? "", org, customer,
      job: { title: b.job.title, address: b.job.address, description: b.job.description },
      coverUrl: b.photos.find((f) => f.id === p.cover_file_id)?.url ?? null,
      scopeIntro: p.scope_intro, areas: areasOf(b.sections), priced: priced!.priced, display: p.display ?? {}, draws: p.draws ?? [],
      check: priced!.check, warranty: { ...w, template: w.template?.name ?? null }, terms: { ...t, template: t.template?.name ?? null },
      typeDraws: type?.draws ?? [],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- logo() reads b.org only
  }, [b, p, priced, finalShown, isFinal, type, orgName]);

  // "Edit with Dusty": open him with a starter question; "Use this" brings his answer back here.
  const dusty = useCallback((kind: "warranty" | "terms" | "scope") => {
    if (!vm) return;
    const ask = kind === "warranty"
      ? `Rewrite this warranty in plain English for a ${vm.typeLabel.toLowerCase() || "residential"} customer. Keep what it covers and excludes; don't add promises.\n\n${vm.warranty.title}\n${vm.warranty.body}`
      : kind === "terms"
        ? `Tighten these terms for a ${vm.typeLabel.toLowerCase() || "residential"} job. Answer as a numbered list, each item "**Heading:** text".\n\n${vm.terms.clauses.map((c, i) => `${i + 1}. ${c.h}: ${c.b}`).join("\n")}`
        : `Write a two-sentence scope introduction for this proposal, for the customer, from the job's areas. No prices.`;
    setDustyUse({
      label: kind === "warranty" ? "in the warranty" : kind === "terms" ? "as the terms" : "as the scope intro",
      apply: (text) => {
        if (kind === "warranty") change("warranty", { ...p?.warranty, title: vm.warranty.title, body: plainText(text) });
        else if (kind === "terms") { const c = parseClauses(text); if (c.length) change("terms", { ...p?.terms, clauses: c }); }
        else change("scope_intro", plainText(text));
      },
    });
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: ask } })), 250);
  }, [vm, p, change]);
  useEffect(() => () => setDustyUse(null), []);

  const saveTemplate = useCallback(async (kind: "warranty" | "terms") => {
    if (!b || !p || !vm) return;
    const cur = kind === "warranty" ? b.templates.find((t) => t.id === p.warranty?.template_id) : b.templates.find((t) => t.id === p.terms?.template_id);
    const name = window.prompt(`Save this ${kind === "warranty" ? "warranty" : "contract"} as a template.\nSame name updates "${cur?.name ?? ""}" for every proposal that uses it; a new name makes a new one.`, cur?.name ?? "");
    if (!name?.trim()) return;
    const body = kind === "warranty" ? { title: vm.warranty.title, body: vm.warranty.body } : { title: vm.terms.title, clauses: vm.terms.clauses };
    try {
      setBusy("Saving the template…");
      const r = cur && cur.name === name.trim()
        ? await call(`/api/doc-templates/${cur.id}`, "PATCH", body)
        : await call("/api/doc-templates", "POST", { kind, name: name.trim(), project_types: p.project_type ? [p.project_type] : [], ...body });
      const t = r.template as DocTemplate;
      setB((x) => (x ? { ...x, templates: [...x.templates.filter((y) => y.id !== t.id), t] } : x));
      change(kind, { template_id: t.id } as never, 0);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [b, p, vm, change]);

  const setType = useCallback(async (key: string) => {
    if (!p || key === p.project_type) return;
    const t = b?.types.find((x) => x.key === key);
    if (!window.confirm(`Load the ${t?.label ?? key} defaults — what is shown, the draws, the warranty and the contract? Edits on this proposal are replaced.`)) return;
    try { setBusy("Loading defaults…"); await call(`/api/jobs/${jobId}/proposal`, "PATCH", { project_type: key }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [b, p, jobId, load]);

  const markFinal = useCallback(async () => {
    if (!window.confirm("Mark this proposal final? It is frozen as the customer will see it; changes after this start a new version.")) return;
    for (const x of timers.values()) clearTimeout(x.t);
    timers.clear();
    try {
      setBusy("Saving…");
      if (p) await call(`/api/jobs/${jobId}/proposal`, "PATCH", { display: p.display, draws: p.draws, warranty: p.warranty, terms: p.terms, scope_intro: p.scope_intro ?? "" });
      if (margin !== null) await call(`/api/jobs/${jobId}/proposal`, "PATCH", { margin_pct: margin });
      setBusy("Marking final…");
      await call(`/api/jobs/${jobId}/proposal/final`, "POST");
      setViewFinal(null); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [jobId, p, load, margin]);

  const newVersion = useCallback(async () => {
    try { setBusy("Starting a new version…"); await call(`/api/jobs/${jobId}/proposal/new-version`, "POST"); setViewFinal(null); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [jobId, load]);

  if (err && !b) return <div style={{ padding: 20, color: T.red }}>{err}</div>;
  if (!b || !p || !vm || !priced) return <div style={{ padding: 20, color: T.ink3 }}>Opening the proposal…</div>;

  const editable = !isFinal && !finalShown;
  const blocked = !vm.priced.ok ? "Fix the budget first" : vm.check && !vm.check.ok ? "Fix draws first" : null;
  const sectionsOn = SECTIONS.filter(([k]) => !(vm.display.off ?? {})[k]).length;
  const d = vm.display;
  const edits = editable ? {
    display: (x: ProposalDisplay) => change("display", x, 250),
    draws: (x: Draw[]) => change("draws", x),
    intro: (s: string) => change("scope_intro", s),
    warranty: (w: { title: string; body: string }) => change("warranty", { ...p.warranty, ...w }),
    terms: (c: Clause[]) => change("terms", { ...p.terms, clauses: c }),
    saveTemplate: (k: "warranty" | "terms") => void saveTemplate(k),
    dusty, pickCover: () => setCoverPick(true),
  } : null;

  const quick = (k: "show_item_prices" | "show_qty" | "show_tax_line") => edits?.display({ ...d, [k]: !d[k] });
  const chips = ([["show_item_prices", "Item prices"], ["show_qty", "Qty · unit"], ["show_tax_line", "Tax line"]] as const).map(([k, label]) => (
    <button key={k} onClick={() => quick(k)} aria-pressed={!!d[k]} className="rounded-full shrink-0"
      style={{ height: 26, padding: "0 10px", fontSize: 11.5, border: `1px solid ${d[k] ? "#B85A3C" : T.hair}`, background: d[k] ? "#F6E2D8" : T.card, color: d[k] ? "#9A4527" : T.ink2 }}>{label}</button>
  ));
  const aside = (
    <JobPanel b={b} p={p} vm={vm} priced={priced} margin={margin} editable={editable}
      onMargin={(m) => { setMargin(m); save("margin_pct", m, 500); }}
      onType={setType} onSplit={(s) => change("split", s, 0)} onOption={(id) => change("option_id", id, 0)}
      onWarrantyTpl={(id) => change("warranty", { template_id: id }, 0)} onTermsTpl={(id) => change("terms", { template_id: id }, 0)} />
  );

  return (
    <div ref={wideRef} className="sc-proposal flex" style={{ minHeight: "calc(100dvh - var(--sc-head))", background: "var(--sc-doc-ground, #E9E4DA)" }}>
      {wide && <aside className="sc-no-print shrink-0" style={{ width: 300, background: T.card, borderRight: `1px solid ${T.hair}`, overflowY: "auto", maxHeight: "calc(100dvh - var(--sc-head))", position: "sticky", top: "var(--sc-head)" }}>{aside}</aside>}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        <div className="sc-no-print flex items-center gap-2 flex-wrap" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "6px 12px", minHeight: 44, position: "sticky", top: "var(--sc-head)", zIndex: 5 }}>
          {!wide && (
            <button onClick={() => setPanel(true)} className="rounded flex items-center gap-1.5" style={{ height: 30, padding: "0 10px", border: `1px solid ${T.hairStrong}`, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: T.ink }}>☰ Job</button>
          )}
          {wide && <Link href={`/dashboard/scope/${jobId}`} className="no-underline" style={{ color: T.ink3, fontSize: F.xs }}>← Job</Link>}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wide ? "Proposal " : ""}{vm.number}{isFinal || finalShown ? " · final" : " · draft"}</div>
            <div style={{ fontSize: 11, color: T.ink3 }}>{vm.priced.ok ? usd(vm.priced.total) : "no price yet"} · {sectionsOn}/8 sections</div>
          </div>
          {b.finals.length > 0 && (
            <select aria-label="Version" value={viewFinal ?? ""} onChange={(e) => setViewFinal(e.target.value ? Number(e.target.value) : null)}
              style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12 }}>
              <option value="">{isFinal ? `v${p.version} (latest, final)` : `v${p.version} draft`}</option>
              {b.finals.filter((f) => f.version !== p.version).map((f) => <option key={f.id} value={f.version}>v{f.version} final · {new Date(f.finalized_at).toLocaleDateString()}</option>)}
            </select>
          )}
          {editable && wide && chips}
          <button onClick={() => window.print()} disabled={!!blocked && editable} title={blocked && editable ? blocked : "Print, or Save as PDF from the print dialog"} className="rounded"
            style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: blocked && editable ? T.ink3 : T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>
            {blocked && editable ? (wide ? blocked : "Fix first") : wide ? "Print / PDF" : "PDF"}
          </button>
          {editable ? (
            <button onClick={() => void markFinal()} disabled={!!blocked || !!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", background: blocked ? "#B3AA9A" : "#B85A3C", color: "#fff", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{wide ? "Mark final" : "Final"}</button>
          ) : !finalShown && (
            <button onClick={() => void newVersion()} disabled={!!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", background: "#B85A3C", color: "#fff", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{wide ? "New version" : "New ver."}</button>
          )}
        </div>
        {(busy || err || (isFinal && !finalShown) || finalShown) && (
          <div className="sc-no-print" style={{ padding: "6px 14px", fontSize: 12, background: err ? T.redDim : T.sunk, color: err ? T.red : T.ink2 }}>
            {err ?? busy ?? `Final — frozen ${new Date((finalShown ?? b.finals.find((f) => f.version === p.version))?.finalized_at ?? p.finalized_at ?? p.created_at).toLocaleString()}. This is what the customer was shown; the job's budget can move on. Start a new version to change it.`}
          </div>
        )}
        <div className="sc-doc-scroll flex-1" style={{ padding: wide ? "20px 20px 60px" : "10px 8px 80px" }}>
          {editable && !wide && <div className="sc-no-print flex gap-1.5 overflow-x-auto" style={{ marginBottom: 8 }}>{chips}</div>}
          <ProposalDocument vm={vm} edits={edits} narrow={!wide} />
          {editable && <div className="sc-no-print" style={{ maxWidth: 720, margin: "12px auto 0", fontSize: 11.5, color: "#5E5A52" }}>Photos &amp; plan pages, an options comparison and references come later.</div>}
        </div>
      </div>

      {!wide && panel && (
        <div className="sc-no-print fixed inset-x-0 z-40 flex flex-col" style={{ top: "var(--sc-head)", bottom: 0, background: T.card }}>
          <div className="flex items-center" style={{ height: 44, padding: "0 12px", borderBottom: `1px solid ${T.hair}` }}>
            <span style={{ fontFamily: disp, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", fontSize: 13, color: T.ink }}>Job panel</span>
            <span className="flex-1" />
            <button onClick={() => setPanel(false)} className="rounded" style={{ height: 30, padding: "0 12px", background: "#2A2A2A", color: "#FBF6EC", fontFamily: disp, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>× Close</button>
          </div>
          <div className="flex-1 overflow-y-auto">{aside}</div>
        </div>
      )}

      {coverPick && (
        <div className="sc-no-print fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.4)" }} onClick={() => setCoverPick(false)}>
          <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: T.card, width: "min(560px, 94vw)", maxHeight: "80vh", overflowY: "auto", padding: 14 }}>
            <div className="flex items-center mb-2"><b style={{ color: T.ink }}>Cover photo</b><span className="flex-1" /><button onClick={() => setCoverPick(false)} style={{ color: T.ink3 }}>×</button></div>
            {!b.photos.length && <div style={{ fontSize: 13, color: T.ink3 }}>No photos on this job yet — add them on the job page (each area has Photos).</div>}
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {b.photos.filter((f) => f.url).map((f) => (
                <button key={f.id} onClick={() => { change("cover_file_id", f.id, 0); setCoverPick(false); }} title={f.name ?? ""}
                  style={{ aspectRatio: "4/3", background: `#ddd url("${f.url}") center/cover`, border: p.cover_file_id === f.id ? "3px solid #B85A3C" : `1px solid ${T.hair}`, borderRadius: 4 }} />
              ))}
            </div>
            {p.cover_file_id && <button onClick={() => { change("cover_file_id", null, 0); setCoverPick(false); }} className="mt-3" style={{ fontSize: 12, color: T.red }}>No cover photo</button>}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: T.ink3 };
const TYPE_COLORS: Record<string, string> = { material: "#1E5AA8", labor: "#D97757", equipment: "#6A55B0", other: "#8C8578" };
const TYPE_LABEL: Record<string, string> = { material: "Materials", labor: "Labor", equipment: "Equipment", other: "Misc" };

function JobPanel({ b, p, vm, priced, margin, editable, onMargin, onType, onSplit, onOption, onWarrantyTpl, onTermsTpl }: {
  b: Bundle; p: Prop; vm: DocVM; priced: ReturnType<typeof priceDraft>; margin: number | null; editable: boolean;
  onMargin: (m: number) => void; onType: (k: string) => void; onSplit: (s: Prop["split"]) => void; onOption: (id: string | null) => void;
  onWarrantyTpl: (id: string | null) => void; onTermsTpl: (id: string | null) => void;
}) {
  const pr = vm.readOnly ? vm.priced : priced.priced;
  const ok = pr.ok ? pr : null;
  const direct = ok ? ok.cost : 0;
  const oh = b.settings.overhead_pct;
  const forType = (kind: "warranty" | "terms") => b.templates.filter((t) => t.kind === kind && (!p.project_type || !t.project_types.length || t.project_types.includes(p.project_type)));
  const split = p.split === "20_80" ? [20, 80] : p.split === "30_70" ? [30, 70] : null;
  const sec = { padding: "12px 14px", borderBottom: `1px solid ${T.hairSoft}` };
  return (
    <div style={{ color: T.ink, fontSize: 12.5 }}>
      <div style={sec}>
        <div className="flex items-center gap-2">
          <span style={lbl}>Job {b.job.job_number ?? ""}</span>
          <span style={{ fontSize: 10.5, borderRadius: 3, padding: "0 6px", background: vm.readOnly ? T.greenDim : "#F7EBC9", color: vm.readOnly ? T.green : "#6B4E12" }}>{vm.readOnly ? "Proposal final" : "Proposal draft"}</span>
        </div>
        <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 18, lineHeight: 1.2, marginTop: 4 }}>{b.job.title || "Untitled job"}</div>
        <div style={{ color: T.ink2, fontSize: 12.5 }}>{[vm.customer.name, vm.customer.address ?? b.job.address].filter(Boolean).join(" · ") || "No customer yet"}</div>
      </div>

      <div style={sec}>
        <div style={lbl}>Project type</div>
        <div className="flex mt-1.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
          {b.types.map((t) => (
            <button key={t.key} disabled={!editable} onClick={() => onType(t.key)} className="flex-1"
              style={{ height: 26, fontSize: 12, background: p.project_type === t.key ? "#2A2A2A" : T.card, color: p.project_type === t.key ? "#FBF6EC" : T.ink2, borderLeft: `1px solid ${T.hair}` }}>{t.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 6 }}>
          {p.project_type ? "The type sets what is shown, the draws, and which warranty and contract load." : "Pick a type to load its defaults."} Defaults per type are in{" "}
          <Link href="/dashboard/price-book?tab=defaults" style={{ color: T.chalk }}>Price book → Defaults</Link>.
        </div>
      </div>

      {b.options.length > 0 && (
        <div style={sec}>
          <div style={lbl}>Option on this proposal</div>
          <select disabled={!editable} value={p.option_id ?? ""} onChange={(e) => onOption(e.target.value || null)} className="mt-1.5 w-full"
            style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink }}>
            <option value="">{b.options[0]?.label ?? "First"} (first)</option>
            {b.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div style={sec}>
        <div className="flex items-center"><span style={lbl}>Cost → price</span><span className="flex-1" /><Link href={`/dashboard/scope/${b.job.id}#budget`} style={{ fontSize: 11, color: T.chalk }}>From budget</Link></div>
        {!ok ? (
          <div className="mt-2" style={{ fontSize: 12, color: "#6B4E12", background: "#F7EBC9", borderRadius: 3, padding: "8px 10px" }}>
            No price yet — {!pr.ok ? pr.blocked.slice(0, 3).join("; ") : ""}{!pr.ok && pr.blocked.length > 3 ? "…" : ""}
          </div>
        ) : (
          <>
            {(["material", "labor", "equipment", "other"] as const).map((k) => ok.by_type[k] > 0 && (
              <div key={k} className="flex items-center gap-2 mt-1.5"><span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[k] }} /><span className="flex-1">{TYPE_LABEL[k]}</span><span style={nums}>{usd0(ok.by_type[k])}</span></div>
            ))}
            <div className="flex mt-2 rounded overflow-hidden" style={{ height: 8, background: T.sunk }}>
              {(["material", "labor", "equipment", "other"] as const).map((k) => <span key={k} style={{ width: `${direct ? (ok.by_type[k] / direct) * 100 : 0}%`, background: TYPE_COLORS[k] }} />)}
            </div>
            <div className="flex mt-2"><span className="flex-1">Direct cost</span><b style={nums}>{usd0(direct)}</b></div>
            <div className="flex mt-1"><span className="flex-1">Overhead {oh ?? "—"}%</span><span style={nums}>{usd0(ok.overhead)}</span></div>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex-1">Profit</span>
              <span style={nums}>{usd0(ok.profit)}</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span style={{ fontSize: 12 }}>Margin</span>
          <input type="range" min={5} max={45} step={0.5} value={margin ?? 20} disabled={!editable} aria-label="Margin" onChange={(e) => onMargin(Number(e.target.value))} className="flex-1" style={{ accentColor: "#B85A3C" }} />
          <input inputMode="decimal" value={margin ?? ""} placeholder="—" disabled={!editable} aria-label="Margin percent"
            onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v >= 0 && v < 100) onMargin(v); }}
            style={{ width: 46, textAlign: "right", border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, padding: "1px 4px" }} />
          <span>%</span>
        </div>
        {margin === null && <div style={{ fontSize: 11.5, color: T.red, marginTop: 4 }}>No margin set for this job — set one to price it.</div>}
        {ok && (
          <>
            <div className="flex items-baseline mt-2"><span className="flex-1" style={{ fontWeight: 600 }}>Price</span><span style={{ fontFamily: strong, fontWeight: 700, fontSize: 18, ...nums }}>{usd0(ok.rounded)}</span></div>
            <div style={{ fontSize: 11, color: T.ink3 }}>Calculated {usd(ok.calc)} → rounded to {usd0(ok.rounded)} (+{usd(ok.rounded - ok.calc)}). Rounds up to the nearest $50; the extra is profit. The budget keeps the exact number.</div>
            {ok.tax > 0 && <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>Plus {usd(ok.tax)} sales tax (a pass-through){ok.discount ? `, less ${usd(ok.discount)} discount` : ""} = {usd(ok.total)}.</div>}
          </>
        )}
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>The margin here is the job&apos;s — the budget uses the same number.</div>
      </div>

      <div style={sec}>
        <div style={lbl}>Profit split with a sub</div>
        <div className="flex gap-1 mt-1.5">
          {([["none", "No sub"], ["20_80", "20 / 80"], ["30_70", "30 / 70"]] as const).map(([k, l]) => (
            <button key={k} disabled={!editable} onClick={() => onSplit(k)} className="rounded flex-1"
              style={{ height: 26, fontSize: 12, border: `1px solid ${p.split === k ? "#2A2A2A" : T.hair}`, background: p.split === k ? "#2A2A2A" : T.card, color: p.split === k ? "#FBF6EC" : T.ink2 }}>{l}</button>
          ))}
        </div>
        {split && ok && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded" style={{ background: T.sunk, padding: "6px 8px" }}><div style={{ fontSize: 10.5, color: T.ink3 }}>You keep {split[0]}%</div><b style={nums}>{usd0(ok.profit * split[0] / 100)}</b></div>
            <div className="rounded" style={{ background: T.sunk, padding: "6px 8px" }}><div style={{ fontSize: 10.5, color: T.ink3 }}>Sub {split[1]}%</div><b style={nums}>{usd0(ok.profit * split[1] / 100)}</b></div>
          </div>
        )}
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>Yours only — never on the proposal, never changes the price.</div>
      </div>

      <div style={sec}>
        <div style={lbl}>Templates</div>
        <label className="block mt-1.5" style={{ fontSize: 11.5, color: T.ink2 }}>Warranty
          <select disabled={!editable} value={p.warranty?.template_id ?? ""} onChange={(e) => onWarrantyTpl(e.target.value || null)} className="w-full mt-0.5"
            style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink }}>
            <option value="">None</option>
            {forType("warranty").map((t) => <option key={t.id} value={t.id}>{t.name}{t.starter ? " (starter)" : ""}</option>)}
          </select>
        </label>
        <label className="block mt-1.5" style={{ fontSize: 11.5, color: T.ink2 }}>Contract
          <select disabled={!editable} value={p.terms?.template_id ?? ""} onChange={(e) => onTermsTpl(e.target.value || null)} className="w-full mt-0.5"
            style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink }}>
            <option value="">None</option>
            {forType("terms").map((t) => <option key={t.id} value={t.id}>{t.name}{t.starter ? " (starter)" : ""}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>Picking a template replaces this proposal&apos;s edits to that section. Edits here stay on this proposal unless you Save as template. Starter text came from the design — check it with your attorney.</div>
      </div>
    </div>
  );
}
