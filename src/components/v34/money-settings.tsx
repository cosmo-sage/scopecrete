"use client";

/**
 * Money settings (Coy, 2026-09-30; migration 057) — split to where each thing
 * belongs:
 *
 *   PricingDefaults (Price book → Defaults): default margin %, default O.H. %
 *     (15), the day minimum, and each parish's sales tax rate. "All the markup
 *     and margin exists only per job in the budget … There can be default
 *     margin settings applied across any new job budget." A new budget copies
 *     them; each job can change its own.
 *   CashSettings (the Cash page): pay-yourself and the recurring overhead that
 *     make the monthly burn rate. "Our monthly burn rate can be calculated in
 *     the 'cash' page."
 *
 * Every input starts BLANK when nothing is recorded — a greyed-out number in a
 * box reads as a value.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { Segmented } from "@/components/v34/primitives";
import { monthlyNut, type OverheadItem } from "@/lib/engine";

interface Money {
  default_margin_pct: number | null; default_overhead_pct: number | null; day_minimum: number | null;
  comp_mode: "fixed_draw" | "pct_profit" | null; comp_monthly_draw: number | null; comp_profit_pct: number | null;
}
interface Loaded { settings: Money; overhead: (OverheadItem & { id: string; category: string })[] }
interface Parish { id: string; parish: string; rate_pct: number; note: string | null }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

function useMoney() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    call("/api/settings/money", "GET").then((b) => { if (!off) setLoaded(b as Loaded); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { loaded, error, reload };
}

/** A number box that saves on blur. Blank = not recorded. */
function NumField({ label, unit, value, onSave, note }: { label: string; unit: string; value: number | null; onSave: (v: number | null) => Promise<void>; note?: string }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);
  const blank = v.trim() === "";
  return (
    <label className="block" style={{ minWidth: 0 }}>
      <span style={eyebrow}>{label}</span>
      <div className="flex items-center rounded mt-0.5" style={{ border: `1px solid ${blank ? T.hiviz : T.hair}`, background: T.card, height: 38 }}>
        {unit === "$" && <span className="pl-2" style={{ fontSize: F.sm, color: T.ink3 }}>$</span>}
        <input type="number" inputMode="decimal" value={v} aria-label={label}
          onChange={(e) => { setV(e.target.value); setState("idle"); }}
          onBlur={async () => {
            const next = v.trim() === "" ? null : Number(v);
            if (next === value) return;
            setState("saving"); setErr(null);
            try { await onSave(next); setState("saved"); } catch (e) { setState("err"); setErr(e instanceof Error ? e.message : String(e)); }
          }}
          className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
        {unit !== "$" && <span className="pr-2 shrink-0" style={{ fontSize: 9.5, color: T.ink3 }}>{unit}</span>}
      </div>
      <span style={{ fontSize: 9.5, color: state === "err" ? T.red : state === "saved" ? T.green : T.ink3 }}>
        {state === "err" ? err : state === "saving" ? "saving…" : state === "saved" ? "saved" : blank ? "not recorded" : note ?? "you set it"}
      </span>
    </label>
  );
}

export function PricingDefaults() {
  const { loaded, error, reload } = useMoney();
  const [parishes, setParishes] = useState<Parish[] | null>(null);
  const [pTick, setPTick] = useState(0);
  const [newP, setNewP] = useState({ parish: "", rate: "" });
  const [pErr, setPErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    call("/api/tax-parishes", "GET").then((b) => { if (!off) setParishes(b.parishes); }).catch((e) => { if (!off) setPErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [pTick]);
  if (error) return <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t load the defaults: {error}</div>;
  if (!loaded) return <div className="m-3 rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} />;
  const s = loaded.settings;
  const save = (k: keyof Money) => async (v: number | null) => { await call("/api/settings/money", "PATCH", { [k]: v }); reload(); };
  const m = s.default_margin_pct, oh = s.default_overhead_pct;
  const example = m !== null && oh !== null && m < 100 ? 1000 * (1 + oh / 100) / (1 - m / 100) : null;
  return (
    <div style={{ color: T.ink }}>
      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Every new budget starts with</div>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginBottom: 6 }}>
          Price = cost × (1 + O.H.) ÷ (1 − margin). A new job&apos;s budget copies these; change them on that job&apos;s budget and only that job changes.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" style={{ maxWidth: 560 }}>
          <NumField label="O.H." unit="%" value={oh} onSave={save("default_overhead_pct")} />
          <NumField label="Margin" unit="%" value={m} onSave={save("default_margin_pct")} />
        </div>
        <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 6, ...nums }}>
          {example !== null ? `$1,000 of cost → ${money0(1000 * (1 + (oh as number) / 100))} with O.H. → ${money0(example)} price (${m}% margin)` : "Set both to see what $1,000 of cost prices at."}
        </div>
      </div>

      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Day minimum</div>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginBottom: 6 }}>
          What a crew needs to show up for a day. A job&apos;s minimum is this × the days you set on that job — there are no default days.
        </div>
        <div style={{ maxWidth: 200 }}><NumField label="Per day" unit="$" value={s.day_minimum} onSave={save("day_minimum")} /></div>
      </div>

      <div className="px-3 py-3">
        <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Sales tax by parish</div>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginBottom: 6 }}>
          The total rate (state + parish + local) for each parish you work in. A job takes the rate of the parish its address is in; you can type a different one on the job.
        </div>
        {parishes === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : (
          <div style={{ maxWidth: 560 }}>
            {parishes.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3, padding: "4px 0 6px" }}>No parishes yet — jobs will say &ldquo;no rate for this parish&rdquo; until you add one.</div>}
            {parishes.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <span className="flex-1" style={{ fontSize: F.sm }}>{p.parish}</span>
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{p.rate_pct}%</span>
                <button onClick={() => void call(`/api/tax-parishes/${p.id}`, "DELETE").then(() => setPTick((n) => n + 1)).catch((e) => setPErr(String(e?.message ?? e)))}
                  style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Remove</button>
              </div>
            ))}
            <div className="flex items-end gap-1.5 mt-2 flex-wrap">
              <label className="block" style={{ flex: "2 1 160px", minWidth: 0 }}>
                <span style={eyebrow}>Parish</span>
                <input value={newP.parish} onChange={(e) => setNewP((x) => ({ ...x, parish: e.target.value }))} placeholder="East Baton Rouge"
                  className="w-full rounded mt-0.5 px-2 outline-none" style={{ border: `1px solid ${T.hair}`, height: 38, fontSize: F.sm, background: T.card, color: T.ink }} />
              </label>
              <label className="block" style={{ flex: "1 1 90px", minWidth: 0 }}>
                <span style={eyebrow}>Rate %</span>
                <input type="number" inputMode="decimal" value={newP.rate} onChange={(e) => setNewP((x) => ({ ...x, rate: e.target.value }))}
                  className="w-full rounded mt-0.5 px-2 outline-none" style={{ border: `1px solid ${T.hair}`, height: 38, fontFamily: disp, fontSize: F.md, ...nums, background: T.card, color: T.ink }} />
              </label>
              <button disabled={!newP.parish.trim() || newP.rate === ""}
                onClick={() => { setPErr(null); void call("/api/tax-parishes", "POST", { parish: newP.parish, rate_pct: Number(newP.rate) })
                  .then(() => { setNewP({ parish: "", rate: "" }); setPTick((n) => n + 1); }).catch((e) => setPErr(String(e?.message ?? e))); }}
                className="rounded px-3" style={{ height: 38, border: `1px solid ${T.ink}`, background: T.card, color: T.ink, fontFamily: disp,
                  fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", opacity: !newP.parish.trim() || newP.rate === "" ? 0.5 : 1 }}>
                Add
              </button>
            </div>
            {pErr && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{pErr}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function CashSettings({ onSaved }: { onSaved?: () => void }) {
  const { loaded, error, reload } = useMoney();
  const [mode, setMode] = useState<"" | "fixed_draw" | "pct_profit">("");
  const [seen, setSeen] = useState<Loaded | null>(null);
  if (loaded && loaded !== seen) { setSeen(loaded); setMode(loaded.settings.comp_mode ?? ""); }
  if (error) return <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t load: {error}</div>;
  if (!loaded) return <div className="m-3 rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} />;
  const s = loaded.settings;
  const save = (body: Record<string, unknown>) => call("/api/settings/money", "PATCH", body).then(() => { reload(); onSaved?.(); });
  return (
    <div style={{ borderTop: `1px solid ${T.hair}`, background: T.card, color: T.ink }}>
      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Pay yourself</div>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>
          A fixed draw goes out every month and counts in the burn rate. A percent of profit comes out after a job clears.
        </div>
        <div style={{ maxWidth: 360 }}>
          <Segmented small value={mode} onChange={(v) => { setMode(v as typeof mode); void save({ comp_mode: v || null }); }}
            options={[["fixed_draw", "Fixed draw"], ["pct_profit", "% of profit"]]} />
        </div>
        {mode && (
          <div className="mt-2" style={{ maxWidth: 200 }} key={mode}>
            {mode === "fixed_draw"
              ? <NumField label="Monthly draw" unit="$" value={s.comp_monthly_draw} onSave={(v) => save({ comp_monthly_draw: v })} />
              : <NumField label="Percent of profit" unit="%" value={s.comp_profit_pct} onSave={(v) => save({ comp_profit_pct: v })} />}
          </div>
        )}
      </div>
      <OverheadEditor items={loaded.overhead} onChanged={() => { reload(); onSaved?.(); }} />
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
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Recurring overhead — the burn rate</span>
        <span className="flex-1" />
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums, color: nut > 0 ? T.ink : T.ink3 }}>
          {nut > 0 ? `${money0(nut)}/mo` : "—"}
        </span>
      </div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>
        Truck and equipment notes, software, insurance, fuel — what goes out every month whether or not a job is running. Runway is cash ÷ this.
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
