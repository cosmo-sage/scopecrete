"use client";
/**
 * A budget plan under one of Dusty's answers (src/lib/dusty/plan.ts): the steps
 * in plain words, and Apply — Coy's tap, run through the ordinary APIs
 * (src/lib/dusty/apply-plan.ts). Dusty changes nothing himself.
 */
import { useEffect, useState } from "react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { describe, type PlanAction } from "@/lib/dusty/plan";
import { applyPlan, byRef, loadLookup, type PlanLookup, type StepResult } from "@/lib/dusty/apply-plan";

export function PlanCard({ jobId, actions, dropped, done }: { jobId: string | null; actions: PlanAction[]; dropped: number; done: boolean }) {
  const [look, setLook] = useState<PlanLookup | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [results, setResults] = useState<StepResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!jobId || !done) return;
    let off = false;
    loadLookup(jobId).then((l) => { if (!off) setLook(l); }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [jobId, done]);
  if (!actions.length && !dropped) return null;
  const names = {
    item: (r: string) => (look ? byRef(look.items, r)?.name ?? null : r),
    area: (r: string | null) => (r === null ? "the whole job" : look ? byRef(look.sections, r)?.name ?? `area ${r} (not on this job)` : `area ${r}`),
  };
  const run = async () => {
    if (!jobId || !look) return;
    setState("running"); setErr(null);
    try { setResults(await applyPlan(jobId, actions, look)); setState("done"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState("idle"); }
  };
  return (
    <div className="mt-3 rounded" style={{ border: `1px solid ${T.hiviz}`, background: T.card }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ ...eyebrow, color: T.hivizText }}>Dusty&apos;s plan · {actions.length} step{actions.length === 1 ? "" : "s"}</span>
        <span className="flex-1" />
        {state !== "done" && (
          <button onClick={() => void run()} disabled={!jobId || !look || state === "running" || !actions.length}
            className="rounded px-3" style={{ height: 30, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", opacity: !jobId || !look || state === "running" ? 0.5 : 1 }}>
            {state === "running" ? "Applying…" : "Apply"}
          </button>
        )}
      </div>
      <ol className="px-3 py-2 flex flex-col gap-1" style={{ fontSize: F.sm, listStyle: "decimal", paddingLeft: 28 }}>
        {actions.map((a, i) => <li key={i}>{describe(a, names)}</li>)}
      </ol>
      {dropped > 0 && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>{dropped} step{dropped === 1 ? "" : "s"} didn&apos;t make sense and were left out.</div>}
      {!jobId && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Open the job and ask there to apply a plan.</div>}
      {state === "done" && (
        <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hair}`, fontSize: F.xs }}>
          {results.map((r, i) => <div key={i} style={{ color: r.ok ? T.green : T.red }}>{r.ok ? "✓" : "✗"} {r.text}</div>)}
        </div>
      )}
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}
