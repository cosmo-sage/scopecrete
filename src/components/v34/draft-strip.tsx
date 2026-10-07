"use client";

/**
 * Draft budget (migration 087, Coy's handoff 2026-10-07: "It is easier to
 * approve a budget than build one in the field"). On the job's Budget, above
 * its areas: Build draft budget reads the job's own calls, texts and notes,
 * adds the areas they describe (each with the line it came from) and Coy's
 * assembly fills them. What it couldn't tell becomes a question to ask; the
 * driveway recipe is checked against the budget as it is now; an unpriced
 * line makes the total partial; Approve saves a copy and sends nothing.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, clip, nums, money0 } from "@/lib/v34/tokens";

interface Fact { key: string; value: number | string | boolean; approximate: boolean; status: string; quote: string; at: string; message_id: string | null }
interface Area { key: string; name: string; work_type: string; length_ft: number | null; width_ft: number | null; sqft: number | null; depth_in: number | null; facts: Fact[] }
interface Reading {
  kind: string; kind_reason: string; areas: Area[]; existing_depth: Fact | null; demo: Fact | null
  conflicts: Array<{ what: string; facts: Fact[] }>; questions: string[]; scope?: string; evidence_count?: number
}
interface Run {
  id: string; status: string; outcome: string | null; reader: string | null; reading: Reading | null; error: string | null
  made: { sections: Array<{ id: string; name: string; assembly: string | null; lines: number }> } | null
  suggestions: Array<{ section_id: string; section: string; field: string; current: number | null; heard: number; quote: string }> | null
  created_at: string; finished_at: string | null; trigger: string
}
interface Step { key: string; label: string; state: "covered" | "excluded" | "open"; line_ids: string[]; reason: string | null; by: string | null }
interface State {
  ready: boolean; error?: string; run: Run | null; steps: Step[]; blocked_lines: Array<{ id: string; name: string; reasons: string[] }>
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
  if (a.length_ft !== null && a.width_ft !== null) parts.push(`${a.length_ft} × ${a.width_ft} ft`);
  else if (a.sqft !== null) parts.push(`${a.sqft.toLocaleString()} sq ft`);
  else parts.push("size not said");
  parts.push(a.depth_in !== null ? `${a.depth_in}" thick` : "thickness not said");
  return parts.join(" · ");
}

export function DraftStrip({ jobId, refresh = 0, onChanged }: { jobId: string; refresh?: number; onChanged: () => void }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpenState] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("sc:draft-open") !== "0"; } catch { return true; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem("sc:draft-open", v ? "1" : "0"); } catch { /* no storage */ } };

  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budget/draft`, "GET").then((b) => { if (!off) setS(b as State); }).catch((e) => { if (!off) setErr((e as Error).message); });
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
  const build = () => act("build", () => call(`/api/jobs/${jobId}/budget/draft`, "POST"), true);
  const exclude = (step: Step) => {
    const reason = window.prompt(`Why isn't "${step.label}" on this job?`, "");
    if (reason === null) return;
    if (!reason.trim()) { setErr("Say why — it's kept with the budget."); return; }
    void act(`x:${step.key}`, () => call(`/api/jobs/${jobId}/budget/draft`, "PATCH", { step: step.key, reason }));
  };
  const takeHeard = (g: NonNullable<Run["suggestions"]>[number]) =>
    act(`u:${g.section_id}:${g.field}`, () => call(`/api/jobs/${jobId}/sections/${g.section_id}`, "PATCH", { [g.field]: g.heard }), true);
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
        <button onClick={() => void build()} disabled={!!busy || working} className="rounded px-2.5"
          style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, fontSize: F.xs, cursor: "pointer", whiteSpace: "nowrap" }}>
          {busy === "build" || working ? "Building…" : run?.status === "failed" ? "Retry" : run ? "Build again" : "Build draft budget"}
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
                  Added {run.made.sections.map((m) => `${m.name}${m.assembly ? ` with ${m.assembly} (${m.lines} line${m.lines === 1 ? "" : "s"})` : " — no assembly matched; add items from the Price book"}`).join("; ")}.
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
              ))}
              {s.steps.some((st) => st.state === "open") && <div style={{ fontSize: F.xs, color: T.ink3 }}>Add an open step from the Price book with + Add on an area below, or mark it not on this job.</div>}
            </div>
          )}

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
    </section>
  );
}
