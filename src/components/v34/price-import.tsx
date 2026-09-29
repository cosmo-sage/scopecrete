"use client";

/**
 * Import a spreadsheet into the Price book (migration 049). Coy, 2026-09-29:
 * "Import excel csv files from jobtread and other crms."
 *
 * Three steps, all in the browser until the last tap: pick the file (CSV or
 * .xlsx, parsed here — the file itself is never uploaded), check which column
 * is which and who each vendor is, then a preview that says for every row
 * whether it is new, a price change (old → new), the same, or skipped and why.
 * Only the rows Coy ticks are sent, to /api/price-book/import. The pure parts
 * are src/lib/price-import.ts (tested).
 *
 * Nothing is assumed: a blank cost stays blank, an unknown type is flagged,
 * how a card is counted is marked "guess" until Coy picks it, and no contact
 * is ever made — a vendor is one of his or none.
 */

import React, { useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import { QTY_RULES, QTY_RULE_LABEL, COST_TYPE_LABEL } from "@/lib/cost-cards";
import {
  parseCsv, findHeader, guessMapping, toRows, matchRows, TARGETS, TARGET_LABEL,
  type Target, type ImportRow, type Matched, type RowStatus, type QtyRule,
} from "@/lib/price-import";
import { call, type Card, type Vendor } from "@/components/v34/cost-cards";

type Stage = "pick" | "map" | "preview";
const SOURCES = ["JobTread", "Another CRM", "A spreadsheet"];
const STATUS_LABEL: Record<RowStatus, string> = { new: "New", change: "Price change", same: "Same", skip: "Skipped" };
const STATUS_COLOR: Record<RowStatus, string> = { new: T.green, change: T.hiviz, same: T.ink3, skip: T.red };

export function PriceImport({ open, onClose, cards, vendors, onDone }: {
  open: boolean; onClose: () => void; cards: Card[]; vendors: Vendor[]; onDone: (msg: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [source, setSource] = useState(SOURCES[0]);
  const [file, setFile] = useState<{ name: string; kind: "csv" | "xlsx"; sheets: Array<{ name: string; data: unknown[][] }> } | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState<Record<Target, number | null> | null>(null);
  const [vendorPick, setVendorPick] = useState<Record<string, string>>({});
  const [defaultVendor, setDefaultVendor] = useState("");
  const [rules, setRules] = useState<Record<number, QtyRule>>({});
  const [unticked, setUnticked] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [measure, wide] = useWide<HTMLDivElement>(760);

  const reset = () => {
    setStage("pick"); setFile(null); setSheetIdx(0); setHeaderIdx(0); setMap(null); setVendorPick({}); setDefaultVendor("");
    setRules({}); setUnticked({}); setFilter("all"); setErr(null);
  };
  const close = () => { reset(); onClose(); };

  const data = useMemo(() => file?.sheets[sheetIdx]?.data ?? [], [file, sheetIdx]);
  const table = useMemo(() => data.slice(headerIdx), [data, headerIdx]);
  const headers = useMemo(() => (table[0] ?? []).map((c) => (c === null || c === undefined ? "" : String(c).trim())), [table]);
  const rows: ImportRow[] = useMemo(() => (map && table.length > 1 ? toRows(table, map) : []), [table, map]);
  const vendorNames = useMemo(() => [...new Set(rows.map((r) => r.vendor).filter((v): v is string => !!v))], [rows]);
  const vendorOf = useMemo(() => (r: ImportRow) => (r.vendor ? vendorPick[r.vendor.toLowerCase()] || null : defaultVendor || null), [vendorPick, defaultVendor]);
  const matched: Matched[] = useMemo(() => matchRows(rows, cards, vendorOf), [rows, cards, vendorOf]);
  const ticked = (m: Matched) => (m.status === "new" || m.status === "change") && !unticked[m.line];
  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { new: 0, change: 0, same: 0, skip: 0 };
    for (const m of matched) c[m.status]++;
    return c;
  }, [matched]);
  const nNew = matched.filter((m) => m.status === "new" && ticked(m)).length;
  const nChange = matched.filter((m) => m.status === "change" && ticked(m)).length;
  const vendorName = (id: string | null) => {
    if (!id) return null;
    const v = vendors.find((x) => x.id === id);
    return v ? v.name || formatPhone(v.phone) : null;
  };

  const choose = async (f: File) => {
    setErr(null); setBusy(true);
    try {
      const lower = f.name.toLowerCase();
      let sheets: Array<{ name: string; data: unknown[][] }>;
      let kind: "csv" | "xlsx";
      if (lower.endsWith(".csv") || lower.endsWith(".txt") || f.type === "text/csv") {
        sheets = [{ name: f.name, data: parseCsv(await f.text()) }];
        kind = "csv";
      } else if (lower.endsWith(".xlsx")) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const all = await readXlsxFile(f);
        sheets = all.map((s) => ({ name: s.sheet, data: s.data as unknown[][] })).filter((s) => s.data.length > 0);
        kind = "xlsx";
      } else if (lower.endsWith(".xls")) {
        throw new Error("That's the old Excel format. Save it as .xlsx or CSV and try again.");
      } else {
        throw new Error("Pick a CSV or an Excel (.xlsx) file.");
      }
      if (!sheets.length || sheets.every((s) => s.data.length < 2)) throw new Error("That file has no rows under a header.");
      const first = sheets.findIndex((s) => s.data.length >= 2);
      const h = findHeader(sheets[first].data);
      setFile({ name: f.name, kind, sheets });
      setSheetIdx(first);
      pickHeader(sheets[first].data, h);
      setStage("map");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const pickHeader = (d: unknown[][], h: number) => {
    setHeaderIdx(h);
    const hs = (d[h] ?? []).map((c) => (c === null || c === undefined ? "" : String(c)));
    const m = guessMapping(hs);
    setMap(m);
    // Vendors: match each name in the file to a contact filed as vendor, by name.
    const auto: Record<string, string> = {};
    if (m.vendor !== null) {
      for (const r of d.slice(h + 1)) {
        const n = r[m.vendor as number];
        const s = n === null || n === undefined ? "" : String(n).trim();
        if (!s || s.toLowerCase() in auto) continue;
        auto[s.toLowerCase()] = vendors.find((v) => (v.name ?? "").trim().toLowerCase() === s.toLowerCase())?.id ?? "";
      }
    }
    setVendorPick(auto);
    setRules({}); setUnticked({});
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    const byLine = new Map(rows.map((r) => [r.line, r]));
    const payload = matched.filter(ticked).map((m) => {
      const r = byLine.get(m.line) as ImportRow;
      if (m.status === "change") return { action: "change", card_id: m.card_id, unit_cost: r.unit_cost };
      return {
        action: "new", name: r.name, description: r.description, cost_type: r.cost_type, unit: r.unit, unit_cost: r.unit_cost,
        taxable: r.taxable, markup_pct: r.markup_pct, vendor_contact_id: vendorOf(r), vendor_sku: r.sku,
        qty_rule: rules[r.line] ?? r.qty_rule, rule_params: {}, group: r.group,
      };
    });
    try {
      const b = await call("/api/price-book/import", "POST", {
        kind: file?.kind, file_name: file?.name, source, rows: payload,
        unchanged: counts.same, skipped: matched.length - payload.length - counts.same,
      });
      const i = b.import as { created: number; updated: number; groups: number };
      onDone(`Imported ${file?.name}: ${i.created} new card${i.created === 1 ? "" : "s"}, ${i.updated} price change${i.updated === 1 ? "" : "s"}${i.groups ? `, ${i.groups} new group${i.groups === 1 ? "" : "s"}` : ""}.`);
      reset();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };
  const btn = (primary: boolean): React.CSSProperties => ({ height: 38, padding: "0 14px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
    letterSpacing: ".06em", background: primary ? T.ink : T.card, color: primary ? "#fff" : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer" });
  const sample = (col: number | null) => {
    if (col === null) return "";
    const r = table.slice(1).find((x) => x[col] !== null && x[col] !== undefined && String(x[col]).trim() !== "");
    return r ? String(r[col]).slice(0, 40) : "";
  };
  const shown = matched.filter((m) => filter === "all" || m.status === filter);
  const byLine = new Map(rows.map((r) => [r.line, r]));

  return (
    <Drawer open={open} onClose={close} wide title="Import into the Price book"
      sub={stage === "pick" ? "CSV or Excel — nothing is saved until you check the preview" : file ? `${file.name} · ${source}` : undefined}>
      <div ref={measure} className="px-4 py-3 mx-auto" style={{ maxWidth: 1180 }}>
        {err && <div className="mb-2 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: "#FBEAEA" }}>{err}</div>}

        {stage === "pick" && (
          <div className="flex flex-col gap-3" style={{ maxWidth: 520 }}>
            <p style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
              Export your cost catalog from JobTread or another CRM as a CSV or Excel file, or use any spreadsheet with a name, a unit and a cost per row.
              The file is read on this device. You&apos;ll see every row — new, a price change, the same, or skipped and why — before anything is saved.
            </p>
            <label className="block"><span style={eyebrow}>Where it&apos;s from</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={field}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select></label>
            <label className="flex items-center justify-center rounded" style={{ ...btn(true), height: 48, opacity: busy ? 0.5 : 1 }}>
              {busy ? "Reading…" : "Choose a file"}
              <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
                aria-label="Spreadsheet file" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void choose(f); }} />
            </label>
          </div>
        )}

        {stage === "map" && file && map && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 flex-wrap items-end">
              {file.sheets.length > 1 && (
                <label className="block" style={{ minWidth: 200 }}><span style={eyebrow}>Sheet</span>
                  <select value={sheetIdx} style={field} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); pickHeader(file.sheets[i].data, findHeader(file.sheets[i].data)); }}>
                    {file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.data.length} rows)</option>)}
                  </select></label>
              )}
              <label className="block" style={{ minWidth: 260, flex: 1, maxWidth: 520 }}><span style={eyebrow}>Header row</span>
                <select value={headerIdx} style={field} onChange={(e) => pickHeader(data, Number(e.target.value))}>
                  {data.slice(0, 10).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter((c) => c !== null && c !== "").slice(0, 4).map(String).join(" · ").slice(0, 70)}</option>)}
                </select></label>
              <span style={{ fontSize: F.xs, color: T.ink3 }}>{Math.max(0, table.length - 1)} rows under it</span>
            </div>

            <div>
              <div style={{ ...eyebrow, color: T.ink }}>Which column is which</div>
              <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: wide ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
                {TARGETS.map((t) => (
                  <label key={t} className="block rounded px-2 py-1.5" style={{ border: `1px solid ${t === "name" || t === "unit" ? (map[t] === null ? T.hiviz : T.hair) : T.hairSoft}` }}>
                    <span style={{ ...eyebrow, color: T.ink2 }}>{TARGET_LABEL[t]}{t === "name" || t === "unit" ? " · needed" : ""}</span>
                    <select value={map[t] ?? ""} aria-label={`Column for ${TARGET_LABEL[t]}`} style={field}
                      onChange={(e) => setMap({ ...map, [t]: e.target.value === "" ? null : Number(e.target.value) })}>
                      <option value="">— not in this file</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                    <span style={{ display: "block", fontSize: 9.5, color: T.ink3, ...clip }}>{map[t] !== null ? `e.g. ${sample(map[t]) || "(blank)"}` : " "}</span>
                  </label>
                ))}
              </div>
              {headers.some((_, i) => !Object.values(map).includes(i)) && (
                <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>
                  Not imported: {headers.filter((_, i) => !Object.values(map).includes(i)).map((h) => h || "(unnamed)").join(", ")}
                </div>
              )}
            </div>

            <div>
              <div style={{ ...eyebrow, color: T.ink }}>Vendors</div>
              <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 4 }}>
                Each name in the file, matched to someone you filed as a vendor. Nobody new is added — pick one, or leave it with no vendor.
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: wide ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
                {vendorNames.map((n) => (
                  <label key={n} className="flex items-center gap-2">
                    <span style={{ fontSize: F.sm, width: 170, ...clip }}>{n}</span>
                    <select value={vendorPick[n.toLowerCase()] ?? ""} aria-label={`Vendor for ${n}`} style={field}
                      onChange={(e) => setVendorPick((p) => ({ ...p, [n.toLowerCase()]: e.target.value }))}>
                      <option value="">No vendor</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || formatPhone(v.phone)}</option>)}
                    </select>
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  <span style={{ fontSize: F.sm, width: 170, color: T.ink2 }}>{vendorNames.length ? "Rows with none" : "Every row"}</span>
                  <select value={defaultVendor} aria-label="Vendor for rows with none" style={field} onChange={(e) => setDefaultVendor(e.target.value)}>
                    <option value="">No vendor</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || formatPhone(v.phone)}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { reset(); }} style={btn(false)}>Another file</button>
              <button onClick={() => setStage("preview")} disabled={map.name === null || map.unit === null}
                style={{ ...btn(true), opacity: map.name === null || map.unit === null ? 0.5 : 1 }}>Preview {Math.max(0, table.length - 1)} rows</button>
            </div>
          </div>
        )}

        {stage === "preview" && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Show">
              {(["all", "new", "change", "same", "skip"] as const).map((k) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className="rounded px-2.5"
                  style={{ height: 30, background: filter === k ? T.ink : T.card, color: filter === k ? "#fff" : T.ink2, border: `1px solid ${filter === k ? T.ink : T.hair}`,
                    fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
                  {k === "all" ? `All ${matched.length}` : `${STATUS_LABEL[k]} ${counts[k]}`}
                </button>
              ))}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>
              A price change updates the price only — your markup, group and how it&apos;s counted stay. &quot;Guess&quot; means the way it&apos;s counted on a job came from its unit; pick another if it&apos;s wrong.
            </div>

            {wide ? (
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, ...nums }}>
                <thead>
                  <tr style={{ background: T.slab }}>
                    {["", "", "Item", "Group", "Vendor", "Unit", "Unit cost", "Markup", "Counted on a job", ""].map((h, i) => (
                      <th key={i} style={{ ...eyebrow, textAlign: h === "Unit cost" || h === "Markup" ? "right" : "left", padding: "6px 6px", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => {
                    const r = byLine.get(m.line) as ImportRow;
                    const can = m.status === "new" || m.status === "change";
                    return (
                      <tr key={m.line} style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: can && !ticked(m) ? 0.5 : 1 }}>
                        <td style={{ padding: "4px 6px", width: 26 }}>
                          <input type="checkbox" disabled={!can} checked={ticked(m)} aria-label={`Import row ${m.line}`}
                            onChange={(e) => setUnticked((u) => ({ ...u, [m.line]: !e.target.checked }))} style={{ width: 16, height: 16, accentColor: T.chalk }} />
                        </td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}><span style={{ ...eyebrow, color: STATUS_COLOR[m.status] }}>{STATUS_LABEL[m.status]}</span></td>
                        <td style={{ padding: "4px 6px", maxWidth: 260 }}>
                          <div style={{ ...clip }}>{r.name ?? <span style={{ color: T.ink3 }}>(no name)</span>}</div>
                          <div style={{ fontSize: 9.5, color: T.ink3, ...clip }}>
                            row {m.line}{r.sku ? ` · #${r.sku}` : ""} · {COST_TYPE_LABEL[r.cost_type]}{!r.type_known && m.status !== "skip" ? <span style={{ color: T.hiviz }}> — type not recognised, filed as Other</span> : ""}
                          </div>
                        </td>
                        <td style={{ padding: "4px 6px", maxWidth: 150, ...clip }}>{r.group ?? "—"}</td>
                        <td style={{ padding: "4px 6px", maxWidth: 150, ...clip }}>{vendorName(vendorOf(r)) ?? <span style={{ color: T.ink3 }}>{r.vendor ? `${r.vendor} (none)` : "—"}</span>}</td>
                        <td style={{ padding: "4px 6px" }}>{r.unit ?? "—"}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {m.status === "change" && <span style={{ color: T.ink3, textDecoration: "line-through", marginRight: 4 }}>{m.old_cost === null ? "blank" : money(m.old_cost)}</span>}
                          {r.unit_cost === null ? <span style={{ color: T.hiviz }}>blank</span> : money(r.unit_cost)}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {r.markup_pct === null ? "—" : `${r.markup_pct}%`}{r.markup_from === "price" && <span style={{ fontSize: 9.5, color: T.ink3 }}> from price</span>}
                        </td>
                        <td style={{ padding: "2px 6px" }}>
                          {m.status === "new" ? (
                            <span className="flex items-center gap-1">
                              <select value={rules[m.line] ?? r.qty_rule} aria-label={`How row ${m.line} is counted`} style={{ ...field, height: 28, width: 190 }}
                                onChange={(e) => setRules((x) => ({ ...x, [m.line]: e.target.value as QtyRule }))}>
                                {QTY_RULES.map((q) => <option key={q} value={q}>{QTY_RULE_LABEL[q]}</option>)}
                              </select>
                              {!rules[m.line] && r.qty_rule !== "manual" && <span style={{ fontSize: 9.5, color: T.hiviz }}>guess</span>}
                            </span>
                          ) : <span style={{ fontSize: F.xs, color: T.ink3 }}>{m.status === "skip" ? "" : "kept"}</span>}
                        </td>
                        <td style={{ padding: "4px 6px", fontSize: F.xs, color: T.red }}>{m.why}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col">
                {shown.map((m) => {
                  const r = byLine.get(m.line) as ImportRow;
                  const can = m.status === "new" || m.status === "change";
                  return (
                    <label key={m.line} className="flex items-start gap-2 py-2" style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: can && !ticked(m) ? 0.5 : 1 }}>
                      <input type="checkbox" disabled={!can} checked={ticked(m)} aria-label={`Import row ${m.line}`}
                        onChange={(e) => setUnticked((u) => ({ ...u, [m.line]: !e.target.checked }))} style={{ width: 18, height: 18, marginTop: 2, accentColor: T.chalk }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: F.sm, fontWeight: 600, ...clip }}>{r.name ?? "(no name)"}</span>
                        <span style={{ display: "block", fontSize: 10, color: T.ink3, ...clip }}>
                          <span style={{ color: STATUS_COLOR[m.status], fontWeight: 600 }}>{STATUS_LABEL[m.status]}</span>
                          {" · "}{[r.group, vendorName(vendorOf(r)), m.status === "new" ? `${QTY_RULE_LABEL[rules[m.line] ?? r.qty_rule]}${!rules[m.line] && r.qty_rule !== "manual" ? " (guess)" : ""}` : null].filter(Boolean).join(" · ")}
                        </span>
                        {m.why && <span style={{ display: "block", fontSize: 10, color: T.red }}>{m.why}</span>}
                      </span>
                      <span className="text-right shrink-0" style={{ ...nums, fontSize: F.sm }}>
                        {m.status === "change" && <span style={{ display: "block", fontSize: 10, color: T.ink3, textDecoration: "line-through" }}>{m.old_cost === null ? "blank" : money(m.old_cost)}</span>}
                        {r.unit_cost === null ? "blank" : money(r.unit_cost)}<span style={{ fontSize: 10, color: T.ink3 }}>/{r.unit ?? "?"}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="sticky bottom-0 flex gap-2 items-center py-2 flex-wrap" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
              <button onClick={() => setStage("map")} style={btn(false)}>Back</button>
              <button onClick={() => void submit()} disabled={busy || nNew + nChange === 0}
                style={{ ...btn(true), opacity: busy || nNew + nChange === 0 ? 0.5 : 1 }}>
                {busy ? "Importing…" : `Import ${nNew + nChange}`}
              </button>
              <span style={{ fontSize: F.xs, color: T.ink3 }}>{nNew} new · {nChange} price change{nChange === 1 ? "" : "s"} · {counts.same} the same · {counts.skip} skipped</span>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
