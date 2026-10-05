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
 * saved to the draft. Preview shows the document as the customer gets it and
 * sends it (migration 075): sending freezes the draft as a final version and
 * makes its link; every opening of the link is listed.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, disp, strong } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { JobTabs } from "@/components/v34/job-tabs";
import { setDustyUse } from "@/lib/v34/dusty-live";
import {
  drawsCheck, parseClauses, plainText, priceChoices, priceDraft, termsText, warrantyText,
  type Clause, type DocTemplate, type Draw, type DraftInput, type ProposalDisplay, type ProposalPrice,
} from "@/lib/proposal";
import type { BudgetSettings, TakeoffTotal } from "@/lib/engine";
import { ProposalDocument, SECTIONS, usd, usd0, type DocArea, type DocVM } from "./document";
import { areaVisuals } from "./area-visuals";
import type { PlansData } from "@/components/v34/plan-room/shared";
import { ProposalPreview, type PropLink } from "./preview";
import { viewLine } from "@/lib/proposal-links";

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
  customer: Rec | null; contact: Rec | null; org: { name: string } | null; prepared_by?: Rec | null;
  display: ProposalDisplay; draws: Draw[]; scope_intro: string | null; cover_file_id: string | null;
  warranty_text: { title: string; body: string; template: { name: string } | null; starter: boolean; edited: boolean };
  terms_text: { title: string; clauses: Clause[]; template: { name: string } | null; starter: boolean; edited: boolean };
  sections: Rec[]; price: ProposalPrice;
  choices?: DocVM["choices"];
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
  customer: Rec | null; contact: Rec | null; preparer?: Rec | null;
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
      sqft: o ?? (L && W ? L * W : null), depth_in: n(s.depth_in), psi: n(s.psi), rebar: str(s.rebar),
      count: n(s.count_qty), count_unit: str(s.count_unit) };
  });
}

export function Proposal({ jobId }: { jobId: string }) {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<Prop | null>(null);
  const [margin, setMargin] = useState<number | null>(null);
  // ?v=N (from Files) opens that final version.
  const [viewFinal, setViewFinal] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = Number(new URLSearchParams(window.location.search).get("v"));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const [panel, setPanel] = useState(false);
  const [preview, setPreview] = useState(false);
  const [links, setLinks] = useState<PropLink[]>([]);
  const loadLinks = useCallback(() => {
    call(`/api/jobs/${jobId}/proposal/link`, "GET").then((d) => setLinks((d.links ?? []) as PropLink[])).catch(() => {});
  }, [jobId]);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/proposal/link`, "GET").then((d) => { if (!off) setLinks((d.links ?? []) as PropLink[]); }).catch(() => {});
    return () => { off = true; };
  }, [jobId]);
  const [coverPick, setCoverPick] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [wideRef, wide] = useWide<HTMLDivElement>(1000);
  // The Plan Room's shapes and photos, for each area's map and photos on the Scope.
  const [plans, setPlans] = useState<PlansData | null>(null);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/plans`, "GET").then((d: PlansData) => { if (!off) setPlans(d); }).catch(() => {});
    return () => { off = true; };
  }, [jobId]);

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

  // "Every option — the customer picks": each option priced as its own proposal would be.
  const picks = useMemo(() => {
    if (!b || !p || !p.display?.all_options || b.options.length < 2) return null;
    return priceChoices({
      lines: b.lines, optionIds: b.options.map((o) => o.id),
      settings: { ...b.settings, margin_pct: margin }, sections: b.sections as unknown as DraftInput["sections"],
      days: n(b.job.duration_days), tax_on: b.estimate?.tax_on ?? true, discount: b.estimate?.discount_amount ?? 0, takeoff: b.takeoff,
      option_id: p.option_id, display: p.display ?? {}, draws: p.draws ?? [],
    }, b.options);
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
    // A final keeps who prepared it; one finalised before this was kept shows the org alone.
    const by = snap ? snap.prepared_by ?? null : b.preparer ?? null;
    const preparedBy = by ? { name: str(by.name), phone: str(by.phone), email: str(by.email) } : null;
    if (snap) {
      const coverUrl = b.photos.find((f) => f.id === snap.cover_file_id)?.url ?? null;
      return {
        number: snap.number, date: snap.made_at, readOnly: true, typeKey: p.project_type, typeLabel: type?.label ?? "",
        org, preparedBy, customer, job: { title: snap.job.title, address: snap.job.address, description: null }, coverUrl,
        scopeIntro: snap.scope_intro, areas: areasOf(snap.sections), visuals: areaVisuals(plans, snap.sections.map((x) => String(x.id))), priced: snap.price, display: snap.display, draws: snap.draws,
        choices: snap.choices ?? null,
        check: snap.choices ? { sum: 100, gap: 0, ok: true, pct: 100 } : snap.price.ok ? drawsCheck(snap.draws, snap.price.total) : null,
        warranty: { ...snap.warranty_text, template: snap.warranty_text.template?.name ?? null },
        terms: { ...snap.terms_text, template: snap.terms_text.template?.name ?? null }, typeDraws: [],
      };
    }
    const w = warrantyText(p.warranty, b.templates, orgName);
    const t = termsText(p.terms, b.templates, orgName);
    return {
      number: `${b.job.job_number ?? "P"}-${p.version}`, date: new Date().toISOString(), readOnly: false,
      typeKey: p.project_type, typeLabel: type?.label ?? "", org, preparedBy, customer,
      job: { title: b.job.title, address: b.job.address, description: b.job.description },
      coverUrl: b.photos.find((f) => f.id === p.cover_file_id)?.url ?? null,
      scopeIntro: p.scope_intro, areas: areasOf(b.sections), visuals: areaVisuals(plans, b.sections.map((x) => x.id)), priced: priced!.priced, display: p.display ?? {}, draws: p.draws ?? [],
      choices: picks ? { list: picks.choices, shared: picks.shared } : null,
      check: picks ? picks.check : priced!.check, warranty: { ...w, template: w.template?.name ?? null }, terms: { ...t, template: t.template?.name ?? null },
      typeDraws: type?.draws ?? [],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- logo() reads b.org only
  }, [b, p, priced, picks, finalShown, isFinal, type, orgName, plans]);

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

  // Freeze the draft as a final version — what the customer is sent (Preview → Send). Throws so the panel can say why.
  const finalize = useCallback(async () => {
    for (const x of timers.values()) clearTimeout(x.t);
    timers.clear();
    if (p) await call(`/api/jobs/${jobId}/proposal`, "PATCH", { display: p.display, draws: p.draws, warranty: p.warranty, terms: p.terms, scope_intro: p.scope_intro ?? "" });
    if (margin !== null) await call(`/api/jobs/${jobId}/proposal`, "PATCH", { margin_pct: margin });
    await call(`/api/jobs/${jobId}/proposal/final`, "POST");
    setViewFinal(null); await load();
  }, [jobId, p, load, margin]);

  const newVersion = useCallback(async () => {
    try { setBusy("Starting a new version…"); await call(`/api/jobs/${jobId}/proposal/new-version`, "POST"); setViewFinal(null); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [jobId, load]);

  if (err && !b) return <div style={{ padding: 20, color: T.red }}>{err}</div>;
  if (!b || !p || !vm || !priced) return <div style={{ padding: 20, color: T.ink3 }}>Opening the proposal…</div>;

  const editable = !isFinal && !finalShown;
  // Why it can't be sent yet, in words (the old "Fix the budget first" button is gone — Coy, 2026-10-03).
  const stuckChoice = vm.choices?.list.find((c) => c.total === null);
  const blocked = vm.choices
    ? stuckChoice ? `${stuckChoice.label} has no price yet: ${stuckChoice.blocked}` : vm.check && !vm.check.ok ? "with every option offered, the draws must be percentages that add up to 100%" : null
    : !vm.priced.ok ? `the budget has no price yet: ${vm.priced.blocked[0] ?? ""}` : vm.check && !vm.check.ok ? "the draws don't add up to the total" : null;
  const live = links.find((l) => !l.revoked_at && l.status !== "void") ?? null;
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

  const quick = (k: "show_item_prices" | "show_qty" | "show_tax_line" | "hide_area_pics") => edits?.display({ ...d, [k]: !d[k] });
  // "Maps & photos" is on unless switched off (hide_area_pics), the others off unless switched on.
  const chips = ([["show_item_prices", "Item prices"], ["show_qty", "Qty · unit"], ["show_tax_line", "Tax line"], ["hide_area_pics", "Maps & photos"]] as const).map(([k, label]) => {
    const on = k === "hide_area_pics" ? !d[k] : !!d[k];
    return (
      <button key={k} onClick={() => quick(k)} aria-pressed={on} className="rounded-full shrink-0"
        style={{ height: 26, padding: "0 10px", fontSize: 11.5, border: `1px solid ${on ? "#B85A3C" : T.hair}`, background: on ? "#F6E2D8" : T.card, color: on ? "#9A4527" : T.ink2 }}>{label}</button>
    );
  });
  // What used to be the slide-over "Job panel" (Coy, 2026-10-02): the money — margin, cost by type, the
  // sub split — lives on the job's Budget now; what shapes the DOCUMENT stays here, as one strip.
  const settings = (
    <ProposalSettings b={b} p={p} editable={editable} onType={setType}
      onOption={(id) => {
        // "Every option" is a display switch; a single option is the proposal's option.
        if (id === "__all") { change("display", { ...(p.display ?? {}), all_options: true }, 0); return; }
        if (p.display?.all_options) change("display", { ...(p.display ?? {}), all_options: false }, 0);
        change("option_id", id, 0);
      }}
      onWarrantyTpl={(id) => change("warranty", { template_id: id }, 0)} onTermsTpl={(id) => change("terms", { template_id: id }, 0)} />
  );
  const ok = vm.priced.ok ? vm.priced : null;

  return (
    <div ref={wideRef} className="sc-proposal flex" style={{ minHeight: "calc(100dvh - var(--sc-head))", background: "var(--sc-doc-ground, #E9E4DA)" }}>
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        <div className="sc-no-print flex items-center gap-2 flex-wrap" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "6px 12px", minHeight: 44, position: "sticky", top: "var(--sc-head)", zIndex: 5 }}>
          <JobTabs jobId={jobId} active="proposal" />
          <div className="flex-1" style={{ minWidth: 120 }}>
            <div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.job.title || "Proposal"} · {vm.number}{isFinal || finalShown ? " · final" : " · draft"}</div>
            <div style={{ fontSize: 11, color: T.ink3, overflowWrap: "anywhere" }}>
              {vm.choices ? `${vm.choices.list.length} options · ${vm.choices.list.map((c) => `${c.label} ${c.total !== null ? usd0(c.total) : "—"}`).join(" · ")}`
                : ok ? `${usd(ok.total)}${ok.rounded !== ok.calc ? ` · ${usd(ok.calc)} rounded up to ${usd0(ok.rounded)}` : ""}` : `no price yet${!vm.priced.ok ? ` — ${vm.priced.blocked[0]}` : ""}`} · {sectionsOn}/8 sections
              {live && <> · <b style={{ color: live.view_count ? "#1F5C3A" : T.ink2 }}>v{live.version?.version} {live.sent_at ? "sent" : "link made"} · {viewLine(live)}</b></>}
            </div>
          </div>
          {b.finals.length > 0 && (
            <select aria-label="Version" value={viewFinal ?? ""} onChange={(e) => setViewFinal(e.target.value ? Number(e.target.value) : null)}
              style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12 }}>
              <option value="">{isFinal ? `v${p.version} (latest, final)` : `v${p.version} draft`}</option>
              {b.finals.filter((f) => f.version !== p.version).map((f) => <option key={f.id} value={f.version}>v{f.version} final · {new Date(f.finalized_at).toLocaleDateString()}</option>)}
            </select>
          )}
          {editable && wide && chips}
          {(!blocked || !editable) && (
            <button onClick={() => window.print()} title="Print, or Save as PDF from the print dialog" className="rounded"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>
              {wide ? "Print / PDF" : "PDF"}
            </button>
          )}
          {!finalShown && (
            <button onClick={() => { flushSaves(); setPreview(true); }} disabled={!!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", background: "#B85A3C", color: "#fff", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Preview</button>
          )}
          {!editable && !finalShown && (
            <button onClick={() => void newVersion()} disabled={!!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{wide ? "New version" : "New ver."}</button>
          )}
        </div>
        <div className="sc-no-print" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <button onClick={() => setPanel((x) => !x)} aria-expanded={panel || wide} className="w-full flex items-center gap-2 text-left" style={{ padding: "6px 12px", display: wide ? "none" : "flex", cursor: "pointer", color: T.ink2, fontSize: 12 }}>
            <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>Proposal settings</span>
            <span style={{ color: T.ink3 }}>{[type?.label, p.warranty?.template_id ? "warranty" : null, p.terms?.template_id ? "contract" : null].filter(Boolean).join(" · ")}</span>
            <span className="flex-1" /><span style={{ color: T.ink3 }}>{panel ? "▴" : "▾"}</span>
          </button>
          {(wide || panel) && settings}
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

      {preview && (
        <ProposalPreview jobId={jobId} vm={vm} draft={editable} version={p.version} blocked={editable ? blocked : null} coverFileId={p.cover_file_id}
          onFinalize={finalize} onClose={() => setPreview(false)} links={links} onLinks={loadLinks} />
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

/** What shapes the document: the project type (loads its defaults), the option, and the warranty and contract. */
function ProposalSettings({ b, p, editable, onType, onOption, onWarrantyTpl, onTermsTpl }: {
  b: Bundle; p: Prop; editable: boolean;
  onType: (k: string) => void; onOption: (id: string | null) => void;
  onWarrantyTpl: (id: string | null) => void; onTermsTpl: (id: string | null) => void;
}) {
  const forType = (kind: "warranty" | "terms") => b.templates.filter((t) => t.kind === kind && (!p.project_type || !t.project_types.length || t.project_types.includes(p.project_type)));
  const sel: React.CSSProperties = { height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12, maxWidth: 220 };
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2" style={{ padding: "8px 12px", color: T.ink, fontSize: 12 }}>
      <div>
        <div style={lbl}>Project type</div>
        <div className="flex mt-1 rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
          {b.types.map((t, i) => (
            <button key={t.key} disabled={!editable} onClick={() => onType(t.key)}
              style={{ height: 26, padding: "0 10px", fontSize: 12, background: p.project_type === t.key ? "#2A2A2A" : T.card, color: p.project_type === t.key ? "#FBF6EC" : T.ink2, borderLeft: i ? `1px solid ${T.hair}` : "none" }}>{t.label}</button>
          ))}
        </div>
      </div>
      {b.options.length > 0 && (
        <label className="block"><span style={lbl}>Option</span><br />
          <select disabled={!editable} value={p.display?.all_options && b.options.length > 1 ? "__all" : p.option_id ?? ""} onChange={(e) => onOption(e.target.value || null)} className="mt-1" style={sel}>
            <option value="">{b.options[0]?.label ?? "First"} (first)</option>
            {b.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            {b.options.length > 1 && <option value="__all">Every option — the customer picks</option>}
          </select>
        </label>
      )}
      <label className="block"><span style={lbl}>Warranty</span><br />
        <select disabled={!editable} value={p.warranty?.template_id ?? ""} onChange={(e) => onWarrantyTpl(e.target.value || null)} className="mt-1" style={sel}>
          <option value="">None</option>
          {forType("warranty").map((t) => <option key={t.id} value={t.id}>{t.name}{t.starter ? " (starter)" : ""}</option>)}
        </select>
      </label>
      <label className="block"><span style={lbl}>Contract</span><br />
        <select disabled={!editable} value={p.terms?.template_id ?? ""} onChange={(e) => onTermsTpl(e.target.value || null)} className="mt-1" style={sel}>
          <option value="">None</option>
          {forType("terms").map((t) => <option key={t.id} value={t.id}>{t.name}{t.starter ? " (starter)" : ""}</option>)}
        </select>
      </label>
      <div style={{ fontSize: 11, color: T.ink3, flexBasis: "100%" }}>
        {b.options.length > 1 ? <>An option is a set of budget lines: lines tagged with it are only in it; untagged lines are in every option. &ldquo;Every option&rdquo; prices each one and shows them side by side for the customer to pick.<br /></> : null}
        Margin, O.H., tax and the sub split are on the job&apos;s <Link href={`/dashboard/scope/${b.job.id}`} style={{ color: T.chalk }}>Budget</Link>. Defaults per type are in{" "}
        <Link href="/dashboard/price-book?tab=defaults" style={{ color: T.chalk }}>Price book → Defaults</Link>. Picking a template replaces this proposal&apos;s edits to that section.
      </div>
    </div>
  );
}
