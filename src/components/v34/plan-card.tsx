"use client";
/**
 * A plan under one of Dusty's answers (src/lib/dusty/plan.ts): the steps in plain
 * words, and Apply — Coy's tap, run through the ordinary APIs
 * (src/lib/dusty/apply-plan.ts). Dusty changes nothing himself. Budget steps need
 * the job open; Price book and assembly steps and archive / delete / restore
 * steps (migration 066) don't — the last list
 * the real names they touch, read from the database — not Dusty's label.
 */
import { useEffect, useState } from "react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { describe, needsJob as stepNeedsJob, RECORD_STEPS, type PlanAction } from "@/lib/dusty/plan";
import { applyPlan, applyRecords, byRef, loadLookup, type PlanLookup, type StepResult } from "@/lib/dusty/apply-plan";

export function PlanCard({ jobId, actions, dropped, done }: { jobId: string | null; actions: PlanAction[]; dropped: number; done: boolean }) {
  const [look, setLook] = useState<PlanLookup | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [results, setResults] = useState<StepResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const budgetSteps = actions.filter((a) => !RECORD_STEPS.has(a.do));
  const recordSteps = actions.filter((a) => RECORD_STEPS.has(a.do));
  useEffect(() => {
    if (!done || !budgetSteps.length) return;
    let off = false;
    loadLookup(jobId).then((l) => { if (!off) setLook(l); }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [jobId, done, budgetSteps.length]);
  const recKey = recordSteps.map((a) => (a.do === "archive" || a.do === "restore" ? `${a.kind}:${a.ids.join(",")}` : a.do === "set_address" ? `${a.kind}:${a.id}` : a.do === "new_job" ? `contact:${a.contact}` : "")).filter(Boolean).join("|");
  useEffect(() => {
    if (!done || !recKey) return;
    let off = false;
    const byKind = new Map<string, string[]>();
    for (const part of recKey.split("|")) { const [k, ids] = part.split(":"); byKind.set(k, [...(byKind.get(k) ?? []), ...ids.split(",")]); }
    Promise.all([...byKind].map(([k, ids]) => fetch(`/api/archive/names?kind=${k}&ids=${[...new Set(ids)].slice(0, 500).join(",")}`).then((r) => r.json())))
      .then((all) => { if (!off) setNames(Object.assign({}, ...all.map((x) => x.names ?? {}))); }).catch(() => {});
    return () => { off = true; };
  }, [done, recKey]);
  if (!actions.length && !dropped) return null;
  const needsJob = budgetSteps.some(stepNeedsJob);
  const ready = budgetSteps.length ? !!look : done;
  const nm = {
    area: (r: string | null) => {
      if (r === null) return "the whole job";
      const made = actions.find((x) => x.do === "new_area" && x.key === r);
      if (made && made.do === "new_area") return `the new area “${made.name}”`;
      return look ? byRef(look.sections, r)?.name ?? `area ${r} (not on this job)` : `area ${r}`;
    },
    takeoff: (r: string) => (look ? byRef(look.takeoff, r)?.name ?? null : null),
    item: (r: string) => {
      const made = actions.find((x) => x.do === "new_item" && x.key === r);
      if (made && made.do === "new_item") return `the new item “${made.name}”`;
      return look ? byRef(look.items, r)?.name ?? null : r;
    },
    assembly: (r: string) => {
      const made = actions.find((x) => x.do === "new_assembly" && x.key === r);
      if (made && made.do === "new_assembly") return `the new assembly “${made.name}”`;
      return look ? byRef(look.assemblies, r)?.name ?? null : r;
    },
  };
  const run = async () => {
    if (!ready) return;
    setState("running"); setErr(null);
    try {
      const a = budgetSteps.length && look ? await applyPlan(jobId, budgetSteps, look) : [];
      const b = recordSteps.length ? await applyRecords(recordSteps) : [];
      setResults([...a, ...b]); setState("done");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState("idle"); }
  };
  return (
    <div className="mt-3 rounded" style={{ border: `1px solid ${T.hiviz}`, background: T.card }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ ...eyebrow, color: T.hivizText }}>Dusty&apos;s plan · {actions.length} step{actions.length === 1 ? "" : "s"}</span>
        <span className="flex-1" />
        {state !== "done" && (
          <button onClick={() => void run()} disabled={!ready || state === "running" || !actions.length}
            className="rounded px-3" style={{ height: 30, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", opacity: !ready || state === "running" ? 0.5 : 1 }}>
            {state === "running" ? "Applying…" : "Apply"}
          </button>
        )}
      </div>
      <ol className="px-3 py-2 flex flex-col gap-1" style={{ fontSize: F.sm, listStyle: "decimal", paddingLeft: 28 }}>
        {actions.map((a, i) => (
          <li key={i}>
            {describe(a, nm)}
            {(a.do === "set_address" || a.do === "new_job") && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{(a.do === "new_job" ? "for " : "") + (names[a.do === "new_job" ? a.contact : a.id] ?? (Object.keys(names).length ? "not found — skipped" : "…"))}</div>
            )}
            {(a.do === "archive" || a.do === "restore") && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
                {a.ids.slice(0, 12).map((id) => names[id] ?? (Object.keys(names).length ? "not found — skipped" : "…")).join(" · ")}
                {a.ids.length > 12 ? ` · +${a.ids.length - 12} more` : ""}
              </div>
            )}
          </li>
        ))}
      </ol>
      {dropped > 0 && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>{dropped} step{dropped === 1 ? "" : "s"} didn&apos;t make sense and were left out.</div>}
      {needsJob && !jobId && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Steps that touch a budget need the job open — they&apos;ll be skipped here. Open the job and ask there.</div>}
      {recordSteps.some((x) => x.do === "archive" || x.do === "restore") && state !== "done" && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Archived threads come back if they call or text again; deleted things can be restored. Nothing is erased.</div>}
      {state === "done" && (
        <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hair}`, fontSize: F.xs }}>
          {results.map((r, i) => <div key={i} style={{ color: r.ok ? T.green : T.red }}>{r.ok ? "✓" : "✗"} {r.text}</div>)}
        </div>
      )}
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}
