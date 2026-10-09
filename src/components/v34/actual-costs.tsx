"use client";
/**
 * Actual costs — job costing, the third of the Budget's tabs (Coy, 2026-10-09:
 * "job costing where receipts and bills are processed for the job"; Claude
 * Design "Budget v3" P3 / D2; migration 094).
 *
 * Receipts and bills (files Dusty read, filed on a line), crew time and typed
 * costs against the proposed budget, by category and by line; costs the budget
 * didn't have; change orders; the crew as budgeted against as it ran. A line
 * with nothing filed is held at its budget in every total, and says so — never a
 * partial category. Every number is src/lib/budget-v3.ts over the engine's line
 * results; every write is Coy's tap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money0, strong } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { COLORS } from "@/components/v34/cost-analysis";
import { sendBytes } from "@/components/v34/files-panel";
import { askDusty } from "@/components/v34/budget-tabs";
import { compareActuals, crewCompare, type ActualsFilter, type ChangeOrder, type JobCost, type LineActual } from "@/lib/budget-v3";

interface Line { id: string; name: string; section_id: string | null; cost_type: string; qty: number | null; unit: string; unit_cost: number | null; ext_cost: number | null }
interface Receipt { id: string; name: string; kind: string; vendor: string | null; amount: number | null; date: string | null; read_state: string | null; filed: boolean; suggested_line_id: string | null }
interface Crew { size: number | null; days: number | null; hours: number | null }
interface ActualsData {
  ready: boolean; error: string | null; has_budget: boolean;
  lines: Line[]; areas: Array<{ id: string; name: string; sqft: number | null }>; sqft: number | null;
  costs: JobCost[]; change_orders: ChangeOrder[]; receipts: Receipt[];
  totals: { price: number; discount: number; overhead: number; profit: number; total: number } | null;
  crew: { budget: Crew; actual: Crew };
}

const DARK = "#2A2A2A", DARK_LABEL = "#A8A39A", DARK_GREEN = "#6FBF73", DARK_WARN = "#F2874A";
const signed = (v: number) => (Math.abs(v) < 0.5 ? "±0" : `${v > 0 ? "+" : "−"}${money0(Math.abs(v))}`);
const varColor = (v: number | null) => (v === null || Math.abs(v) < 0.5 ? T.ink3 : v > 0 ? T.red : T.green);
const KIND: Record<string, string> = { receipt: "Receipt", bill: "Bill", time_log: "Time log", typed: "Typed" };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export function ActualCosts({ jobId, refresh }: { jobId: string; refresh: number }) {
  const [d, setD] = useState<ActualsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActualsFilter>("all");
  const [section, setSection] = useState<string>("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [ref, wide] = useWide<HTMLDivElement>(900);
  const url = `/api/jobs/${jobId}/actuals`;

  const load = useCallback(async () => {
    try { setD(await send(url, "GET")); setErr(null); } catch (e) { setErr(String((e as Error).message ?? e)); }
  }, [url]);
  useEffect(() => {
    let off = false;
    send(url, "GET").then((b) => { if (!off) { setD(b); setErr(null); } }).catch((e) => { if (!off) setErr(String((e as Error).message ?? e)); });
    return () => { off = true; };
  }, [url, refresh]);
  const act = async (method: string, body?: unknown, q = "") => {
    setErr(null);
    try { setD(await send(url + q, method, body)); return true; } catch (e) { setErr(String((e as Error).message ?? e)); return false; }
  };

  const s = useMemo(() => d?.totals ? compareActuals(d.lines, d.costs, d.change_orders,
    { price: d.totals.price, discount: d.totals.discount, overhead: d.totals.overhead, net: d.totals.profit }, filter, section || null) : null, [d, filter, section]);
  const all = useMemo(() => d?.totals ? compareActuals(d.lines, d.costs, d.change_orders,
    { price: d.totals.price, discount: d.totals.discount, overhead: d.totals.overhead, net: d.totals.profit }) : null, [d]);

  if (!d) return <div ref={ref} className="px-3 py-6" style={{ color: err ? T.red : T.ink3, fontSize: F.sm }}>{err ?? "Reading the job's costs…"}</div>;

  const lineName = (id: string | null) => d.lines.find((l) => l.id === id)?.name ?? null;
  const waiting = d.receipts.filter((r) => !r.filed);
  const unfiledLines = all ? all.categories.flatMap((c) => c.lines).filter((r) => r.actual === null) : [];
  const laborActual = all?.categories.find((c) => c.bucket === "labor")?.actual ?? 0;
  const k = all ? crewCompare(d.crew.budget, d.crew.actual, laborActual, d.sqft, all.actualNet) : null;
  const scaleMax = Math.max(1, ...(s?.categories ?? []).map((c) => Math.max(c.budget, c.actual))) * 1.1;
  const grid = wide ? "14px minmax(0,1.3fr) minmax(0,1fr) 100px 110px 110px 70px" : "14px minmax(0,1fr) 78px 66px";

  const sourceLine = (r: LineActual) => {
    if (!r.costs.length) return <span style={{ color: T.hivizText }}>Not filed — held at budget · tap to file</span>;
    if (r.costs.length > 1) return <span style={{ color: T.ink3 }}>{r.costs.length} costs · {[...new Set(r.costs.map((c) => KIND[c.kind]))].join(", ")}</span>;
    const c = r.costs[0];
    return <span style={{ color: c.kind === "typed" ? T.ink2 : T.ink3 }}>{KIND[c.kind]}{c.vendor ? ` · ${c.vendor}` : ""}{c.man_hours ? ` · ${c.man_hours} man-hours @ $${c.rate}` : ""}{c.note ? ` · ${c.note}` : ""}</span>;
  };

  return (
    <div ref={ref} className="px-3 py-3 flex flex-col gap-2" style={{ color: T.ink, paddingBottom: 90 }}>
      {!d.ready && <div className="rounded" style={{ background: T.hivizDim, border: `1px solid ${T.hiviz}`, padding: "8px 10px", fontSize: 12.5 }}>
        {d.error} Until then this shows the budget alone and nothing can be filed.</div>}
      {err && <div style={{ fontSize: 12, color: T.red }}>{err}</div>}
      {!d.has_budget && <div style={{ fontSize: 12.5, color: T.ink2 }}>Build the budget first to compare costs. Receipts can still be filed below as costs not on the budget.</div>}

      {(unfiledLines.length > 0 || waiting.length > 0) && d.ready && (
        <div className="rounded flex items-center gap-2" style={{ background: T.card, border: `1px solid ${T.hair}`, borderLeft: `3px solid ${T.hiviz}`, padding: "7px 10px", fontSize: 12.5 }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            {unfiledLines.length > 0 && <>{unfiledLines.length} line{unfiledLines.length === 1 ? "" : "s"} not filed · {unfiledLines.slice(0, 3).map((r) => r.line.name).join(" · ")}{unfiledLines.length > 3 ? " …" : ""}</>}
            {unfiledLines.length > 0 && waiting.length > 0 && " · "}
            {waiting.length > 0 && <b>{waiting.length} receipt{waiting.length === 1 ? "" : "s"} waiting</b>}
          </span>
          {waiting.length > 0 && <a href="#job-receipts" style={{ color: T.chalk, fontWeight: 600, whiteSpace: "nowrap" }}>File ›</a>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
          {([["all", "All"], ["over", "Over budget"], ["not_filed", "Not filed"]] as const).map(([v, label], i) => (
            <button key={v} onClick={() => setFilter(v)} style={{ height: 30, padding: "0 10px", background: filter === v ? T.ink : T.card, color: filter === v ? T.card : T.ink2,
              borderLeft: i ? `1px solid ${T.hair}` : "none", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button>
          ))}
        </span>
        {d.areas.length > 1 && (
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"
            style={{ height: 30, borderRadius: 999, border: `1px solid ${T.hairStrong}`, background: T.card, padding: "0 10px", fontSize: 12.5 }}>
            <option value="">All sections</option>
            {d.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <span className="flex-1" />
        <button onClick={() => askDusty("Look at this job's actual costs against the budget: what ran over, what isn't filed yet, and what should I do about it?")}
          style={{ fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Ask Dusty about the costs</button>
      </div>

      {/* The table: categories, then their lines. */}
      {s && (
        <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="grid items-center gap-2" style={{ gridTemplateColumns: grid, padding: "6px 10px", ...eyebrow, borderBottom: `1px solid ${T.hair}` }}>
            <span /><span>Category</span>{wide && <span>Source</span>}{wide && <span style={{ textAlign: "right" }}>Budget</span>}
            <span style={{ textAlign: "right" }}>Actual</span><span style={{ textAlign: "right" }}>±</span>{wide && <span style={{ textAlign: "right" }}>± %</span>}
          </div>
          {s.categories.length === 0 && <div style={{ padding: "10px", fontSize: 12.5, color: T.ink3 }}>{filter === "all" ? "No lines on the budget yet." : "No lines match."}</div>}
          {s.categories.map((c) => {
            const isOpen = openCats.has(c.bucket) || filter !== "all";
            const color = COLORS[c.bucket];
            const srcCount = (() => {
              const ks = c.lines.flatMap((r) => r.costs.map((x) => x.kind));
              const parts = Object.entries(ks.reduce<Record<string, number>>((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})).map(([kk, n]) => `${n} ${KIND[kk].toLowerCase()}${n === 1 ? "" : "s"}`);
              if (c.unfiled) parts.push(`${c.unfiled} not filed`);
              return parts.join(" · ");
            })();
            return (
              <div key={c.bucket} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <div className="grid items-center gap-2" onClick={() => setOpenCats((x) => { const n = new Set(x); if (n.has(c.bucket)) n.delete(c.bucket); else n.add(c.bucket); return n; })}
                  style={{ gridTemplateColumns: grid, padding: "8px 10px", cursor: "pointer" }}>
                  <span style={{ color: T.ink3, fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 13.5 }}>{wide && <span style={{ width: 9, height: 9, background: color }} />}{c.label}</div>
                    {!wide && <div style={{ fontSize: 11, color: T.ink3, ...nums }}>budget {money0(c.budget)}</div>}
                    <div style={{ marginTop: 3 }}>
                      <div style={{ height: 3, width: `${(c.budget / scaleMax) * 100}%`, border: `1px solid ${color}`, opacity: 0.55, borderRadius: 2 }} />
                      <div style={{ height: 4, width: `${(c.actual / scaleMax) * 100}%`, background: color, marginTop: 1, borderRadius: 2 }} />
                    </div>
                  </div>
                  {wide && <span style={{ fontSize: 12, color: T.ink3, ...clip }}>{srcCount}</span>}
                  {wide && <span style={{ textAlign: "right", fontSize: 13, ...nums }}>{money0(c.budget)}</span>}
                  <span style={{ textAlign: "right", fontFamily: strong, fontSize: 14, color: c.unfiled ? T.hivizText : T.ink, ...nums }}>{money0(c.actual)}</span>
                  <span style={{ textAlign: "right", ...nums }}>
                    <span style={{ fontSize: 13, color: varColor(c.variance) }}>{signed(c.variance)}</span>
                    {c.unfiled > 0 && <div style={{ fontSize: 10, color: T.hivizText }}>{c.unfiled} at budget</div>}
                  </span>
                  {wide && <span style={{ textAlign: "right", fontSize: 12, color: varColor(c.variance), ...nums }}>{c.budget ? `${Math.round((c.variance / c.budget) * 100)}%` : "—"}</span>}
                </div>
                {isOpen && c.lines.map((r) => (
                  <div key={r.line.id} style={{ background: T.sunk, borderTop: `1px solid ${T.hairSoft}` }}>
                    <div className="grid items-center gap-2" style={{ gridTemplateColumns: grid, padding: "7px 10px", cursor: "pointer" }} onClick={() => setOpenLine(openLine === r.line.id ? null : r.line.id)}>
                      <span />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, ...clip }}>{r.line.name}</div>
                        <div style={{ fontSize: 11, color: T.ink3, ...clip }}>{d.areas.find((a) => a.id === r.line.section_id)?.name ?? "Whole job"} · budget {money0(r.line.ext_cost ?? 0)}</div>
                        {!wide && <div style={{ fontSize: 11, ...clip }}>{sourceLine(r)}</div>}
                      </div>
                      {wide && <span style={{ fontSize: 12, ...clip }}>{sourceLine(r)}</span>}
                      {wide && <span style={{ textAlign: "right", fontSize: 12.5, ...nums }}>{money0(r.line.ext_cost ?? 0)}</span>}
                      <span className="flex justify-end">
                        <span style={{ minWidth: 64, height: wide ? 28 : 26, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", borderRadius: 3, ...nums,
                          background: r.costs.every((x) => x.kind === "typed") ? T.card : T.slab, border: `1px solid ${r.actual === null || r.costs.every((x) => x.kind === "typed") ? T.hairStrong : T.hair}`,
                          color: r.actual === null ? T.hivizText : T.ink, fontFamily: strong, fontSize: 13 }}>{money0(r.actual ?? r.line.ext_cost ?? 0)}</span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: 12.5, color: varColor(r.variance), ...nums }}>{r.variance === null ? "—" : signed(r.variance)}</span>
                      {wide && <span style={{ textAlign: "right", fontSize: 12, color: varColor(r.variance), ...nums }}>{r.variance !== null && r.line.ext_cost ? `${Math.round((r.variance / r.line.ext_cost) * 100)}%` : "—"}</span>}
                    </div>
                    {openLine === r.line.id && <LineCosts r={r} receipts={waiting} ready={d.ready} act={act} />}
                  </div>
                ))}
              </div>
            );
          })}
          {all && filter === "all" && !section && (
            <div className="grid items-center gap-2" style={{ gridTemplateColumns: grid, padding: "8px 10px", borderTop: `1px solid ${T.hair}`, fontWeight: 600 }}>
              <span />
              <div><div style={{ fontSize: 13.5 }}>Direct cost</div><div style={{ fontSize: 11, color: T.ink3, fontWeight: 400 }}>{wide ? `${all.filed} of ${all.lines} lines filed${all.lines - all.filed ? ` · ${all.lines - all.filed} still at budget` : ""}` : `budget ${money0(all.budgetDirect)}`}</div></div>
              {wide && <span style={{ fontSize: 11.5, color: T.ink3, fontWeight: 400 }}>{all.changeOrderCost || all.unbudgeted.length ? "with change orders and costs not on the budget" : ""}</span>}
              {wide && <span style={{ textAlign: "right", ...nums }}>{money0(all.budgetDirect)}</span>}
              <span style={{ textAlign: "right", fontFamily: strong, ...nums }}>{money0(all.actualDirect)}</span>
              <span style={{ textAlign: "right", color: varColor(all.actualDirect - all.budgetDirect), ...nums }}>{signed(all.actualDirect - all.budgetDirect)}</span>
              {wide && <span style={{ textAlign: "right", fontSize: 12, color: varColor(all.actualDirect - all.budgetDirect), ...nums }}>{all.budgetDirect ? `${Math.round(((all.actualDirect - all.budgetDirect) / all.budgetDirect) * 100)}%` : "—"}</span>}
            </div>
          )}
        </div>
      )}

      <div className={wide ? "grid gap-2" : "flex flex-col gap-2"} style={wide ? { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } : undefined}>
        <Receipts jobId={jobId} d={d} lineName={lineName} act={act} reload={load} />
        <div className="flex flex-col gap-2">
          <NotOnBudget costs={all?.unbudgeted ?? []} ready={d.ready} act={act} />
          <ChangeOrders cos={d.change_orders} ready={d.ready} act={act} soldPrice={all?.soldPrice ?? null} />
          <CrewCard crew={d.crew} k={k} ready={d.ready} act={act} />
        </div>
      </div>

      {all && (
        <div className="sticky bottom-0 lg:bottom-0 rounded flex items-baseline gap-4 flex-wrap" style={{ background: DARK, color: "#fff", padding: "10px 14px", bottom: "calc(var(--sc-foot, 0px) + 4px)" }}>
          <div><div style={{ ...eyebrow, color: DARK_LABEL }}>Net · actual</div>
            <div style={{ fontFamily: strong, fontSize: 22, fontWeight: 700, color: all.actualNet >= all.budgetNet ? DARK_GREEN : DARK_WARN, ...nums }}>{money0(all.actualNet)}</div></div>
          <div><div style={{ ...eyebrow, color: DARK_LABEL }}>Budgeted</div><div style={{ fontSize: 16, color: DARK_LABEL, ...nums }}>{money0(all.budgetNet)}</div></div>
          {k?.netPerDay != null && <div><div style={{ ...eyebrow, color: DARK_LABEL }}>Net / day</div><div style={{ fontSize: 16, ...nums }}>{money0(k.netPerDay)} / day</div></div>}
          {all.actualMargin !== null && <div><div style={{ ...eyebrow, color: DARK_LABEL }}>Margin</div><div style={{ fontSize: 16, color: "#F2610C", ...nums }}>{Math.round(all.actualMargin * 100)}%</div></div>}
        </div>
      )}
    </div>
  );
}

type Act = (method: string, body?: unknown, q?: string) => Promise<boolean>;

function MoneyInput({ placeholder, onSave, label = "Add" }: { placeholder: string; onSave: (v: string) => Promise<boolean>; label?: string }) {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder={placeholder}
        style={{ width: 96, height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, padding: "0 6px", fontSize: 13, background: T.card }} />
      <button disabled={!v.trim()} onClick={() => void onSave(v).then((ok) => ok && setV(""))}
        style={{ height: 28, padding: "0 8px", borderRadius: 3, border: `1px solid ${T.ink}`, background: T.card, fontFamily: disp, fontSize: 11, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: v.trim() ? 1 : 0.5 }}>{label}</button>
    </span>
  );
}

/** A line opened: what's filed on it, and filing more. */
function LineCosts({ r, receipts, ready, act }: { r: LineActual; receipts: Receipt[]; ready: boolean; act: Act }) {
  const [mh, setMh] = useState(""); const [rate, setRate] = useState("");
  return (
    <div className="flex flex-col gap-1.5" style={{ padding: "2px 10px 10px 32px", fontSize: 12.5 }}>
      {r.costs.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <span style={{ minWidth: 0, flex: 1, ...clip }}>{KIND[c.kind]}{c.vendor ? ` · ${c.vendor}` : ""}{c.man_hours ? ` · ${c.man_hours} man-hours @ $${c.rate}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
          <span style={{ ...nums }}>{money0(c.amount)}</span>
          {c.kind === "bill" && <button onClick={() => void act("PATCH", { cost_id: c.id, paid: !c.paid_at })} style={{ fontSize: 11.5, color: c.paid_at ? T.green : T.hivizText, cursor: "pointer" }}>{c.paid_at ? "Paid ✓" : "Mark paid"}</button>}
          <button onClick={() => void act("PATCH", { cost_id: c.id, line_id: null })} title="Take it off this line (it stays as a cost not on the budget)" style={{ fontSize: 11.5, color: T.ink3, cursor: "pointer" }}>Unfile</button>
          <button onClick={() => void act("DELETE", undefined, `?cost=${c.id}`)} aria-label="Remove" style={{ color: T.ink3, cursor: "pointer" }}>×</button>
        </div>
      ))}
      {ready ? (
        <div className="flex items-center gap-2 flex-wrap">
          <MoneyInput placeholder="$ typed" onSave={(v) => act("POST", { cost: { line_id: r.line.id, kind: "typed", amount: v } })} />
          {receipts.length > 0 && (
            <select defaultValue="" onChange={(e) => { const f = receipts.find((x) => x.id === e.target.value); if (f) void act("POST", { cost: { line_id: r.line.id, file_id: f.id, kind: "receipt", vendor: f.vendor, amount: f.amount ?? 0, spent_on: f.date } }); e.target.value = ""; }}
              style={{ height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, background: T.card, fontSize: 12.5, maxWidth: 220 }}>
              <option value="" disabled>File a receipt…</option>
              {receipts.filter((x) => x.amount !== null).map((x) => <option key={x.id} value={x.id}>{x.vendor ?? x.name} · {money0(x.amount ?? 0)}</option>)}
            </select>
          )}
          {r.line.cost_type === "labor" && (
            <span className="inline-flex items-center gap-1">
              <input value={mh} onChange={(e) => setMh(e.target.value)} inputMode="decimal" placeholder="man-hrs" style={{ width: 64, height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, padding: "0 6px", background: T.card }} />
              ×<input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="$/hr" style={{ width: 56, height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, padding: "0 6px", background: T.card }} />
              <button disabled={!mh || !rate} onClick={() => void act("POST", { cost: { line_id: r.line.id, kind: "time_log", man_hours: mh, rate } }).then((ok) => { if (ok) { setMh(""); setRate(""); } })}
                style={{ height: 28, padding: "0 8px", borderRadius: 3, border: `1px solid ${T.ink}`, background: T.card, fontFamily: disp, fontSize: 11, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Log time</button>
            </span>
          )}
        </div>
      ) : <div style={{ color: T.ink3 }}>Filing waits for migration 094.</div>}
    </div>
  );
}

function Card({ title, right, children, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "10px 12px" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}><span style={{ ...eyebrow, flex: 1 }}>{title}</span>{right}</div>
      {children}
    </div>
  );
}

/** The job's receipts and bills: snap one, file it on a line (Dusty's suggestion offered, never filed by itself). */
function Receipts({ jobId, d, lineName, act, reload }: { jobId: string; d: ActualsData; lineName: (id: string | null) => string | null; act: Act; reload: () => Promise<void> }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [up, setUp] = useState<string | null>(null);
  const add = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      setUp(`Sending ${f.name}…`);
      try {
        const made = await send("/api/files", "POST", { name: f.name || "receipt.jpg", mime: f.type, size: f.size, job_id: jobId, category: "receipt" });
        await sendBytes(made.upload.signed_url, f, () => {});
        await send(`/api/files/${made.file.id}/done`, "POST");
      } catch (e) { setUp(String((e as Error).message ?? e)); return; }
    }
    setUp("Dusty is reading it — its vendor and total show here in a minute or two.");
    await reload();
  };
  const fileCost = (r: Receipt, line: string | null, kind: "receipt" | "bill" = "receipt") =>
    act("POST", { cost: { line_id: line, file_id: r.id, kind, vendor: r.vendor, amount: r.amount ?? 0, spent_on: r.date } });
  const byFile = new Map(d.costs.filter((c) => c.file_id).map((c) => [c.file_id!, c]));
  return (
    <Card id="job-receipts" title={`Receipts on this job${d.receipts.length ? ` · ${d.receipts.length}` : ""}`}
      right={<button onClick={() => input.current?.click()} style={{ fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>+ Snap a receipt</button>}>
      <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      {up && <div style={{ fontSize: 12, color: T.ink3, marginBottom: 4 }}>{up}</div>}
      {d.receipts.length === 0 && <div style={{ fontSize: 12.5, color: T.ink3 }}>No receipts on this job yet. Snap one, or file a receipt on the job from Files — Dusty reads the vendor and total.</div>}
      {d.receipts.map((r) => {
        const filed = byFile.get(r.id);
        return (
          <div key={r.id} className="flex items-center gap-2 flex-wrap" style={{ padding: "6px 0", borderTop: `1px solid ${T.hairSoft}`, fontSize: 12.5, background: !r.filed && r.suggested_line_id ? T.hivizDim : "transparent" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <a href={`/dashboard/files?file=${r.id}`} style={{ color: T.ink, ...clip, display: "block" }}>{r.vendor ?? r.name}{r.date ? ` · ${r.date}` : ""}</a>
              <div style={{ fontSize: 11, color: filed ? T.ink3 : T.hivizText }}>
                {filed ? `Filed to ${lineName(filed.line_id) ?? "costs not on the budget"}` : r.amount === null ? (r.read_state === "read" ? "No total read — type it on a line" : "Dusty is reading it…")
                  : r.suggested_line_id ? `Not filed — looks like ${lineName(r.suggested_line_id)}` : "Not filed"}
              </div>
            </div>
            <span style={{ fontFamily: strong, ...nums }}>{r.amount !== null ? money0(r.amount) : "—"}</span>
            {!r.filed && d.ready && r.amount !== null && <>
              {r.suggested_line_id && <button onClick={() => void fileCost(r, r.suggested_line_id)} style={{ height: 26, padding: "0 8px", borderRadius: 3, border: `1px solid ${T.ink}`, background: T.card, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>File →</button>}
              <select defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v === "_none") void fileCost(r, null); else if (v === "_bill") void fileCost(r, r.suggested_line_id, "bill"); else if (v) void fileCost(r, v); }}
                style={{ height: 26, borderRadius: 3, border: `1px solid ${T.hairStrong}`, background: T.card, fontSize: 12, maxWidth: 150 }}>
                <option value="" disabled>{r.suggested_line_id ? "Other line…" : "File on…"}</option>
                {d.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="_none">Not on the budget</option>
                <option value="_bill">As a bill (owed){r.suggested_line_id ? " on that line" : ""}</option>
              </select>
            </>}
          </div>
        );
      })}
    </Card>
  );
}

function NotOnBudget({ costs, ready, act }: { costs: JobCost[]; ready: boolean; act: Act }) {
  const [what, setWhat] = useState("");
  if (!ready && !costs.length) return null;
  return (
    <Card title={`Not on the budget${costs.length ? ` · ${money0(costs.reduce((a, c) => a + c.amount, 0))}` : ""}`}>
      {costs.map((c) => (
        <div key={c.id} className="flex items-center gap-2" style={{ fontSize: 12.5, padding: "3px 0" }}>
          <span style={{ flex: 1, minWidth: 0, ...clip }}>{c.note || c.vendor || KIND[c.kind]}{c.kind === "bill" && !c.paid_at ? " · owed" : ""}</span>
          <span style={nums}>{money0(c.amount)}</span>
          {c.kind === "bill" && <button onClick={() => void act("PATCH", { cost_id: c.id, paid: !c.paid_at })} style={{ fontSize: 11.5, color: c.paid_at ? T.green : T.hivizText, cursor: "pointer" }}>{c.paid_at ? "Paid ✓" : "Mark paid"}</button>}
          <button onClick={() => void act("DELETE", undefined, `?cost=${c.id}`)} aria-label="Remove" style={{ color: T.ink3, cursor: "pointer" }}>×</button>
        </div>
      ))}
      {ready && (
        <div className="flex items-center gap-1 flex-wrap" style={{ marginTop: 4 }}>
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What (fuel, pump day…)" style={{ flex: 1, minWidth: 120, height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, padding: "0 6px", background: T.card, fontSize: 13 }} />
          <MoneyInput placeholder="$" onSave={async (v) => { const ok = await act("POST", { cost: { kind: "typed", amount: v, note: what || null } }); if (ok) setWhat(""); return ok; }} />
        </div>
      )}
    </Card>
  );
}

function ChangeOrders({ cos, ready, act, soldPrice }: { cos: ChangeOrder[]; ready: boolean; act: Act; soldPrice: number | null }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", note: "", price: "", cost: "", signed: false });
  const inp = { height: 28, borderRadius: 3, border: `1px solid ${T.hairStrong}`, padding: "0 6px", background: T.card, fontSize: 13 } as const;
  return (
    <Card title="Change orders · after the proposal" right={ready && !adding ? <button onClick={() => setAdding(true)} style={{ fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>+ Add</button> : null}>
      {cos.length === 0 && !adding && <div style={{ fontSize: 12.5, color: T.ink3 }}>None. Work added after the proposal goes here with its price and cost.</div>}
      {cos.map((c) => (
        <div key={c.id} className="flex items-center gap-2" style={{ padding: "4px 0", borderTop: `1px solid ${T.hairSoft}`, fontSize: 12.5 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={clip}>{c.name}</div><div style={{ fontSize: 11, color: T.ink3, ...clip }}>{c.note ? `${c.note} · ` : ""}{c.signed_at ? "signed" : <button onClick={() => void act("PATCH", { change_order_id: c.id, signed: true })} style={{ color: T.chalk, cursor: "pointer" }}>Mark signed</button>}</div></div>
          <div style={{ textAlign: "right", ...nums }}><div>+{money0(c.price)}</div><div style={{ fontSize: 11, color: T.ink3 }}>cost {money0(c.cost)}</div></div>
          <button onClick={() => void act("DELETE", undefined, `?change_order=${c.id}`)} aria-label="Remove" style={{ color: T.ink3, cursor: "pointer" }}>×</button>
        </div>
      ))}
      {cos.length > 0 && soldPrice !== null && <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 4 }}>Sold price with changes {money0(soldPrice)}</div>}
      {adding && (
        <div className="flex flex-col gap-1" style={{ marginTop: 4 }}>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="What changed" style={inp} />
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (who asked, when)" style={inp} />
          <div className="flex gap-1 items-center">
            <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} inputMode="decimal" placeholder="Price $" style={{ ...inp, width: 90 }} />
            <input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} inputMode="decimal" placeholder="Cost $" style={{ ...inp, width: 90 }} />
            <label className="flex items-center gap-1" style={{ fontSize: 12 }}><input type="checkbox" checked={f.signed} onChange={(e) => setF({ ...f, signed: e.target.checked })} /> signed</label>
            <span className="flex-1" />
            <button onClick={() => setAdding(false)} style={{ fontSize: 12, color: T.ink3, cursor: "pointer" }}>Cancel</button>
            <button disabled={!f.name.trim()} onClick={() => void act("POST", { change_order: f }).then((ok) => { if (ok) { setAdding(false); setF({ name: "", note: "", price: "", cost: "", signed: false }); } })}
              style={{ height: 28, padding: "0 10px", borderRadius: 3, background: T.ink, color: T.card, fontFamily: disp, fontSize: 11, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Save</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CrewCard({ crew, k, ready, act }: { crew: ActualsData["crew"]; k: ReturnType<typeof crewCompare> | null; ready: boolean; act: Act }) {
  const cell = (label: string, key: "size" | "days" | "hours", b: number | null, a: number | null, def?: number) => (
    <div className="rounded flex-1" style={{ background: T.sunk, padding: "6px 8px", minWidth: 0 }}>
      <div style={eyebrow}>{label}</div>
      <div className="flex items-center gap-1" style={{ fontFamily: strong, fontSize: 14, ...nums }}>
        <span style={{ color: T.ink3 }}>{b ?? def ?? "—"}</span> →
        <input key={String(a)} defaultValue={a ?? ""} disabled={!ready} inputMode="decimal" aria-label={`Actual ${label.toLowerCase()}`}
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(a ?? "")) void act("PATCH", { crew: { [key]: v === "" ? null : v } }); }}
          style={{ width: 44, height: 24, borderRadius: 3, border: `1px solid ${T.hairStrong}`, background: T.card, padding: "0 4px", fontFamily: strong, fontSize: 14,
            color: a !== null && (b ?? def) !== null && a > (b ?? def ?? 0) ? T.red : T.ink }} />
      </div>
    </div>
  );
  return (
    <Card title="Crew and days · budgeted → actual">
      <div className="flex gap-1.5">
        {cell("Crew", "size", crew.budget.size, crew.actual.size)}
        {cell("Days", "days", crew.budget.days, crew.actual.days)}
        {cell("Hrs / day", "hours", crew.budget.hours, crew.actual.hours, 8)}
      </div>
      {k && (k.manHours.actual || k.manHours.budget) ? (
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 6 }}>
          {k.manHours.actual ? `${Math.round(k.manHours.actual)} man-hours` : "Man-hours not known"}{k.manHours.budget ? ` against ${Math.round(k.manHours.budget)} budgeted` : ""}
          {k.laborPerManHour ? ` · labor ${money0(k.laborPerManHour)}/man-hour` : ""}{k.sfPerCrewDay ? ` · ${Math.round(k.sfPerCrewDay)} SF a crew day` : ""}
        </div>
      ) : null}
    </Card>
  );
}
