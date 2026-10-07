"use client";

/**
 * Draft budget (migration 087, Coy's handoff 2026-10-07: "It is easier to
 * approve a budget than build one in the field"). On the job's Budget, above
 * its areas: Build draft budget reads the job's own calls, texts and notes,
 * adds the areas they describe (each with the line it came from) and Coy's
 * assembly fills them. What it couldn't tell becomes a question to ask; the
 * driveway recipe is checked against the budget as it is now; an unpriced
 * line makes the total partial; Approve saves a copy and sends nothing.
 *
 * Several budgets (migration 088, Coy 2026-10-07): the open one is named and
 * kept, Build draft budget builds a NEW one beside it, and Budgets ▾ opens
 * any of them.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, clip, nums, money0 } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";

interface BudgetRow { id: string; name: string | null; open: boolean; lines: number; total: number | null; partial: boolean; updated_at: string }
interface Budgets { ready: boolean; error?: string; budgets?: BudgetRow[]; suggest?: { open: string; next: string } }

interface Fact { key: string; value: number | string | boolean; approximate: boolean; status: string; quote: string; at: string; message_id: string | null }
interface Area { key: string; name: string; work_type: string; length_ft: number | null; width_ft: number | null; sqft: number | null; depth_in: number | null; facts: Fact[]
  on_job?: { section_id: string; section: string; sqft: number | null; depth_in: number | null } }
interface Reading {
  kind: string; kind_reason: string; areas: Area[]; existing_depth: Fact | null; demo: Fact | null
  conflicts: Array<{ what: string; facts: Fact[] }>; questions: string[]; scope?: string; evidence_count?: number
}
interface Run {
  id: string; status: string; outcome: string | null; reader: string | null; reading: Reading | null; error: string | null
  made: { sections: Array<{ id: string; name: string; assembly: string | null; lines: number; existing?: boolean }>; filled?: Array<{ step: string; item: string; lines: number }>; rates?: RateLookup } | null
  suggestions: Array<{ section_id: string; section: string; field: string; current: number | null; heard: number; quote: string }> | null
  created_at: string; finished_at: string | null; trigger: string
}
interface Step { key: string; label: string; state: "covered" | "excluded" | "open"; line_ids: string[]; reason: string | null; by: string | null }
interface Rate { step: string; what: string; low: number; high: number; unit: string; split: string; kind: "installed_price" | "cost"; url: string; site: string; quote: string }
interface RateLookup { place: string; asked_at: string; rates: Rate[]; dropped: number; error: string | null }
interface ItemPick { id: string; name: string; unit: string | null; unit_cost: number | null; group_name: string | null; used: number; covers: string[] }
interface StepPicks { key: string; verdict: "auto" | "choose" | "none"; picks: ItemPick[] }
interface State {
  ready: boolean; error?: string; run: Run | null; steps: Step[]; picks?: Record<string, StepPicks>; sqft?: number | null; blocked_lines: Array<{ id: string; name: string; reasons: string[] }>
  blocks: string[]; totals: { total: number; cost: number; partial: boolean } | null
  approval: { id: string; total: number | null; approved_at: string } | null; reader: string; line_names: Record<string, string>
}

const OUTCOME: Record<string, { label: string; tone: string }> = {
  ready_for_review: { label: "Ready for your review", tone: T.green },
  needs_information: { label: "Needs information", tone: T.hiviz },
  manual_review: { label: "Needs you — not a driveway job", tone: T.ink2 },
};
const STATUS: Record<string, string> = { queued: "Waiting to build", running: "Building…", failed: "Stopped" };
const FIELD: Record<string, string> = { length_ft: "length", width_ft: "width", sqft_override: "area", depth_in: "thickness" };
const WHO: Record<string, string> = { customer_stated: "customer", contractor_stated: "you", summary_only: "call summary — check it", recipe_assumed: "recipe" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b?.error || `HTTP ${r.status}`), { body: b });
  return b;
}

function size(a: Area) {
  const parts: string[] = [];
  const j = a.on_job;
  if (a.length_ft !== null && a.width_ft !== null) parts.push(`${a.length_ft} × ${a.width_ft} ft`);
  else if (a.sqft !== null) parts.push(`${a.sqft.toLocaleString()} sq ft`);
  else if (j?.sqft != null) parts.push(`${Math.round(j.sqft).toLocaleString()} sq ft measured on ${j.section}`);
  else parts.push("size not said");
  if (a.depth_in !== null) parts.push(`${a.depth_in}" thick`);
  else if (j?.depth_in != null) parts.push(`${j.depth_in}" on ${j.section}`);
  else parts.push("thickness not said");
  return parts.join(" · ");
}

const each = (p: ItemPick) => p.unit_cost === null ? "no price yet" : `$${p.unit_cost.toLocaleString("en-US", { minimumFractionDigits: p.unit_cost < 100 ? 2 : 0, maximumFractionDigits: 2 })}/${p.unit ?? "ea"}`;
const UNIT_WORD: Record<string, string> = { sf: "sq ft", sy: "sq yd", lf: "lin ft", cy: "cu yd", each: "each", day: "day", ton: "ton", job: "job" };
const UNIT_OF: Record<string, string> = { sf: "SqFt", sy: "SqYd", lf: "LnFt", cy: "CuYd", each: "Each", day: "Days", ton: "Ton", job: "Lump Sum" };
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const range = (r: Rate) => `${usd(r.low)}${r.high !== r.low ? `–${usd(r.high)}` : ""} / ${UNIT_WORD[r.unit] ?? r.unit}`;
const STEP_NEW_NAME: Record<string, string> = {
  demo: "Concrete tear-out", haul: "Haul-off and dumping", base: "Base and grading", forming: "Forming", reinforcement: "Wire mesh",
  concrete: "Ready mix concrete", finishing: "Place and finish labor", equipment: "Equipment rental", mobilization: "Mobilization",
};
const STEP_NEW_UNIT: Record<string, string> = {
  demo: "SqFt", haul: "SqFt", base: "SqFt", forming: "LnFt", reinforcement: "SqFt", concrete: "CuYd", finishing: "SqFt", equipment: "Days", mobilization: "Lump Sum",
};

export function DraftStrip({ jobId, refresh = 0, onChanged }: { jobId: string; refresh?: number; onChanged: () => void }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [bs, setBs] = useState<Budgets | null>(null);
  const [sheet, setSheet] = useState<null | "budgets" | "build">(null);
  const [keepName, setKeepName] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [making, setMaking] = useState<{ step: string; name: string; unit: string; cost: string; source?: string } | null>(null);
  const [open, setOpenState] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("sc:draft-open") !== "0"; } catch { return true; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem("sc:draft-open", v ? "1" : "0"); } catch { /* no storage */ } };

  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budget/draft`, "GET").then((b) => { if (!off) setS(b as State); }).catch((e) => { if (!off) setErr((e as Error).message); });
    return () => { off = true; };
  }, [jobId, tick, refresh]);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budgets`, "GET").then((b) => { if (!off) setBs(b as Budgets); }).catch(() => { if (!off) setBs(null); });
    return () => { off = true; };
  }, [jobId, tick, refresh]);
  // A build started by a new job runs on its own: look again while it is waiting or running.
  const working = s?.run?.status === "queued" || s?.run?.status === "running";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, [working]);

  const act = useCallback(async (what: string, fn: () => Promise<unknown>, changed = false) => {
    setBusy(what); setErr(null);
    try { const b = await fn(); if (b && typeof b === "object" && "ready" in (b as object)) setS(b as State); else setTick((n) => n + 1); if (changed) onChanged(); }
    catch (e) {
      const blocks = (e as { body?: { blocks?: string[] } }).body?.blocks;
      setErr(blocks?.length ? `${(e as Error).message} ${blocks[0]}` : (e as Error).message);
    } finally { setBusy(null); }
  }, [onChanged]);

  if (!s) return err ? <div className="px-3 py-2" style={{ fontSize: F.xs, color: T.red }}>Draft budget: {err}</div> : null;
  if (!s.ready) return (
    <section className="px-3 py-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, marginBottom: 8, fontSize: F.sm, color: T.ink2 }}>
      <span style={{ fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: T.ink }}>Draft budget</span> · {s.error}
    </section>
  );

  const run = s.run;
  const x = run?.reading ?? null;
  const out = run?.status === "done" && run.outcome ? OUTCOME[run.outcome] : null;
  const rows = bs?.ready ? bs.budgets ?? [] : [];
  const openRow = rows.find((b) => b.open) ?? null;
  const openLabel = openRow?.name ?? (rows.length ? "Unnamed budget" : null);
  const rebuild = () => act("build", () => call(`/api/jobs/${jobId}/budget/draft`, "POST"), true);
  // Coy's budget is never written over: with lines on it, a build goes into a new one.
  const build = () => {
    if (bs?.ready && openRow && openRow.lines > 0) {
      setKeepName(openRow.name ?? bs.suggest?.open ?? "Draft 1");
      setNewName(bs.suggest?.next ?? "Draft 2");
      setSheet("build");
      return;
    }
    void act("build", () => call(`/api/jobs/${jobId}/budget/draft`, "POST", bs?.ready ? { new_budget: true, name: bs.suggest?.open ?? "Draft 1" } : undefined), true);
  };
  const buildNew = () => { setSheet(null); void act("build", () => call(`/api/jobs/${jobId}/budget/draft`, "POST", { new_budget: true, name: newName, park_name: keepName }), true); };
  const budgetsAct = (what: string, body: Record<string, unknown>) => act(what, async () => {
    const b = await call(`/api/jobs/${jobId}/budgets`, "POST", body) as Budgets;
    setBs(b); setEditing(null);
    return null;
  }, true);
  const exclude = (step: Step) => {
    const reason = window.prompt(`Why isn't "${step.label}" on this job?`, "");
    if (reason === null) return;
    if (!reason.trim()) { setErr("Say why — it's kept with the budget."); return; }
    void act(`x:${step.key}`, () => call(`/api/jobs/${jobId}/budget/draft`, "PATCH", { step: step.key, reason }));
  };
  const takeHeard = (g: NonNullable<Run["suggestions"]>[number]) =>
    act(`u:${g.section_id}:${g.field}`, () => call(`/api/jobs/${jobId}/sections/${g.section_id}`, "PATCH", { [g.field]: g.heard }), true);
  const takePick = (step: string, p: ItemPick) => act(`p:${step}`, () => call(`/api/jobs/${jobId}/budget/draft`, "PATCH", { step, item_id: p.id }), true);
  const makeItem = () => {
    if (!making) return;
    const m = making;
    void act(`p:${m.step}`, async () => {
      const b = await call(`/api/jobs/${jobId}/budget/draft`, "PATCH", { step: m.step, make: { name: m.name, unit: m.unit, description: m.source ? `Price from the web — check it. ${m.source}`.slice(0, 500) : null, unit_cost: m.cost.trim() === "" ? null : Number(m.cost.replace(/[$,]/g, "")) } });
      setMaking(null);
      return b;
    }, true);
  };
  const lookRates = () => act("rates", () => call(`/api/jobs/${jobId}/budget/draft/rates`, "POST"));
  const takeRate = (r: Rate) => {
    const step = r.step === "job" ? "finishing" : r.step;
    const mid = Math.round(((r.low + r.high) / 2) * 100) / 100;
    setMaking({ step, name: `${STEP_NEW_NAME[step] ?? r.what}`, unit: UNIT_OF[r.unit] ?? "SqFt", cost: String(mid), source: `${r.site}: “${r.quote}”` });
  };
  const makeForm = () => making && (
<form className="flex flex-wrap items-center gap-1.5 w-full" onSubmit={(e) => { e.preventDefault(); makeItem(); }}>
                        <input value={making.name} maxLength={120} onChange={(e) => setMaking({ ...making, name: e.target.value })} aria-label="Item name"
                          className="rounded px-2" style={{ height: 26, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, flex: "1 1 160px", minWidth: 0 }} />
                        <input value={making.unit} maxLength={20} onChange={(e) => setMaking({ ...making, unit: e.target.value })} aria-label="Unit"
                          className="rounded px-2" style={{ height: 26, width: 80, border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />
                        <input value={making.cost} inputMode="decimal" onChange={(e) => setMaking({ ...making, cost: e.target.value })} aria-label="Your cost per unit" placeholder="$ cost"
                          className="rounded px-2" style={{ height: 26, width: 80, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, ...nums }} />
                        <button type="submit" disabled={!!busy || !making.name.trim() || !making.unit.trim()} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Add to Price book and budget</button>
                        <button type="button" onClick={() => setMaking(null)} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Cancel</button>
                      </form>
  );
  const approve = () => act("approve", () => call(`/api/jobs/${jobId}/budget/draft/approve`, "POST"));
  const changedSince = s.approval && s.totals && Math.abs(Number(s.approval.total ?? 0) - s.totals.total) > 0.005;

  return (
    <section style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, marginBottom: 8 }} aria-label="Draft budget">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: open ? `1px solid ${T.hairSoft}` : "none" }}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5" style={{ cursor: "pointer", color: T.ink }}>
          <span aria-hidden="true" style={{ fontSize: 10, color: T.ink3, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Draft budget</span>
        </button>
        <span style={{ fontSize: F.xs, color: run?.status === "failed" ? T.red : out?.tone ?? T.ink3, ...clip, minWidth: 0 }}>
          {!run ? "not built yet" : run.status !== "done" ? STATUS[run.status] : out?.label}
          {s.totals && s.totals.total > 0 ? ` · ${money0(s.totals.total)}${s.totals.partial ? " so far (partial)" : ""}` : ""}
        </span>
        <span className="flex-1" />
        {bs && (bs.ready ? openLabel : true) && (
          <button onClick={() => setSheet("budgets")} className="rounded px-2 flex items-center gap-1" title="Your budgets on this job"
            style={{ height: 28, border: `1px solid ${T.hair}`, color: T.ink, background: T.card, fontWeight: 600, fontSize: F.xs, cursor: "pointer", whiteSpace: "nowrap", maxWidth: 220 }}>
            <span style={{ ...clip, minWidth: 0 }}>{openLabel ?? "Budgets"}</span>
            {rows.length > 1 && <span style={{ color: T.ink3, fontWeight: 400 }}>· {rows.length}</span>}
            <span aria-hidden="true" style={{ color: T.ink3 }}>▾</span>
          </button>
        )}
        <button onClick={() => void build()} disabled={!!busy || working} className="rounded px-2.5"
          style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, fontSize: F.xs, cursor: "pointer", whiteSpace: "nowrap" }}>
          {busy === "build" || working ? "Building…" : run?.status === "failed" ? "Retry" : "Build draft budget"}
        </button>
      </div>

      {open && (
        <div className="px-3 py-2 flex flex-col gap-2" style={{ fontSize: F.sm }}>
          {!run && <p style={{ margin: 0, color: T.ink2, lineHeight: 1.45 }}>Reads this job&apos;s calls, texts and your notes, adds the areas they describe with the sizes they said, and loads your assembly on each. Nothing is guessed: what they didn&apos;t say becomes a question.</p>}
          {run?.status === "failed" && <div style={{ color: T.red }}>The build stopped: {run.error ?? "no reason given"}. The job and its budget are as they were — Retry.</div>}
          {x && (
            <>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>
                {x.scope} {x.evidence_count ? `${x.evidence_count} lines read` : "Nothing to read yet"}
                {run?.reader === "plain" || run?.reader?.startsWith("plain") ? " · plain reading (no model key set)" : run?.reader ? ` · read with ${run.reader}` : ""}
                {run?.finished_at ? ` · ${day(run.finished_at)}` : ""}{run?.trigger === "job_created" ? " · built when the job was made" : ""}
              </div>
              <div style={{ color: T.ink }}>{x.kind_reason.charAt(0).toUpperCase() + x.kind_reason.slice(1)}.</div>

              {x.questions.length > 0 && (
                <div className="rounded px-2.5 py-2" style={{ background: T.hivizDim, border: `1px solid ${T.hairSoft}` }}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span style={{ ...eyebrow, color: T.ink }}>To ask or measure</span>
                    <span className="flex-1" />
                    <button onClick={() => void navigator.clipboard?.writeText(x.questions.join("\n")).catch(() => {})} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Copy</button>
                  </div>
                  {x.questions.map((q) => <div key={q} style={{ lineHeight: 1.45 }}>• {q}</div>)}
                </div>
              )}

              {x.areas.length > 0 && (
                <div>
                  <div style={{ ...eyebrow, color: T.ink, marginBottom: 2 }}>What they said</div>
                  {x.areas.map((a) => (
                    <div key={a.key} className="py-1" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                      <div className="flex items-baseline gap-2"><span style={{ fontWeight: 600 }}>{a.name}</span><span style={{ fontSize: F.xs, color: T.ink2, ...nums }}>{size(a)}</span></div>
                      {a.facts.filter((f, i, all) => all.findIndex((g) => g.quote === f.quote) === i).map((f) => (
                        <div key={`${f.key}${f.quote}`} style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>
                          “{f.quote}” — {WHO[f.status] ?? f.status}, {day(f.at)}{f.approximate ? " · rough" : ""}
                        </div>
                      ))}
                    </div>
                  ))}
                  {x.existing_depth && <div style={{ fontSize: F.xs, color: T.ink3 }}>Old concrete: {String(x.existing_depth.value)}&quot; — “{x.existing_depth.quote}” (for the haul-off, not the new slab)</div>}
                </div>
              )}
              {x.conflicts.map((c) => (
                <div key={c.what} style={{ fontSize: F.xs, color: T.red }}>
                  {c.what}: {c.facts.map((f) => `${f.value} (“${f.quote}”, ${day(f.at)})`).join(" vs ")} — not used until you settle it.
                </div>
              ))}
              {run?.made?.sections?.length ? (
                <div style={{ fontSize: F.xs, color: T.green }}>
                  {run.made.sections.some((m) => m.existing) ? "Loaded on " : "Added "}{run.made.sections.map((m) => `${m.name}${m.assembly ? ` with ${m.assembly} (${m.lines} line${m.lines === 1 ? "" : "s"})` : " — no assembly for this kind of area"}`).join("; ")}.
                </div>
              ) : null}
              {run?.made?.filled?.length ? (
                <div style={{ fontSize: F.xs, color: T.green }}>
                  From your Price book, the item you always use: {run.made.filled.map((f) => f.item).join(", ")}.
                </div>
              ) : null}
              {run?.suggestions?.length ? (
                <div>
                  <div style={{ ...eyebrow, color: T.ink, marginBottom: 2 }}>Heard differently from your areas</div>
                  {run.suggestions.map((g) => (
                    <div key={`${g.section_id}${g.field}`} className="flex items-baseline gap-2 py-0.5" style={{ fontSize: F.xs }}>
                      <span style={{ flex: 1, minWidth: 0, color: T.ink2 }}>{g.section} {FIELD[g.field] ?? g.field}: you have {g.current ?? "nothing"}, they said {g.heard} — “{g.quote}”</span>
                      <button onClick={() => void takeHeard(g)} disabled={!!busy} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Use {g.heard}</button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {run && run.outcome !== "manual_review" && (
            <div>
              <div style={{ ...eyebrow, color: T.ink, marginBottom: 2 }}>Driveway replacement — every step</div>
              {s.steps.map((st) => (
                <div key={st.key} className="flex items-baseline gap-2 py-0.5" style={{ fontSize: F.xs }}>
                  <span aria-hidden="true" style={{ width: 12, color: st.state === "covered" ? T.green : st.state === "excluded" ? T.ink3 : T.hiviz }}>{st.state === "covered" ? "✓" : st.state === "excluded" ? "–" : "○"}</span>
                  <span style={{ fontWeight: 600, color: T.ink }}>{st.label}</span>
                  <span style={{ flex: 1, minWidth: 0, color: T.ink3, ...clip }}>
                    {st.state === "covered" ? st.line_ids.map((id) => s.line_names[id]).filter(Boolean).join(", ")
                      : st.state === "excluded" ? `not on this job — ${st.reason}` : "not on the budget"}
                  </span>
                  {st.state === "open" && <button onClick={() => exclude(st)} disabled={!!busy} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Not on this job</button>}
                  {st.state === "excluded" && st.by === "coy" && <button onClick={() => void act(`x:${st.key}`, () => call(`/api/jobs/${jobId}/budget/draft`, "PATCH", { step: st.key, reason: null }))} disabled={!!busy} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Put back</button>}
                </div>
              )).flatMap((row, i) => {
                const st = s.steps[i];
                const pk = st.state === "open" ? s.picks?.[st.key] : undefined;
                if (!pk) return [row];
                return [row, (
                  <div key={`${st.key}-picks`} className="flex flex-wrap items-center gap-1.5 pb-1" style={{ paddingLeft: 20, fontSize: F.xs }}>
                    {pk.picks.length > 0 && <span style={{ color: T.ink3 }}>{pk.verdict === "auto" ? "You usually use:" : "Which one?"}</span>}
                    {pk.picks.map((p) => (
                      <button key={p.id} onClick={() => void takePick(st.key, p)} disabled={!!busy} title={`${p.group_name ?? "No group"}${p.used ? ` · on ${p.used} budget line${p.used === 1 ? "" : "s"}` : " · not used yet"}`}
                        className="rounded px-2" style={{ height: 24, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer", maxWidth: 260, ...clip }}>
                        + {p.name} <span style={{ color: p.unit_cost === null ? T.red : T.ink3, ...nums }}>{each(p)}</span>
                      </button>
                    ))}
                    {pk.picks.length === 0 && <span style={{ color: T.ink3 }}>Nothing in your Price book for this.</span>}
                    {making?.step !== st.key && (
                      <button onClick={() => setMaking({ step: st.key, name: STEP_NEW_NAME[st.key] ?? st.label, unit: STEP_NEW_UNIT[st.key] ?? "SqFt", cost: "" })} disabled={!!busy}
                        style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>{pk.picks.length ? "Or make a new one" : "Make it"}</button>
                    )}
                    {busy === `p:${st.key}` && <span style={{ color: T.ink3 }}>Adding…</span>}
                    {making?.step === st.key && !making.source && makeForm()}
                  </div>
                )];
              })}
              {s.steps.some((st) => st.state === "open") && <div style={{ fontSize: F.xs, color: T.ink3 }}>Tap an item to put it on every area (delivery and equipment go on once for the job), make a new one, or mark the step not on this job.</div>}
            </div>
          )}

          {run && run.status === "done" && run.outcome !== "manual_review" && (() => {
            const rl = run.made?.rates;
            const mine = s.totals && s.sqft ? s.totals.total / s.sqft : null;
            const order = ["job", ...s.steps.map((st) => st.key)];
            const rates = [...(rl?.rates ?? [])].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
            return (
              <div className="rounded px-2.5 py-2" style={{ border: `1px solid ${T.hairSoft}` }}>
                <div className="flex items-baseline gap-2">
                  <span style={{ ...eyebrow, color: T.ink }}>Going rates</span>
                  <span style={{ fontSize: F.xs, color: T.ink3, ...clip, minWidth: 0 }}>{rl ? `${rl.place} · looked up ${day(rl.asked_at)}` : "from the web, with where each came from"}</span>
                  <span className="flex-1" />
                  <button onClick={() => void lookRates()} disabled={!!busy} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {busy === "rates" ? "Looking…" : rl ? "Look again" : "Look up going rates"}
                  </button>
                </div>
                {rl?.error && <div style={{ fontSize: F.xs, color: T.red }}>{rl.error}</div>}
                {rl && !rl.error && !rates.length && <div style={{ fontSize: F.xs, color: T.ink3 }}>No price on the pages found could be checked against its words.</div>}
                {rates.map((r) => (
                  <div key={`${r.step}${r.url}${r.low}${r.high}`} className="flex items-baseline gap-2 py-0.5" style={{ fontSize: F.xs, borderTop: `1px solid ${T.hairSoft}` }}>
                    <span style={{ fontWeight: 600, color: T.ink, whiteSpace: "nowrap", ...nums }}>{range(r)}</span>
                    <span style={{ flex: 1, minWidth: 0, color: T.ink2 }} title={`“${r.quote}”`}>
                      {r.what}{r.split !== "all" ? ` · ${r.split} only` : ""}{r.kind === "installed_price" ? " · what customers pay" : " · your cost"}
                      {r.step === "job" && r.unit === "sf" && mine ? <span style={{ color: mine < r.low ? T.hiviz : mine > r.high ? T.red : T.green }}> · yours {usd(Math.round(mine * 100) / 100)}/sq ft</span> : null}
                      {" · "}<a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: T.chalk }}>{r.site}</a>
                    </span>
                    {r.kind === "cost" && r.step !== "job" && <button onClick={() => takeRate(r)} disabled={!!busy} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Use</button>}
                  </div>
                ))}
                {making?.source && <div className="pt-1">{makeForm()}</div>}
                {rates.length > 0 && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>Published ranges, not your prices. Use opens a new Price book item at the middle of the range for you to change before it&apos;s saved.</div>}
              </div>
            );
          })()}

          {s.blocked_lines.length > 0 && (
            <div style={{ fontSize: F.xs }}>
              <div style={{ ...eyebrow, color: T.red, marginBottom: 2 }}>Not priced — the total is partial</div>
              {s.blocked_lines.map((b) => <div key={b.id} style={{ color: T.ink2 }}>{b.name}: {b.reasons.join("; ")}</div>)}
            </div>
          )}

          {run && (
            <div className="flex items-center gap-2 pt-1" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: F.xs, color: T.ink3 }}>
                {s.approval ? <>Approved {day(s.approval.approved_at)} at {money0(Number(s.approval.total ?? 0))}{changedSince ? " — changed since" : ""}. </> : null}
                {s.blocks.length ? `${s.blocks.length} thing${s.blocks.length === 1 ? "" : "s"} before it can be approved.` : "Approving keeps a copy for you. It sends nothing to the customer."}
              </span>
              <button onClick={() => void approve()} disabled={!!busy || s.blocks.length > 0} title={s.blocks.join("\n")} className="rounded px-2.5"
                style={{ height: 28, border: `1px solid ${s.blocks.length ? T.hair : T.green}`, color: s.blocks.length ? T.ink3 : T.green, background: T.card, fontWeight: 600, fontSize: F.xs, cursor: s.blocks.length ? "default" : "pointer" }}>
                {busy === "approve" ? "…" : s.approval && !changedSince ? "Approved ✓" : "Approve budget"}
              </button>
            </div>
          )}
          {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        </div>
      )}
      {!open && err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}

      <Drawer open={sheet === "budgets"} onClose={() => { setSheet(null); setEditing(null); }} title="Budgets" sub="On this job">
        <div className="px-4 py-3 flex flex-col gap-2" style={{ fontSize: F.sm }}>
          {!bs?.ready ? <div style={{ color: T.ink2 }}>{bs?.error ?? "Loading…"}</div> : (
            <>
              <p style={{ margin: 0, color: T.ink3, fontSize: F.xs, lineHeight: 1.45 }}>
                Every budget is saved as you work on it. The open one is what the job, the proposal, the Dashboard and Dusty use. The areas and their sizes are the job&apos;s, shared by every budget; each budget has its own items, O.H. and margin.
              </p>
              {rows.map((b) => (
                <div key={b.id} className="rounded px-3 py-2" style={{ border: `1px solid ${b.open ? T.chalk : T.hair}`, background: T.card }}>
                  {editing?.id === b.id ? (
                    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void budgetsAct(`n:${b.id}`, { action: "rename", id: b.id, name: editing.name }); }}>
                      <input autoFocus value={editing.name} maxLength={60} onChange={(e) => setEditing({ id: b.id, name: e.target.value })} aria-label="Budget name"
                        className="rounded px-2 flex-1" style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, minWidth: 0 }} />
                      <button type="submit" disabled={!!busy || !editing.name.trim()} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Cancel</button>
                    </form>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span style={{ fontWeight: 600, color: T.ink, ...clip, minWidth: 0 }}>{b.name ?? "Unnamed budget"}</span>
                      <button onClick={() => setEditing({ id: b.id, name: b.name ?? (b.open ? bs.suggest?.open ?? "" : "") })} aria-label={b.name ? "Rename" : "Name it"}
                        style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>{b.name ? "✎" : "Name it"}</button>
                      <span className="flex-1" />
                      {b.open ? <span style={{ ...eyebrow, color: T.chalk }}>Open</span> : (
                        <button onClick={() => void budgetsAct(`o:${b.id}`, { action: "open", id: b.id, park_name: openRow?.name ?? bs.suggest?.open })} disabled={!!busy}
                          className="rounded px-2" style={{ height: 26, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, fontSize: F.xs, cursor: "pointer" }}>
                          {busy === `o:${b.id}` ? "…" : "Open"}
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: F.xs, color: T.ink3, ...nums }}>
                    {b.lines} item{b.lines === 1 ? "" : "s"}{b.total !== null && b.lines ? ` · ${money0(b.total)}${b.partial ? " so far (partial)" : ""}` : ""} · changed {day(b.updated_at)}
                    {b.open && !b.name ? ` · opening another keeps this one as "${bs.suggest?.open}"` : ""}
                  </div>
                </div>
              ))}
              {!rows.length && <div style={{ color: T.ink2 }}>No budget on this job yet. Add items to an area, or Build draft budget.</div>}
              {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
            </>
          )}
        </div>
      </Drawer>

      <Drawer open={sheet === "build"} onClose={() => setSheet(null)} title="Build a new draft budget" sub="Your budget is kept">
        <form className="px-4 py-3 flex flex-col gap-3" style={{ fontSize: F.sm }} onSubmit={(e) => { e.preventDefault(); buildNew(); }}>
          <label className="flex flex-col gap-1">
            <span style={{ ...eyebrow, color: T.ink }}>Keep this budget as</span>
            {openRow?.name ? <span style={{ color: T.ink }}>{openRow.name} — {openRow.lines} item{openRow.lines === 1 ? "" : "s"}{openRow.total !== null ? `, ${money0(openRow.total)}` : ""}</span> : (
              <input value={keepName} maxLength={60} onChange={(e) => setKeepName(e.target.value)} className="rounded px-2"
                style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ ...eyebrow, color: T.ink }}>Name the new one</span>
            <input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} className="rounded px-2"
              style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />
          </label>
          <p style={{ margin: 0, color: T.ink3, fontSize: F.xs, lineHeight: 1.45 }}>
            The new budget starts empty and opens. It reads this job&apos;s calls, texts and your notes, and your assembly fills each area. Your areas&apos; sizes aren&apos;t changed: anything heard differently is shown for you to use or not. Budgets ▾ opens either one again.
          </p>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={!!busy || !newName.trim() || (!openRow?.name && !keepName.trim())} className="rounded px-3"
              style={{ height: 32, border: `1px solid ${T.chalk}`, background: T.card, color: T.chalk, fontWeight: 600, fontSize: F.sm, cursor: "pointer" }}>Build new budget</button>
            <span className="flex-1" />
            <button type="button" onClick={() => { setSheet(null); void rebuild(); }} disabled={!!busy} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Read again into this one</button>
          </div>
        </form>
      </Drawer>
    </section>
  );
}
