"use client";
/**
 * Job › Proposal (migration 060; Claude Design, design/proposal). Coy,
 * 2026-10-01: "Go ahead with the proposals."
 *
 * The job's budget made presentable for the customer: the job panel on the
 * left (project type, cost → price with the margin, the sub split, which
 * warranty and contract load), the document in the middle. The budget is the
 * only pricer — priceDraft() runs the engine's budget() and rounds the
 * customer's price up to the next whole dollar (the proposal only). Every change is
 * saved to the draft. Preview shows the document as the customer gets it and
 * sends it (migration 075): sending freezes the draft as a final version and
 * makes its link; every opening of the link is listed.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, disp } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { setDustyUse } from "@/lib/v34/dusty-live";
import { USE_ASK } from "@/lib/dusty/use-block";
import { sowFromAnswer, sowQuestion } from "@/lib/scope-of-work";
import {
  drawsCheck, parseClauses, plainText, priceChoices, priceDraft, termsText, warrantyText,
  type Clause, type DocTemplate, type Draw, type DraftInput, type ProposalDisplay, type ProposalPrice,
} from "@/lib/proposal";
import type { BudgetSettings, TakeoffTotal } from "@/lib/engine";
import { ProposalDocument, usd, usd0, type DocArea, type DocVM } from "./document";
import { areaVisuals } from "./area-visuals";
import type { PlansData } from "@/components/v34/plan-room/shared";
import Link from "next/link";
import { ProposalPreview, type PropLink } from "./preview";
import { formatProposalNumber, type NumberBase } from "@/lib/proposal-number";
import {
  insertAfter, newPageId, pagesOf, withoutNew, patchPage, sellOf, sendCheck, stampText, PARTS, partOff, togglePart,
  type ProposalPage, type SendFinding,
} from "@/lib/proposal-pages";
import { AddPageMenu, EditorHead, Modal, PageColumn, PullIn, SendCheck, UndoToast, pageFromPick, type AddPick } from "./builder";
import { sendBytes } from "@/components/v34/files-panel";
import { ProposalOpenings } from "./openings";

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
  photos: Array<{ id: string; name: string | null; url: string | null; taken_at?: string | null; lat?: number | null; lng?: number | null }>;
  pdfs?: Array<{ id: string; name: string | null; url: string | null; category: string | null; bytes: number | null }>;
  number_base?: NumberBase;
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
      count: n(s.count_qty), count_unit: str(s.count_unit), scope: str(s.prep_notes) };
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
  // ?send=1 (the Summary's Resend, 2026-10-11) opens the Preview's send panel.
  const [preview, setPreview] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("send") === "1");
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<PropLink[]>([]);
  const [showOpens, setShowOpens] = useState(false);
  const opens = links.reduce((n, l) => n + (l.events ?? []).filter((e) => e.event === "viewed").length, 0);
  const msgCount = links.reduce((n, l) => n + (l.messages?.length ?? 0), 0);
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

  // ── The builder (Claude Design "Proposal Builder v2", 2026-10-23): the page list, one page open in the
  // editor, + Add page, Pull in, the pickers, the check before sending, and the undo toast.
  const [openId, setOpenId] = useState<string | null>(null);
  const [addAt, setAddAt] = useState<boolean>(false);
  const [pull, setPull] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [picker, setPicker] = useState<{ kind: "photos" | "pdf" | "ifind"; pageId: string } | null>(null);
  const [findings, setFindings] = useState<SendFinding[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const addRef = React.useRef<HTMLDivElement>(null);
  // Print / PDF draws every page (the builder shows one at a time); it is drawn only while printing.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true), off = () => setPrinting(false);
    window.addEventListener("beforeprint", on); window.addEventListener("afterprint", off);
    return () => { window.removeEventListener("beforeprint", on); window.removeEventListener("afterprint", off); };
  }, []);
  const writePages = useCallback((next: ProposalPage[]) => {
    setP((x) => {
      if (!x) return x;
      const display = { ...x.display, pages: next };
      save("display", display, 250);
      return { ...x, display };
    });
  }, [save]);
  const pagesChange = useCallback((text: string, before: ProposalPage[], after: ProposalPage[], open?: string | null) => {
    writePages(after);
    if (open !== undefined) setOpenId(open);
    setToast({ text, undo: () => { writePages(before); if (open !== undefined) setOpenId(null); } });
  }, [writePages]);
  // A draft opened in the builder keeps its page list from then on (At a glance on); the New tags are
  // for pages added since it was last opened, so they come off now.
  useEffect(() => {
    if (!p || p.status !== "draft") return;
    const saved = Array.isArray(p.display?.pages) && p.display.pages.length > 0;
    if (saved && !pagesOf(p.display).some((x) => x.isNew)) return;
    const next = saved ? pagesOf(p.display).map(withoutNew) : pagesOf(p.display, { fresh: true });
    const display = { ...p.display, pages: next };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once per draft opened, then saved
    setP((x) => (x ? { ...x, display } : x));
    save("display", display, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per draft opened
  }, [p?.id, p?.status]);

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
      phone: str(cont?.phone), email: str(cont?.email), person: str(cont?.name),
    };
    const org = { name: snap?.org?.name ?? orgName, logo: logo("light"), logoOnDark: logo("dark") ?? logo("light") };
    // A final keeps who prepared it; one finalised before this was kept shows the org alone.
    const by = snap ? snap.prepared_by ?? null : b.preparer ?? null;
    const preparedBy = by ? { name: str(by.name), phone: str(by.phone), email: str(by.email) } : null;
    // The photos and PDFs a page can name, the cover's camera stamp, and the start day for At a glance.
    const files: NonNullable<DocVM["files"]> = {};
    for (const f of [...b.photos, ...(b.pdfs ?? [])]) if (f.url) files[f.id] = { url: f.url, name: f.name ?? "File" };
    const cov = b.photos.find((f) => f.id === (snap ? snap.cover_file_id : p.cover_file_id));
    const coverStamp = cov ? stampText(cov.taken_at, cov.lat, cov.lng) : null;
    const st = str(b.job.scheduled_start);
    const startLabel = st ? new Date(`${st.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }) : null;
    const extra = { files, coverStamp, startLabel };
    if (snap) {
      const coverUrl = b.photos.find((f) => f.id === snap.cover_file_id)?.url ?? null;
      return {
        number: snap.number, date: snap.made_at, readOnly: true, typeKey: p.project_type, typeLabel: type?.label ?? "",
        org, preparedBy, customer, job: { title: snap.job.title, address: snap.job.address, description: null }, coverUrl,
        scopeIntro: snap.scope_intro, areas: areasOf(snap.sections), visuals: areaVisuals(plans, snap.sections.map((x) => String(x.id))), priced: snap.price, display: snap.display, draws: snap.draws,
        choices: snap.choices ?? null,
        check: snap.choices ? { sum: 100, gap: 0, ok: true, pct: 100 } : snap.price.ok ? drawsCheck(snap.draws, snap.price.total) : null,
        warranty: { ...snap.warranty_text, template: snap.warranty_text.template?.name ?? null },
        terms: { ...snap.terms_text, template: snap.terms_text.template?.name ?? null }, typeDraws: [], ...extra,
      };
    }
    const w = warrantyText(p.warranty, b.templates, orgName);
    const t = termsText(p.terms, b.templates, orgName);
    return {
      number: b.number_base ? formatProposalNumber(b.number_base, p.version) : `v${p.version}`, date: new Date().toISOString(), readOnly: false,
      typeKey: p.project_type, typeLabel: type?.label ?? "", org, preparedBy, customer,
      job: { title: b.job.title, address: b.job.address, description: b.job.description },
      coverUrl: b.photos.find((f) => f.id === p.cover_file_id)?.url ?? null,
      scopeIntro: p.scope_intro, areas: areasOf(b.sections), visuals: areaVisuals(plans, b.sections.map((x) => x.id)), priced: priced!.priced, display: p.display ?? {}, draws: p.draws ?? [],
      choices: picks ? { list: picks.choices, shared: picks.shared } : null,
      check: picks ? picks.check : priced!.check, warranty: { ...w, template: w.template?.name ?? null }, terms: { ...t, template: t.template?.name ?? null },
      typeDraws: type?.draws ?? [], ...extra,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- logo() reads b.org only
  }, [b, p, priced, picks, finalShown, isFinal, type, orgName, plans]);

  // The emblem beside each part Dusty can edit opens him with a starter question; "Use this" under the
  // boxed words of his answer brings only those back here (Coy, 2026-10-10; src/lib/dusty/use-block.ts).
  const dusty = useCallback((kind: "warranty" | "terms" | "scope" | "area" | "page", areaId?: string) => {
    if (!vm) return;
    if (kind === "page") {
      // A text page of the owner's own: Dusty rewrites (or writes) it; Use this puts his words in.
      const pg = pagesOf(p?.display).find((x) => x.id === areaId);
      if (!pg) return;
      const ask = `Write the "${pg.label}" page of this proposal for the customer, in plain words. Use "# " for a heading and "- " for a bullet. No prices.${pg.body?.trim() ? `\n\nWhat it says now:\n${pg.body}` : ""}`;
      setDustyUse({
        label: `on the "${pg.label}" page`,
        apply: (text) => {
          const body = text.replace(/\r/g, "").replace(/^\s*[*•]\s+/gm, "- ").trim();
          if (!body) return false;
          setP((x) => {
            if (!x) return x;
            const display = { ...x.display, pages: patchPage(pagesOf(x.display), pg.id, { body }) };
            save("display", display, 0);
            return { ...x, display };
          });
        },
      });
      window.dispatchEvent(new Event("sc:dusty-open"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `${ask}\n\n${USE_ASK}`, send: true } })), 250);
      return;
    }
    const area = kind === "area" ? vm.areas.find((a) => a.id === areaId) : undefined;
    if (kind === "area" && !area) return;
    const areaName = area ? area.name || area.work_type || "this area" : "";
    const ask = kind === "warranty"
      ? `Rewrite this warranty in plain English for a ${vm.typeLabel.toLowerCase() || "residential"} customer. Keep what it covers and excludes; don't add promises.\n\n${vm.warranty.title}\n${vm.warranty.body}`
      : kind === "terms"
        ? `Tighten these terms for a ${vm.typeLabel.toLowerCase() || "residential"} job. Answer as a numbered list, each item "**Heading:** text".\n\n${vm.terms.clauses.map((c, i) => `${i + 1}. ${c.h}: ${c.b}`).join("\n")}`
        : kind === "area"
          ? sowQuestion(areaName, area!.scope)
          : `Write a two-sentence scope introduction for this proposal, for the customer, from the job's areas. No prices.${vm.scopeIntro ? `\n\nWhat it says now:\n${vm.scopeIntro}` : ""}`;
    setDustyUse({
      label: kind === "warranty" ? "in the warranty" : kind === "terms" ? "as the terms" : kind === "area" ? `as ${areaName}'s scope of work` : "as the scope intro",
      apply: (text) => {
        if (kind === "warranty") change("warranty", { ...p?.warranty, title: vm.warranty.title, body: plainText(text) });
        else if (kind === "terms") { const c = parseClauses(text); if (!c.length) return false; change("terms", { ...p?.terms, clauses: c }); }
        else if (kind === "area") {
          const v = sowFromAnswer(text); if (!v || !area) return false;
          setB((x) => (x ? { ...x, sections: x.sections.map((y) => (String(y.id) === area.id ? { ...y, prep_notes: v } : y)) } : x));
          call(`/api/jobs/${jobId}/sections/${area.id}`, "PATCH", { prep_notes: v }).catch((e) => setErr(`The scope of work wasn't saved: ${e instanceof Error ? e.message : String(e)}`));
        }
        else change("scope_intro", plainText(text));
      },
    });
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `${ask}\n\n${USE_ASK}`, send: true } })), 250);
  }, [vm, p, change, jobId, save]);
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

  // Start over (Coy, 2026-10-11: "delete or void proposals and start from scratch"): a blank draft from
  // the job's type, every unsigned customer link turned off. Sent versions stay in the list.
  const startOver = useCallback(async () => {
    if (!window.confirm("Start this proposal over? You get a blank draft from the job's type defaults. Every customer link that wasn't signed is turned off, so it shows as replaced. Sent versions stay in the version list.")) return;
    try { setBusy("Starting over…"); await call(`/api/jobs/${jobId}/proposal/new-version`, "POST", { fresh: true }); setViewFinal(null); await load(); await loadLinks(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [jobId, load, loadLinks]);

  // Delete a version (Coy, 2026-10-12: "How do I delete proposals?"). A draft over an earlier version goes;
  // a sent version is marked deleted and its customer link turned off; a signed one stays (the route says why).
  const deleteVersion = useCallback(async (version: number, sent: boolean) => {
    const q = sent
      ? "Delete this sent version? It leaves the version list and the customer's link to it is turned off, so it shows as replaced. Its number isn't reused."
      : "Delete this draft? The page goes back to the last sent version.";
    if (!window.confirm(q)) return;
    try { setBusy("Deleting…"); await call(`/api/jobs/${jobId}/proposal/version?version=${version}`, "DELETE"); setViewFinal(null); await load(); await loadLinks(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, [jobId, load, loadLinks]);

  if (err && !b) return <div style={{ padding: 20, color: T.red }}>{err}</div>;
  if (!b || !p || !vm || !priced) return <div style={{ padding: 20, color: T.ink3 }}>Opening the proposal…</div>;
  const numberOf = (v: number) => (b.number_base ? formatProposalNumber(b.number_base, v) : `v${v}`);
  const shownNumber = b.number_base ? numberOf(finalShown?.version ?? p.version) : vm.number;

  const editable = !isFinal && !finalShown;
  // Why it can't be sent yet, in words (the old "Fix the budget first" button is gone — Coy, 2026-10-03).
  const stuckChoice = vm.choices?.list.find((c) => c.total === null);
  const blocked = vm.choices
    ? stuckChoice ? `${stuckChoice.label} has no price yet: ${stuckChoice.blocked}` : vm.check && !vm.check.ok ? "with every option offered, the draws must be percentages that add up to 100%" : null
    : !vm.priced.ok ? `the budget has no price yet: ${vm.priced.blocked[0] ?? ""}` : vm.check && !vm.check.ok ? "the draws don't add up to the total" : null;
  const d = vm.display;
  // ── The builder's list: every change saved on the draft, with its words for the undo toast.
  const pages = pagesOf(p.display);
  const shownPages = pagesOf(vm.display);
  const open = (editable ? pages : shownPages).find((x) => x.id === openId)?.id ?? (editable ? pages : shownPages)[0]?.id ?? null;
  const openPage = (editable ? pages : shownPages).find((x) => x.id === open) ?? null;
  const usedFiles = new Set(pages.flatMap((x) => [...(x.photos ?? []).map((f) => f.id), ...(x.file ? [x.file] : [])]));
  const goTo = (id: string) => { setOpenId(id); if (!wide) setListOpen(false); document.querySelector(".sc-doc-scroll")?.scrollTo({ top: 0 }); };
  const addPick = (pick: AddPick) => {
    setAddAt(false);
    const page = pageFromPick(pick, pages);
    pagesChange(`Added "${page.label}"`, pages, insertAfter(pages, open, page), page.id);
    if (pick.then === "photos") setPicker({ kind: "photos", pageId: page.id });
    if (pick.then === "pdf") setPicker({ kind: "pdf", pageId: page.id });
    if (pick.then === "upload") { setUploadFor(page.id); setTimeout(() => uploadRef.current?.click(), 0); }
  };
  const addPhotosTo = (pageId: string, ids: string[]) => {
    const pg = pages.find((x) => x.id === pageId);
    if (!pg || !ids.length) return;
    const have = new Set((pg.photos ?? []).map((f) => f.id));
    const photos = [...(pg.photos ?? []), ...ids.filter((id) => !have.has(id)).map((id) => ({ id }))].slice(0, 24);
    pagesChange(`Added ${ids.length} ${ids.length === 1 ? "photo" : "photos"} to "${pg.label}"`, pages, patchPage(pages, pageId, { photos }));
  };
  const setPdf = (pageId: string, fileId: string, name: string | null) => {
    const pg = pages.find((x) => x.id === pageId);
    if (!pg) return;
    const label = !pg.label || /^attached document$/i.test(pg.label) ? (name ?? "Attached document").replace(/\.pdf$/i, "").slice(0, 80) : pg.label;
    pagesChange(`Attached ${name ?? "the file"}`, pages, patchPage(pages, pageId, { file: fileId, label, skip: undefined }));
  };
  // Pull in: a photo goes on the open photos page, else a new Photos page after the open one; a PDF is a page of its own.
  const pullPhoto = (id: string) => {
    if (openPage?.kind === "photos") return addPhotosTo(openPage.id, [id]);
    const page = pageFromPick({ kind: "photos" }, pages);
    const withPhoto = { ...page, photos: [{ id }] };
    pagesChange(`Added a Photos page`, pages, insertAfter(pages, open, withPhoto), page.id);
  };
  const pullPdf = (id: string) => {
    const f = b.pdfs?.find((x) => x.id === id);
    const page = { ...pageFromPick({ kind: "pdf" }, pages), file: id, label: (f?.name ?? "Attached document").replace(/\.pdf$/i, "").slice(0, 80) };
    pagesChange(`Added "${page.label}"`, pages, insertAfter(pages, open, page), page.id);
  };
  const uploadPdf = async (file: File) => {
    const pageId = uploadFor;
    setUploadFor(null);
    if (!pageId) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { setErr("That isn't a PDF."); return; }
    try {
      setBusy(`Uploading ${file.name}… 0%`);
      const made = await call("/api/files", "POST", { name: file.name, mime: "application/pdf", size: file.size, job_id: jobId, category: "other" });
      await sendBytes(made.upload.signed_url, file, (pct) => setBusy(`Uploading ${file.name}… ${pct}%`));
      await call(`/api/files/${made.file.id}/done`, "POST");
      const fresh = (await call(`/api/jobs/${jobId}/proposal`, "GET")) as Bundle;
      setB((x) => (x ? { ...x, pdfs: fresh.pdfs, photos: fresh.photos } : x));
      setPdf(pageId, made.file.id as string, file.name);
    } catch (e) { setErr(`The PDF wasn't uploaded: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  };
  // Before sending: what to look at (Proposal Builder v2's check). Nothing in it blocks; Send anyway goes on.
  const toPreview = () => {
    flushSaves();
    if (editable) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const shownLines = vm.priced.ok ? vm.priced.groups.filter((g) => !g.hidden).flatMap((g) => g.items.filter((l) => !l.hidden).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit }))) : [];
      const f = sendCheck({ pages, lines: d.show_qty ? shownLines : [], ifind: d.ifind, valid_until: d.valid_until, today });
      if (f.length) { setFindings(f); return; }
    }
    setPreview(true);
  };
  const edits = editable ? {
    display: (x: ProposalDisplay) => change("display", x, 250),
    draws: (x: Draw[]) => change("draws", x),
    intro: (s: string) => change("scope_intro", s),
    warranty: (w: { title: string; body: string }) => change("warranty", { ...p.warranty, ...w }),
    terms: (c: Clause[]) => change("terms", { ...p.terms, clauses: c }),
    saveTemplate: (k: "warranty" | "terms") => void saveTemplate(k),
    dusty, pickCover: () => setCoverPick(true),
    addIfFind: () => setPicker({ kind: "ifind", pageId: pages.find((x) => x.kind === "ifind")?.id ?? "" }),
    addPhotos: (pageId: string) => setPicker({ kind: "photos", pageId }),
    pickPdf: (pageId: string) => setPicker({ kind: "pdf", pageId }),
    // The area's scope of work is the section's — saved there, so the budget's list follows (Coy, 2026-10-10).
    scope: (sid: string, text: string | null) => {
      setB((x) => (x ? { ...x, sections: x.sections.map((y) => (String(y.id) === sid ? { ...y, prep_notes: text } : y)) } : x));
      call(`/api/jobs/${jobId}/sections/${sid}`, "PATCH", { prep_notes: text }).catch((e) => setErr(`The scope of work wasn't saved: ${e instanceof Error ? e.message : String(e)}`));
    },
  } : null;

  // Coy, 2026-10-05: "The tax button doesn't actually work." With sales tax off on the budget there is no
  // tax to show as a line or fold in, so the chip says so, and a tap turns tax on in the budget.
  const taxOff = b?.estimate?.tax_on === false;
  const taxOn = async () => {
    if (!editable) return;
    try { setBusy("Turning sales tax on…"); await call(`/api/jobs/${jobId}/budget`, "PATCH", { tax_on: true }); if (!d.show_tax_line) edits?.display({ ...d, show_tax_line: true }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const quick = (k: "preliminary" | "show_item_prices" | "show_qty" | "show_tax_line" | "hide_area_pics") =>
    k === "show_tax_line" && taxOff ? void taxOn() : edits?.display({ ...d, [k]: !d[k] });
  // "Maps & photos" is on unless switched off (hide_area_pics), the others off unless switched on.
  const chips = ([["preliminary", "Preliminary"], ["show_item_prices", "Item prices"], ["show_qty", "Qty · unit"], ["show_tax_line", "Tax line"], ["hide_area_pics", "Maps & photos"]] as const).map(([k, l]) => {
    let label: string = l;
    const on = k === "hide_area_pics" ? !d[k] : !!d[k] && !(k === "show_tax_line" && taxOff);
    if (k === "show_tax_line" && taxOff) label = "Tax · off in the budget";
    return (
      <button key={k} onClick={() => quick(k)} aria-pressed={on} className="rounded-full shrink-0"
        title={k === "preliminary" ? (on ? "Marked a preliminary estimate. Tap to make it a firm quote." : "Tap to mark this a preliminary estimate — the final price after a site visit.") : k === "show_tax_line" ? (taxOff ? "Sales tax is off on this job's budget, so there is no tax to show. Tap to turn it on." : on ? "Tax shows as its own line. Tap to fold it into the prices." : "Tax is folded into the prices. Tap to show it as its own line.") : undefined}
        style={{ height: 26, padding: "0 10px", fontSize: 11.5, border: `1px solid ${on ? "#B85A3C" : T.hair}`, background: on ? "#F6E2D8" : T.card, color: on ? "#9A4527" : T.ink2 }}>{label}</button>
    );
  });
  // The proposal's own buttons (Coy, 2026-10-05): beside Project type, Warranty and Contract on a
  // desktop; their own row under the header on a phone.
  // The newest version already went out: the same button resends it (Coy, 2026-10-11).
  // An older final picked in the version list is sent from the same page, on its own link (Coy, 2026-10-11:
  // "I should still be able to copy a link and resend a proposal that was frozen").
  const sendVersion = finalShown?.version ?? p.version;
  const sentNow = !editable && links.some((l) => !l.revoked_at && l.status !== "void" && l.version?.version === sendVersion && !!l.sent_at);
  const actions = (
    <>
          {b.finals.length > 0 && (
            <select aria-label="Version" value={viewFinal ?? ""} onChange={(e) => setViewFinal(e.target.value ? Number(e.target.value) : null)}
              style={{ height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12 }}>
              <option value="">{isFinal ? `${numberOf(p.version)} (latest, final)` : `${numberOf(p.version)} draft`}</option>
              {b.finals.filter((f) => f.version !== p.version).map((f) => <option key={f.id} value={f.version}>{numberOf(f.version)} final · {new Date(f.finalized_at).toLocaleDateString()}</option>)}
            </select>
          )}
          {(!blocked || !editable) && (
            <button onClick={() => { setPrinting(true); setTimeout(() => window.print(), 900); }} title="Print, or Save as PDF from the print dialog" className="rounded"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>
              {wide ? "Print / PDF" : "PDF"}
            </button>
          )}
            <button onClick={toPreview} disabled={!!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", background: "#B85A3C", color: "#fff", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{sentNow ? (wide ? "Preview & resend" : "Resend") : wide ? "Preview & send" : "Send"}</button>
          {/* Copy the link to send it yourself (Coy, 2026-10-07). With no link for this version yet, the
              Preview makes one — sending or copying there freezes a draft first. */}
            <button onClick={() => {
              const live = links.find((l) => !l.revoked_at && l.status !== "void" && l.version?.version === sendVersion);
              if (live && !editable) {
                void navigator.clipboard.writeText(live.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {});
                void call(`/api/proposal-links/${live.id}`, "PATCH", { sent: "copy" }).then(loadLinks).catch(() => {});
              } else { flushSaves(); setPreview(true); }
            }} disabled={!!busy} className="rounded" title="Copy the customer's link to paste anywhere"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{copied ? "Copied ✓" : "Copy link"}</button>
          {!editable && !finalShown && (
            <button onClick={() => void newVersion()} disabled={!!busy} className="rounded"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{wide ? "New version" : "New ver."}</button>
          )}
          {!finalShown && (
            <button onClick={() => void startOver()} disabled={!!busy} className="rounded" title="Void the sent links and start a blank proposal"
              style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.red, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{wide ? "Start over" : "Redo"}</button>
          )}
          {(() => {
            // The version on screen: a draft only over an earlier version (a lone draft has Start over),
            // a final unless the customer signed it.
            const v = finalShown?.version ?? p.version;
            const signed = links.some((l) => l.version?.version === v && l.status === "accepted");
            const can = editable ? b.finals.some((f) => f.version < p.version) : !signed;
            return can ? (
              <button onClick={() => void deleteVersion(v, !editable)} disabled={!!busy} className="rounded" title={editable ? "Delete this draft" : "Delete this sent version"}
                style={{ height: 30, padding: "0 12px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.red, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Delete</button>
            ) : null;
          })()}
    </>
  );
  // What used to be the slide-over "Job panel" (Coy, 2026-10-02): the money — margin, cost by type, the
  // sub split — lives on the job's Budget now; what shapes the DOCUMENT stays here, as one strip.
  const settings = (
    <ProposalSettings b={b} p={p} editable={editable} onType={setType}
      extra={wide ? <>{editable && chips}{actions}</> : null}
      onWarrantyTpl={(id) => change("warranty", { template_id: id }, 0)} onTermsTpl={(id) => change("terms", { template_id: id }, 0)} />
  );
  const ok = vm.priced.ok ? vm.priced : null;

  return (
    <div ref={wideRef} className="sc-proposal flex" style={{ minHeight: "calc(100dvh - var(--sc-head))", background: "var(--sc-doc-ground, #E9E4DA)" }}>
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* The job's name top left, Plan room · Budget · Proposal top right — the same row on all three
            views (Coy, 2026-10-05); the proposal's own buttons moved down beside its settings. */}
        <div className="sc-no-print" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "8px 12px 6px", position: "sticky", top: "var(--sc-head)", zIndex: 5 }}>
          {/* Nothing under the name (Coy, 2026-10-05: "all of the lines and words directly below the job
              name and small font … we can add to the summary page"): the number, draft / final, the price
              and the link's state sit on the settings row below, and on the job's Summary. */}
          <JobHeaderRow jobId={jobId} active="proposal" title={b.job.title || "Proposal"} customerId={typeof b.job.customer_id === "string" ? b.job.customer_id : null} />
        </div>
        <div className="sc-no-print" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ padding: "6px 12px 0", fontSize: 11.5, color: T.ink3, overflowWrap: "anywhere" }}>
            {/* The number in SE-26-0001-A form (src/lib/proposal-number.ts); a final frozen under the old
                "P-3" says what the customer was shown. */}
            <b style={{ color: T.ink2 }}>{shownNumber}{isFinal || finalShown ? " · final" : " · draft"}</b>
            {shownNumber !== vm.number && <>{" · "}sent as {vm.number}</>}
            {" · "}{vm.choices ? `${vm.choices.list.length} options · ${vm.choices.list.map((c) => `${c.label} ${c.total !== null ? usd0(c.total) : "—"}`).join(" · ")}`
              : ok ? `${usd(ok.total)}${ok.rounded !== ok.calc ? ` (${usd(ok.rounded)} rounded up from ${usd(ok.calc)}${ok.tax ? `, plus ${usd(ok.tax)} tax` : ""})` : ""}` : `no price yet${!vm.priced.ok ? ` — ${vm.priced.blocked[0]}` : ""}`}
            {/* Opened: a dated list of every opening drops down here (Coy, 2026-10-23), as on the Summary. */}
            {opens > 0 && <>{" · "}<button onClick={() => setShowOpens((x) => !x)} aria-expanded={showOpens}
              style={{ background: "none", border: "none", padding: 0, color: T.green, fontSize: "inherit", cursor: "pointer", textDecoration: "underline" }}>
              opened {opens === 1 ? "once" : `${opens} times`}{msgCount ? ` · ${msgCount} message${msgCount === 1 ? "" : "s"}` : ""} {showOpens ? "▴" : "▾"}</button></>}
          </div>
          {showOpens && <div style={{ padding: "6px 12px 4px", maxHeight: 280, overflowY: "auto" }}><ProposalOpenings links={links} first={12} /></div>}
          {!wide && <div className="flex items-center gap-2 flex-wrap" style={{ padding: "6px 12px 0" }}>{actions}</div>}
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
        <div className="flex flex-1" style={{ minHeight: 0 }}>
          {/* The page list (Proposal Builder v2): a column on a desktop, a fold above the page on a phone. */}
          {wide && (
            <div className="sc-no-print shrink-0" style={{ width: 248, borderRight: `1px solid ${T.hair}`, background: T.card, position: "sticky", top: "var(--sc-head)", alignSelf: "flex-start", maxHeight: "calc(100dvh - var(--sc-head))", overflowY: "auto" }}>
              <div className="flex items-center" style={{ padding: "10px 12px 6px" }}>
                <span style={lbl}>Pages · {(editable ? pages : shownPages).length}</span>
                <span className="flex-1" />
                {editable && <button onClick={() => setPull((x) => !x)} style={{ fontSize: 12, fontWeight: 600, color: T.chalk }}>{pull ? "Close Pull in" : "Pull in ›"}</button>}
              </div>
              <div ref={addRef} className="relative">
                <PageColumn pages={editable ? pages : shownPages} openId={open} onOpen={goTo} editable={editable} change={pagesChange}
                  onAdd={() => setAddAt(true)} onSaveTemplate={() => setToast({ text: "Page templates wait on a database change — ask for it when you want them." })} />
                {addAt && openPage && (
                  <AddPageMenu after={openPage.label || "this page"} pages={pages} hasPhotos={b.photos.length > 0} hasPdfs={(b.pdfs ?? []).length > 0}
                    onPick={addPick} onClose={() => setAddAt(false)} style={{ left: 8, bottom: 40 }} />
                )}
              </div>
            </div>
          )}
          <div className="sc-doc-scroll flex-1" style={{ minWidth: 0, padding: wide ? "20px 20px 60px" : "10px 8px 80px" }}>
            {editable && !wide && <div className="sc-no-print flex gap-1.5 overflow-x-auto" style={{ marginBottom: 8 }}>{chips}</div>}
            {!wide && (
              <div className="sc-no-print relative" style={{ maxWidth: 720, margin: "0 auto 8px", background: T.card, border: `1px solid ${T.hair}`, borderRadius: 6 }}>
                <button onClick={() => setListOpen((x) => !x)} aria-expanded={listOpen} className="w-full flex items-center gap-2 text-left" style={{ height: 40, padding: "0 12px" }}>
                  <span style={lbl}>Page {Math.max(1, (editable ? pages : shownPages).findIndex((x) => x.id === open) + 1)} of {(editable ? pages : shownPages).length}</span>
                  <span className="flex-1 truncate" style={{ fontSize: 13, color: T.ink }}>{openPage?.label}</span>
                  <span style={{ color: T.ink3 }}>{listOpen ? "▴" : "▾"}</span>
                </button>
                {listOpen && (
                  <div className="relative" style={{ borderTop: `1px solid ${T.hair}` }}>
                    <PageColumn pages={editable ? pages : shownPages} openId={open} onOpen={goTo} editable={editable} change={pagesChange}
                      onAdd={() => setAddAt(true)} onSaveTemplate={() => setToast({ text: "Page templates wait on a database change — ask for it when you want them." })} />
                    {editable && <button onClick={() => { setPull(true); setListOpen(false); }} style={{ display: "block", padding: "8px 12px", fontSize: 12.5, fontWeight: 600, color: T.chalk }}>Pull in from the job ›</button>}
                    {addAt && openPage && (
                      <AddPageMenu after={openPage.label || "this page"} pages={pages} hasPhotos={b.photos.length > 0} hasPdfs={(b.pdfs ?? []).length > 0}
                        onPick={addPick} onClose={() => setAddAt(false)} style={{ left: 0, right: 0, top: 40 }} />
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="sc-no-print">
              {openPage && <EditorHead page={openPage} editable={editable} who={vm.customer.person ?? vm.customer.name ?? "The customer"}
                onRename={(v) => pagesChange(`Renamed "${openPage.label}"`, pages, patchPage(pages, openPage.id, { label: v.slice(0, 80) }))}
                onSwitchOn={() => pagesChange(`Switched on "${openPage.label}"`, pages, patchPage(pages, openPage.id, { off: undefined }))}
                onSwitchOff={() => pagesChange(`Switched off "${openPage.label}"`, pages, patchPage(pages, openPage.id, { off: true }))}
                sections={(PARTS[openPage.kind] ?? []).map((x) => ({ ...x, off: partOff(openPage, x.key, d.off) }))}
                onPart={(key, on) => pagesChange(`${on ? "Showed" : "Hid"} ${(PARTS[openPage.kind] ?? []).find((x) => x.key === key)?.label ?? key} on "${openPage.label}"`, pages, togglePart(pages, openPage.id, key, on, d.off))} />}
              <ProposalDocument vm={vm} edits={edits} narrow={!wide} only={open ?? undefined} />
              {open && (() => {
                const list = editable ? pages : shownPages, i = list.findIndex((x) => x.id === open);
                return (
                  <div className="flex items-center" style={{ maxWidth: 720, margin: "10px auto 0", fontSize: 12.5 }}>
                    {i > 0 && <button onClick={() => goTo(list[i - 1].id)} style={{ color: T.chalk }}>‹ {list[i - 1].label}</button>}
                    <span className="flex-1" />
                    {i < list.length - 1 && <button onClick={() => goTo(list[i + 1].id)} style={{ color: T.chalk }}>{list[i + 1].label} ›</button>}
                  </div>
                );
              })()}
            </div>
            {printing && <div className="sc-print-block"><ProposalDocument vm={vm} edits={null} narrow={false} /></div>}
          </div>
          {pull && editable && (
            <div className="sc-no-print shrink-0" style={wide
              ? { width: 320, borderLeft: `1px solid ${T.hair}`, background: T.card, position: "sticky", top: "var(--sc-head)", alignSelf: "flex-start", height: "calc(100dvh - var(--sc-head))" }
              : { position: "fixed", inset: "var(--sc-head) 0 var(--sc-foot, 0px) 0", zIndex: 40, background: T.card }}>
              <PullIn photos={b.photos.map((f) => ({ id: f.id, name: f.name, url: f.url, when: f.taken_at ? new Date(f.taken_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }) : null }))}
                pdfs={(b.pdfs ?? []).map((f) => ({ id: f.id, name: f.name, category: f.category }))}
                areas={vm.areas.map((a) => a.name || a.work_type || "Area")} used={usedFiles}
                onPhoto={pullPhoto} onPdf={pullPdf} onClose={() => setPull(false)} budgetHref={`/dashboard/scope/${jobId}`} />
            </div>
          )}
        </div>
      </div>
      <input ref={uploadRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPdf(f); else setUploadFor(null); }} />
      {picker?.kind === "photos" && (
        <PhotoPicker photos={b.photos} have={new Set((pages.find((x) => x.id === picker.pageId)?.photos ?? []).map((f) => f.id))}
          onAdd={(ids) => { addPhotosTo(picker.pageId, ids); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
      {picker?.kind === "pdf" && (
        <Modal title="Pick a PDF" onClose={() => setPicker(null)}
          foot={<button onClick={() => { setUploadFor(picker.pageId); setPicker(null); setTimeout(() => uploadRef.current?.click(), 0); }} className="rounded" style={{ height: 32, padding: "0 12px", border: `1px solid ${T.hairStrong}`, fontSize: 13, color: T.ink }}>↑ Upload a PDF</button>}>
          {!(b.pdfs ?? []).length && <div style={{ fontSize: 13, color: T.ink3 }}>No PDFs on this job yet. Upload one — it is saved to the job&apos;s files.</div>}
          {(b.pdfs ?? []).map((f) => (
            <button key={f.id} onClick={() => { setPdf(picker.pageId, f.id, f.name); setPicker(null); }} className="w-full flex items-center gap-2 text-left hover:bg-black/5" style={{ padding: "9px 4px", borderBottom: `1px solid ${T.hairSoft}` }}>
              <span className="flex-1 truncate" style={{ fontSize: 13, color: T.ink }}>{f.name ?? "File"}</span>
              <span style={{ fontSize: 11.5, color: T.ink3 }}>{f.category === "vendor_quote" ? "Vendor quote" : f.category === "bid" ? "Bid" : ""}{f.bytes ? ` · ${(f.bytes / 1048576).toFixed(1)} MB` : ""}</span>
            </button>
          ))}
        </Modal>
      )}
      {picker?.kind === "ifind" && (
        <IfFindPicker overhead={b.settings.overhead_pct} margin={margin} have={new Set((d.ifind ?? []).map((l) => l.item_id).filter(Boolean) as string[])}
          onAdd={(line) => {
            const taken = (d.ifind ?? []).map((l) => l.id);
            edits?.display({ ...d, ifind: [...(d.ifind ?? []), { ...line, id: newPageId(taken) }].slice(0, 30) });
          }} onClose={() => setPicker(null)} />
      )}
      {findings && (
        <SendCheck findings={findings} label={(id) => (id ? pages.find((x) => x.id === id)?.label ?? "" : "At a glance")}
          onGo={(id) => { setFindings(null); goTo(id); }} onSend={() => { setFindings(null); setPreview(true); }} onClose={() => setFindings(null)} />
      )}
      {toast && <UndoToast text={toast.text} onUndo={toast.undo} onDone={() => setToast(null)} />}

      {preview && (
        <ProposalPreview jobId={jobId} vm={vm} draft={editable} version={sendVersion} blocked={editable ? blocked : null} coverFileId={finalShown ? undefined : p.cover_file_id}
          onOpenVersion={(v) => { setPreview(false); setViewFinal(v === p.version ? null : v); }}
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

/** What shapes the document: the project type (loads its defaults) and the warranty and contract. */
function ProposalSettings({ b, p, editable, onType, onWarrantyTpl, onTermsTpl, extra }: {
  b: Bundle; p: Prop; editable: boolean; extra?: React.ReactNode;
  onType: (k: string) => void;
  onWarrantyTpl: (id: string | null) => void; onTermsTpl: (id: string | null) => void;
}) {
  const forType = (kind: "warranty" | "terms") => b.templates.filter((t) => t.kind === kind && (!p.project_type || !t.project_types.length || t.project_types.includes(p.project_type)));
  const sel: React.CSSProperties = { height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12, maxWidth: 220 };
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2" style={{ padding: "8px 12px", color: T.ink, fontSize: 12 }}>
      {editable && b.job.job_type && p.project_type !== b.job.job_type && b.types.some((t) => t.key === b.job.job_type) && (
        <button onClick={() => onType(b.job.job_type as string)} style={{ alignSelf: "center", fontSize: 12, color: T.chalk }}>
          Load the {b.types.find((t) => t.key === b.job.job_type)?.label} defaults (the job&apos;s type)
        </button>
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
      <Link href="/dashboard/settings/templates" style={{ alignSelf: "center", fontSize: 12, color: T.chalk }}>Edit templates ›</Link>
      {extra && <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{extra}</div>}
    </div>
  );
}

/** The job's photos to put on a photos page, several at once. */
function PhotoPicker({ photos, have, onAdd, onClose }: {
  photos: Bundle["photos"]; have: Set<string>; onAdd: (ids: string[]) => void; onClose: () => void;
}) {
  const [pick, setPick] = useState<string[]>([]);
  const list = photos.filter((f) => f.url);
  return (
    <Modal title="Add photos" onClose={onClose} width={640}
      foot={<button disabled={!pick.length} onClick={() => onAdd(pick)} className="rounded" style={{ height: 32, padding: "0 14px", background: pick.length ? T.hiviz : T.sunk, color: pick.length ? T.onHiviz : T.ink3, fontWeight: 600, fontSize: 13 }}>
        {pick.length ? `Add ${pick.length} ${pick.length === 1 ? "photo" : "photos"}` : "Pick photos"}</button>}>
      {!list.length && <div style={{ fontSize: 13, color: T.ink3 }}>No photos on this job yet — each area on the job page has Photos, and the Camera files shots on the job.</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {list.map((f) => {
          const on = pick.includes(f.id), had = have.has(f.id);
          return (
            <button key={f.id} disabled={had} onClick={() => setPick((x) => (on ? x.filter((y) => y !== f.id) : [...x, f.id]))} title={f.name ?? ""} aria-pressed={on}
              className="relative" style={{ aspectRatio: "4/3", background: `#ddd url("${f.url}") center/cover`, borderRadius: 4, border: on ? `3px solid ${T.hiviz}` : `1px solid ${T.hair}`, opacity: had ? 0.4 : 1 }}>
              {(on || had) && <span style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: had ? T.ink3 : T.hiviz, color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** If we find…: a Price book item at its price to the customer (the job's O.H. and margin), never in the total. */
function IfFindPicker({ overhead, margin, have, onAdd, onClose }: {
  overhead: number | null; margin: number | null; have: Set<string>;
  onAdd: (line: { item_id: string; name: string; unit: string; sell: number }) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; name: string; unit: string | null; unit_cost: number | null }> | null>(null);
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => {
    let off = false;
    call("/api/cost-items", "GET").then((d) => { if (!off) setItems(((d.items ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), unit: str(r.unit), unit_cost: n(r.unit_cost) }))); })
      .catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (items ?? []).filter((i) => words.every((w) => i.name.toLowerCase().includes(w))).slice(0, 60);
  return (
    <Modal title="If we find… — from the Price book" onClose={onClose} width={560}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Price book" aria-label="Search the Price book"
        style={{ width: "100%", height: 34, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: 14, background: T.card, color: T.ink, marginBottom: 6 }} />
      {(overhead === null || margin === null) && <div style={{ fontSize: 12, color: T.red, marginBottom: 6 }}>The job has no O.H. or margin yet, so there&apos;s no price to show. Set them on the Budget.</div>}
      {items === null && <div style={{ fontSize: 13, color: T.ink3 }}>Opening the Price book…</div>}
      {shown.map((i) => {
        const sell = i.unit_cost !== null ? sellOf(i.unit_cost, overhead, margin) : null;
        const done = have.has(i.id) || added.has(i.id);
        return (
          <div key={i.id} className="flex items-center gap-2" style={{ padding: "7px 0", borderBottom: `1px solid ${T.hairSoft}` }}>
            <span className="flex-1 min-w-0" style={{ fontSize: 13, color: T.ink }}>{i.name}</span>
            <span style={{ fontSize: 12.5, color: T.ink2, whiteSpace: "nowrap" }}>{sell !== null ? `${usd(sell)} / ${i.unit || "each"}` : i.unit_cost === null ? "no price" : "—"}</span>
            <button disabled={done || sell === null} onClick={() => { onAdd({ item_id: i.id, name: i.name, unit: i.unit ?? "", sell: sell! }); setAdded((x) => new Set(x).add(i.id)); }}
              style={{ width: 54, fontSize: 12.5, fontWeight: 600, color: done ? T.green : sell === null ? T.ink3 : T.chalk }}>{done ? "Added" : "+ Add"}</button>
          </div>
        );
      })}
      {items && !shown.length && <div style={{ fontSize: 13, color: T.ink3 }}>Nothing in the Price book by that name.</div>}
    </Modal>
  );
}
