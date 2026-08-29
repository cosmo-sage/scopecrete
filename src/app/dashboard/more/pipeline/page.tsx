"use client";

/**
 * Pipeline — leads by stage, from /api/dashboard/pipeline.
 *
 * `leads` has 21 real rows and, since migration 024, is readable through a
 * session client. Every number here is counted from those rows. v34's
 * pipelineNumbers() computed its figures from mock JOBS and is not used.
 */

import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { Badge, EmptyState } from "@/components/v34/primitives";

interface Lead {
  id: string; customerName: string; projectType: string; address: string;
  estimatedValue: number; daysInStage: number;
}
interface Stage { count: number; totalValue: number; avgDaysInStage: number; leads: Lead[] }

const ORDER = ["new", "contacted", "qualified", "won", "lost"];

export default function PipelineScreen() {
  const [stages, setStages] = useState<Record<string, Stage> | null>(null);
  const [summary, setSummary] = useState<{ totalPipelineValue: number; needsAction: number; winRate: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState("new");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/pipeline")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        return b;
      })
      .then((d) => { if (!cancelled) { setStages(d.stages || {}); setSummary(d.summary || null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <EmptyState tone="warn" title="Couldn't load the pipeline" detail={error} />;
  if (!stages) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 48, background: T.hairSoft }} />)}
      </div>
    );
  }

  const total = Object.values(stages).reduce((s, st) => s + (st.count || 0), 0);
  const rows = stages[active]?.leads ?? [];
  // Win rate is only meaningful once something has been decided. Printing 0%
  // against nothing decided reads as "you lose everything", which is a claim.
  const decided = (stages.won?.count ?? 0) + (stages.lost?.count ?? 0);

  return (
    <div>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div style={eyebrow}>Open pipeline</div>
        <div style={{ fontFamily: disp, fontSize: F.xxl, fontWeight: 700, lineHeight: 1, ...nums }}>
          {summary ? money0(summary.totalPipelineValue) : "—"}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
          {total} lead{total === 1 ? "" : "s"}
          {summary && summary.needsAction > 0 ? ` · ${summary.needsAction} need you` : ""}
          {decided > 0 && summary ? ` · ${summary.winRate}% win rate` : " · no decided jobs yet"}
        </div>
      </div>

      <div className="flex overflow-x-auto" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        {ORDER.map((k) => (
          <button key={k} onClick={() => setActive(k)} className="px-3 py-2 shrink-0"
            style={{
              fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".08em",
              color: active === k ? T.ink : T.ink3,
              borderBottom: active === k ? `2px solid ${T.hiviz}` : "2px solid transparent",
            }}>
            {k} {stages[k]?.count ?? 0}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={`Nothing in ${active}`} detail="Leads move here as their stage changes." />
      ) : (
        rows.map((l, i) => (
          <div key={l.id} className="px-3 py-2.5 flex items-start gap-3"
            style={{ background: T.card, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.customerName}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.projectType}{l.address ? ` · ${l.address}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, color: l.estimatedValue > 0 ? T.ink : T.ink3 }}>
                {l.estimatedValue > 0 ? money0(l.estimatedValue) : "—"}
              </div>
              <div style={{ fontSize: F.micro, color: T.ink3 }}>{l.daysInStage}d</div>
            </div>
            <Badge s={active} />
          </div>
        ))
      )}
    </div>
  );
}
