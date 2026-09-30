"use client";

/**
 * Cost settings — the numbers the job budget and the bid floor stand on
 * (DECISIONS.md §3, §4). Since step 3b there are no rates here: what things
 * cost lives on cost cards in the Price book; this screen keeps the markups,
 * tax, waste, overhead and the floor. Laid out like the desktop design's Money setup screen
 * (docs/design/desktop-screens.html, 1g): the settings on the left, and on the
 * right what each blank is holding up.
 *
 * Every input starts BLANK when nothing is recorded. The Gulfline reference
 * rates appear under each field as a labelled reference, never inside the
 * input and never as a placeholder, because a greyed-out number in a box reads
 * as a value. See /api/settings/cost for why the save sends every field.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { Segmented } from "@/components/v34/primitives";
import Link from "next/link";
import { monthlyNut, type CostSettings, type OverheadItem } from "@/lib/engine";

type Key = keyof CostSettings | "markup_subcontract_pct" | "comp_profit_pct";

interface FieldDef { k: Key; label: string; unit: string; ref?: string; hint?: string }

const GROUPS: { title: string; note: string; fields: FieldDef[] }[] = [
  { title: "Concrete", note: "What you order over neat yards, and when the plant charges a short load. The price per yard is a cost card.", fields: [
    { k: "concrete_overage_pct", label: "Waste", unit: "%", ref: "3.4%" },
    { k: "shortload_threshold_cy", label: "Short load under", unit: "cu yd", ref: "5" },
  ] },
  { title: "Markup — per cost type", note: "Used when a card and its group carry no markup of their own.", fields: [
    { k: "markup_material_pct", label: "Materials", unit: "%", ref: "30.61%" },
    { k: "markup_labor_pct", label: "Labor", unit: "%", ref: "41.77%" },
    { k: "markup_equipment_pct", label: "Equipment", unit: "%", ref: "30.12%" },
    { k: "markup_subcontract_pct", label: "Subcontract", unit: "%" },
  ] },
  { title: "Sales tax", note: "Charged at cost on the cards marked taxed, when the budget's tax switch is on.", fields: [
    { k: "sales_tax_pct", label: "Sales tax", unit: "%", ref: "8.08%" },
  ] },
  { title: "Off the top", note: "Taken off gross before anything else. The floor divides by what is left.", fields: [
    { k: "owner_fee_pct", label: "Owner entity fee", unit: "%", ref: "5%" },
    { k: "estimator_fee_pct", label: "Estimator fee", unit: "%", ref: "3%" },
    { k: "tax_reserve_pct", label: "Taxes / savings", unit: "%", ref: "3%" },
  ] },
  { title: "Crew days", note: "How many crew-days a month the fixed nut is spread across, until measured days exist.", fields: [
    { k: "assumed_billable_days", label: "Crew-days per month", unit: "days", ref: "10" },
  ] },
];

const ALL_KEYS: Key[] = [...GROUPS.flatMap((g) => g.fields.map((f) => f.k)), "comp_monthly_draw", "comp_profit_pct"];

interface Loaded { settings: Record<string, unknown> | null; overhead: (OverheadItem & { id: string; category: string })[] }

async function fetchCost(): Promise<Loaded> {
  const r = await fetch("/api/settings/cost");
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b as Loaded;
}

const toStr = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));

export function CostSettingsEditor({ onSaved }: { onSaved?: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [compMode, setCompMode] = useState<"" | "fixed_draw" | "pct_profit">("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((b: Loaded) => {
    setLoaded(b);
    const s = (b.settings ?? {}) as Record<string, unknown>;
    setForm(Object.fromEntries(ALL_KEYS.map((k) => [k, toStr(s[k])])));
    setCompMode((s.comp_mode as "fixed_draw" | "pct_profit") ?? "");
  }, []);

  const load = useCallback(async () => {
    try { apply(await fetchCost()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchCost()
      .then((b) => { if (!cancelled) apply(b); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [apply]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = { comp_mode: compMode || null };
      for (const k of ALL_KEYS) payload[k] = form[k] === "" ? null : Number(form[k]);
      const r = await fetch("/api/settings/cost", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setMsg({ tone: "ok", text: "Saved." });
      await load();
      onSaved?.();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const recorded = useMemo(() => {
    if (!loaded?.settings) return 0;
    return GROUPS.flatMap((g) => g.fields).filter((f) => loaded.settings?.[f.k] !== null && loaded.settings?.[f.k] !== undefined).length;
  }, [loaded]);
  const total = GROUPS.flatMap((g) => g.fields).length;

  if (error) return <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t load cost settings: {error}</div>;
  if (!loaded) return <div className="m-3 rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} />;

  const blank = (k: string) => (form[k] ?? "") === "";
  const holding = [
    { what: "A job's budget", needs: ["concrete_overage_pct", "markup_material_pct", "markup_labor_pct", "markup_equipment_pct", "sales_tax_pct"],
      extra: ["cost cards in the Price book"] },
    { what: "The bid floor", needs: ["owner_fee_pct", "estimator_fee_pct", "tax_reserve_pct", "assumed_billable_days"],
      extra: [...(compMode ? [] : ["pay-yourself mode"]), ...(loaded.overhead.some((o) => o.active) ? [] : ["monthly overhead"])] },
    { what: "Runway", needs: [], extra: [...(loaded.overhead.some((o) => o.active) ? [] : ["monthly overhead"]), "a balance checkpoint (not built yet)"] },
  ];
  const labelOf = (k: string) => GROUPS.flatMap((g) => g.fields).find((f) => f.k === k)?.label.toLowerCase() ?? k;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px]" style={{ borderTop: `1px solid ${T.hair}`, color: T.ink }}>
      {/* ---- the settings ---- */}
      <div style={{ background: T.card }}>
        <div className="px-3 py-2.5 flex items-baseline gap-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: T.ink }}>Cost settings</span>
          <span className="flex-1" />
          <span style={{ ...eyebrow, color: recorded === total ? T.green : T.hiviz, ...nums }}>{recorded} of {total} recorded</span>
        </div>

        {GROUPS.map((g) => (
          <div key={g.title} className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{g.title}</div>
            <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>{g.note}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {g.fields.map((f) => (
                <label key={f.k} className="block" style={{ minWidth: 0 }}>
                  <span style={eyebrow}>{f.label}</span>
                  <div className="flex items-center rounded mt-0.5"
                    style={{ border: `1px solid ${blank(f.k) ? T.hiviz : T.hair}`, background: T.card, height: 38 }}>
                    <input type="number" inputMode="decimal" value={form[f.k] ?? ""}
                      onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
                      className="w-full bg-transparent outline-none px-2"
                      style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
                    <span className="pr-2 shrink-0" style={{ fontSize: 9.5, color: T.ink3 }}>{f.unit}</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: T.ink3 }}>
                    {blank(f.k) ? "not recorded" : "you set it"}{f.ref ? ` · Gulfline ref ${f.ref}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* ---- the catalog lives in the Price book (migration 049): one editor ---- */}
        <Link href="/dashboard/price-book" className="flex items-center gap-2 px-3 py-2.5 no-underline" style={{ borderBottom: `1px solid ${T.hairSoft}`, color: T.ink }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Cost cards</span>
            <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>What things cost — concrete by the yard, form & finish by the foot, mesh by the sheet — and the assemblies that fill a new area. They live in the Price book.</span>
          </span>
          <span style={{ ...eyebrow, color: T.chalk }}>Price book →</span>
        </Link>

        {/* ---- pay yourself ---- */}
        <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Pay yourself</div>
          <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>
            A fixed draw is a monthly target the floor must cover. A percent of profit comes out after a job clears and does not raise the floor.
          </div>
          <div style={{ maxWidth: 360 }}>
            <Segmented small value={compMode} onChange={(v) => setCompMode(v as typeof compMode)}
              options={[["fixed_draw", "Fixed draw"], ["pct_profit", "% of profit"]]} />
          </div>
          {compMode && (
            <label className="block mt-2" style={{ maxWidth: 200 }}>
              <span style={eyebrow}>{compMode === "fixed_draw" ? "Monthly draw" : "Percent of profit"}</span>
              <div className="flex items-center rounded mt-0.5" style={{ border: `1px solid ${T.hair}`, background: T.card, height: 38 }}>
                <input type="number" inputMode="decimal"
                  value={form[compMode === "fixed_draw" ? "comp_monthly_draw" : "comp_profit_pct"] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [compMode === "fixed_draw" ? "comp_monthly_draw" : "comp_profit_pct"]: e.target.value }))}
                  className="w-full bg-transparent outline-none px-2"
                  style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
                <span className="pr-2 shrink-0" style={{ fontSize: 9.5, color: T.ink3 }}>{compMode === "fixed_draw" ? "$ / mo" : "%"}</span>
              </div>
            </label>
          )}
        </div>

        <div className="px-3 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={() => void save()} disabled={saving} className="rounded px-4"
            style={{ height: 38, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.md,
                     fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {msg && <span style={{ fontSize: F.sm, color: msg.tone === "ok" ? T.green : T.red }}>{msg.text}</span>}
          {!loaded.settings && !msg && (
            <span style={{ fontSize: F.xs, color: T.ink3 }}>Nothing is recorded yet. Off the top, crew-days, tax and pay mode are required to save.</span>
          )}
        </div>

        <OverheadEditor items={loaded.overhead} onChanged={() => { void load(); onSaved?.(); }} />
      </div>

      {/* ---- what each blank is holding up ---- */}
      <div style={{ background: T.slab, borderLeft: `1px solid ${T.hair}` }}>
        <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: T.ink }}>What each blank is holding up</span>
        </div>
        {holding.map((h) => {
          const missing = [...h.needs.filter(blank).map(labelOf), ...h.extra];
          return (
            <div key={h.what} className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hair}` }}>
              <div className="flex items-baseline gap-2">
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{h.what}</span>
                <span className="flex-1" />
                <span style={{ ...eyebrow, color: missing.length ? T.ink3 : T.green }}>{missing.length ? "Locked" : "Ready"}</span>
              </div>
              {missing.length > 0 && (
                <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>needs {missing.join(", ")}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ nut */

function OverheadEditor({ items, onChanged }: {
  items: (OverheadItem & { id: string; category: string })[]; onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nut = monthlyNut(items.map((i) => ({ ...i, amount: Number(i.amount) })));

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      onChanged();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${T.hair}` }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Monthly overhead — the nut</span>
        <span className="flex-1" />
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums, color: nut > 0 ? T.ink : T.ink3 }}>
          {nut > 0 ? `${money0(nut)}/mo` : "—"}
        </span>
      </div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>
        Truck and equipment notes, software, insurance, fuel. Spread across jobs by crew-days in the floor — not baked into the per-foot rate.
      </div>

      {items.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3, padding: "4px 0 8px" }}>No overhead items recorded.</div>}
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: i.active ? 1 : 0.5 }}>
          <span style={{ fontSize: F.sm, flex: 1, minWidth: 0 }}>{i.label}</span>
          <span style={{ fontSize: F.xs, color: T.ink3 }}>{i.cadence.replace("_", " ")}</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{money0(Number(i.amount))}</span>
          <button disabled={busy} onClick={() => void call(`/api/settings/overhead/${i.id}`, "PATCH", { active: !i.active })}
            style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>{i.active ? "Pause" : "Resume"}</button>
          <button disabled={busy} onClick={() => void call(`/api/settings/overhead/${i.id}`, "DELETE")}
            style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Remove</button>
        </div>
      ))}

      <div className="flex items-end gap-1.5 mt-2 flex-wrap">
        <label className="block" style={{ flex: "2 1 160px", minWidth: 0 }}>
          <span style={eyebrow}>Item</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Skid steer note"
            className="w-full rounded mt-0.5 px-2 outline-none" style={{ border: `1px solid ${T.hair}`, height: 38, fontSize: F.sm }} />
        </label>
        <label className="block" style={{ flex: "1 1 90px", minWidth: 0 }}>
          <span style={eyebrow}>Amount</span>
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded mt-0.5 px-2 outline-none" style={{ border: `1px solid ${T.hair}`, height: 38, fontFamily: disp, fontSize: F.md, ...nums }} />
        </label>
        <label className="block" style={{ flex: "1 1 110px", minWidth: 0 }}>
          <span style={eyebrow}>Every</span>
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}
            className="w-full rounded mt-0.5 px-1.5 outline-none" style={{ border: `1px solid ${T.hair}`, height: 38, fontSize: F.sm, background: T.card }}>
            <option value="monthly">month</option><option value="quarterly">quarter</option>
            <option value="annual">year</option><option value="one_time">one time</option>
          </select>
        </label>
        <button disabled={busy || !label.trim() || amount === ""}
          onClick={async () => {
            if (await call("/api/settings/overhead", "POST", { label, amount: Number(amount), cadence })) { setLabel(""); setAmount(""); }
          }}
          className="rounded px-3" style={{ height: 38, border: `1px solid ${T.ink}`, background: T.card, fontFamily: disp,
            fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", opacity: !label.trim() || amount === "" ? 0.5 : 1 }}>
          Add
        </button>
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
