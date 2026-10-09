"use client";
/**
 * Risk settings (migration 096, src/lib/risk.ts) — on a project type in
 * Price book → Defaults, and on a job's budget. Contingency, the job's risk
 * checklist and carrying cost (days to get paid, retainage held, the rate).
 * Blank is none; nothing is filled in for Coy.
 */
import React, { useState } from "react";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { NO_RISK, riskOf, riskSuggestions, type RiskItem, type RiskSettings } from "@/lib/risk";

const input: React.CSSProperties = { border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm, padding: "4px 6px", ...nums };
const chip: React.CSSProperties = { border: `1px dashed ${T.hairStrong}`, borderRadius: 12, background: T.card, color: T.ink2, fontSize: F.xs, padding: "2px 8px", cursor: "pointer" };

type NumKey = "contingency_pct" | "pay_days" | "retainage_pct" | "retainage_days" | "carry_rate_pct";

function Num({ label, unit, value, onSave }: { label: string; unit: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  return (
    <label className="block" style={{ minWidth: 0 }}>
      <span style={{ ...eyebrow, fontSize: 10 }}>{label}</span>
      <span className="flex items-center gap-1 mt-0.5">
        <input inputMode="decimal" value={v} aria-label={label} placeholder="—"
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { const n = v.trim() === "" ? null : Number(v); if (n !== value && (n === null || Number.isFinite(n))) onSave(n); }}
          style={{ ...input, width: "100%", minWidth: 0, textAlign: "right" }} />
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{unit}</span>
      </span>
    </label>
  );
}

export function RiskEditor({ value, jobType, onSave, note }: {
  value: RiskSettings | null; jobType: string | null; onSave: (next: RiskSettings) => void | Promise<void>; note?: string;
}) {
  const r = value ?? NO_RISK;
  const res = riskOf(r);
  const save = (p: Partial<RiskSettings>) => void onSave({ ...r, ...p });
  const setItems = (items: RiskItem[]) => save({ items });
  const [adding, setAdding] = useState("");
  const have = new Set(r.items.map((i) => i.label.toLowerCase()));
  const offers = riskSuggestions(jobType).filter((l) => !have.has(l.toLowerCase()));
  const add = (label: string) => { const l = label.trim(); if (l && !have.has(l.toLowerCase())) setItems([...r.items, { label: l.slice(0, 60), pct: null, on: true }]); };
  const field = (k: NumKey, label: string, unit: string) => <Num key={`${k}-${r[k] ?? ""}`} label={label} unit={unit} value={r[k]} onSave={(v) => save({ [k]: v } as Partial<RiskSettings>)} />;
  return (
    <div style={{ color: T.ink }}>
      {note && <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>{note}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", maxWidth: 600 }}>
        {field("contingency_pct", "Contingency", "% cost")}
        {field("pay_days", "Days to get paid", "days")}
        {field("retainage_pct", "Retainage", "%")}
        {field("retainage_days", "Held after", "days")}
        {field("carry_rate_pct", "Cost of money", "% / yr")}
      </div>
      <div style={{ ...eyebrow, fontSize: 10, marginTop: 10 }}>Risk checklist · each ticked one adds its % on cost</div>
      <div style={{ display: "grid", gap: 4, marginTop: 4, maxWidth: 600 }}>
        {r.items.map((it, i) => (
          <div key={`${it.label}-${i}`} className="flex items-center gap-1.5">
            <input type="checkbox" checked={it.on} aria-label={`Count ${it.label}`} onChange={(e) => setItems(r.items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
            <span className="flex-1" style={{ fontSize: F.sm, color: it.on ? T.ink : T.ink3, minWidth: 0 }}>{it.label}</span>
            <input key={`p-${it.pct ?? ""}`} inputMode="decimal" defaultValue={it.pct ?? ""} placeholder="%" aria-label={`${it.label} percent`}
              onBlur={(e) => { const n = e.target.value.trim() === "" ? null : Number(e.target.value); if (n !== it.pct && (n === null || Number.isFinite(n))) setItems(r.items.map((x, j) => (j === i ? { ...x, pct: n } : x))); }}
              style={{ ...input, width: 56, textAlign: "right", borderColor: it.on && it.pct === null ? T.hiviz : T.hair }} />
            <span style={{ fontSize: F.xs, color: T.ink3 }}>%</span>
            <button aria-label={`Remove ${it.label}`} onClick={() => setItems(r.items.filter((_, j) => j !== i))} style={{ color: T.ink3, width: 22 }}>×</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {offers.slice(0, 8).map((l) => <button key={l} type="button" style={chip} onClick={() => add(l)}>+ {l}</button>)}
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Another risk…" aria-label="Add a risk"
          onKeyDown={(e) => { if (e.key === "Enter") { add(adding); setAdding(""); } }} style={{ ...input, width: 140 }} />
      </div>
      <div style={{ fontSize: F.xs, marginTop: 8, lineHeight: 1.5, color: T.ink2 }}>
        {res.parts.length === 0 && res.missing.length === 0 ? <span style={{ color: T.ink3 }}>No risk set — prices are cost, O.H. and margin alone.</span> : (
          <>
            {res.parts.map((p) => <div key={p.label} style={nums}>{p.label}: <b style={{ fontFamily: disp }}>{p.pct}%</b> {p.on === "cost" ? "on cost" : "of the price"}</div>)}
            {res.missing.length > 0 && <div style={{ color: T.red }}>Give a % for: {res.missing.map((m) => m.replace(/: %$/, "")).join(", ")}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** One line for a folded header: "Risk 6% on cost · 1.8% carrying". */
export function riskSummary(r: RiskSettings | null): string {
  const x = riskOf(r);
  const bits = [x.cost_pct ? `${x.cost_pct}% on cost` : null, x.carry_pct ? `${x.carry_pct}% carrying` : null, x.missing.length ? `${x.missing.length} without a %` : null].filter(Boolean);
  return bits.length ? `Risk ${bits.join(" · ")}` : "No risk set";
}
