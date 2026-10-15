"use client";

/**
 * Size rows on a section (migration 111, Coy 2026-10-15: "Build size rows").
 * Several sizes that add up, each with its own thickness; the section's size
 * is their total (plus its takeoffs when it follows them), written by the
 * server. Before 111 is applied the card says it waits for it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { rowQty, sizeTotals, type SizeMode, type SizeRow } from "@/lib/section-sizes";

type Row = SizeRow & { id: string };
type Sec = Record<string, unknown>;

const MODE_LABEL: Record<SizeMode, string> = { dims: "L × W", area: "Area", linear: "Linear ft", count: "Count" };
const n2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function SectionSizes({ jobId, sectionId, mode, concrete, takeoff, onSection, onRows }: {
  jobId: string; sectionId: string; mode: SizeMode; concrete: boolean;
  /** The section's takeoff total when it follows them, to show beside the rows. */
  takeoff: { unit: "SF" | "LF" | "EA" | null; total: number | null; depth_in: number | null } | null;
  onSection: (s: Sec) => void; onRows: (n: number) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // The card's callbacks change every render; keep the latest without refetching.
  const cb = useRef({ onSection, onRows });
  useEffect(() => { cb.current = { onSection, onRows }; });
  const url = `/api/jobs/${jobId}/sections/${sectionId}/sizes`;

  const take = useCallback((b: { rows?: Row[]; section?: Sec; supported?: boolean; error?: string; code?: string }) => {
    if (b.supported === false || b.code === "needs_111") { setSupported(false); setRows([]); cb.current.onRows(0); return; }
    if (b.error) { setErr(b.error); return; }
    setErr(null);
    const rs = (b.rows ?? []) as Row[];
    setRows(rs); cb.current.onRows(rs.length);
    if (b.section) cb.current.onSection(b.section);
  }, []);

  useEffect(() => {
    let live = true;
    fetch(url).then((r) => r.json()).then((b) => { if (live) take(b); }).catch(() => {});
    return () => { live = false; };
  }, [url, take]);

  const call = async (method: string, body?: unknown, q = "") => {
    const r = await fetch(url + q, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    take(await r.json().catch(() => ({ error: "Couldn't save." })));
  };
  const add = () => void call("POST", { mode, label: null });
  const save = (r: Row) => void call("PATCH", { ...r, row: r.id });
  const local = (id: string, p: Partial<Row>) => setRows((a) => (a ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)));

  if (rows === null) return null;
  if (!rows.length) {
    return (
      <div className="px-3 pt-1.5" style={{ fontSize: F.xs }}>
        <button onClick={add} disabled={!supported} title={supported ? "Add another size to this section — each with its own thickness, added together" : undefined}
          style={{ color: supported ? T.chalk : T.ink3, cursor: supported ? "pointer" : "default", fontWeight: 600 }}>
          + Add a size
        </button>
        {!supported && <span style={{ color: T.ink3 }}> · waits for migration 111</span>}
        {err && <span style={{ color: T.red }}> · {err}</span>}
      </div>
    );
  }

  const t = sizeTotals(rows, takeoff);
  const unit = t.kind === "EA" ? t.unit : t.kind;
  const inp = (v: number | null | undefined, w: number, on: (n: number | null) => void, blur: () => void, label: string) => (
    <input type="number" inputMode="decimal" aria-label={label} placeholder={label} value={v ?? ""} onBlur={blur}
      onChange={(e) => on(e.target.value === "" ? null : Number(e.target.value))}
      className="bg-transparent outline-none rounded px-1"
      style={{ width: w, height: 26, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm }} />
  );

  return (
    <div className="px-3 pt-2" style={{ fontSize: F.sm }}>
      <div style={{ fontSize: F.xs, color: T.ink3, fontWeight: 600, marginBottom: 4 }}>SIZES · added together</div>
      <div className="flex flex-col gap-1.5">
        {/* eslint-disable-next-line react-hooks/refs -- handlers read the ref, not render */}
        {rows.map((r, i) => {
          const q = t.rows[i] ?? rowQty(r);
          return (
            <div key={r.id} className="flex items-center gap-1.5 flex-wrap" style={{ opacity: q.counted ? 1 : 0.55 }}>
              <input defaultValue={r.label ?? ""} placeholder={`Size ${i + 1}`} aria-label="Name" maxLength={60}
                onBlur={(e) => { const l = e.target.value.trim() || null; if (l !== (r.label ?? null)) save({ ...r, label: l }); }}
                className="bg-transparent outline-none rounded px-1" style={{ width: 96, height: 26, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm }} />
              <select aria-label="Measured by" value={r.mode} onChange={(e) => save({ ...r, mode: e.target.value as SizeMode })}
                style={{ height: 26, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs }}>
                {(Object.keys(MODE_LABEL) as SizeMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
              {r.mode === "dims" && <>{inp(r.length_ft, 56, (n) => local(r.id, { length_ft: n }), () => save(r), "L ft")}<span>×</span>{inp(r.width_ft, 56, (n) => local(r.id, { width_ft: n }), () => save(r), "W ft")}</>}
              {r.mode === "area" && <>{inp(r.sqft, 72, (n) => local(r.id, { sqft: n }), () => save(r), "SF")}<span style={{ color: T.ink3, fontSize: F.xs }}>SF</span></>}
              {r.mode === "linear" && <>{inp(r.qty, 60, (n) => local(r.id, { qty: n }), () => save(r), "LF")}<span style={{ color: T.ink3, fontSize: F.xs }}>LF</span>
                {concrete && <>{inp(r.width_in, 46, (n) => local(r.id, { width_in: n }), () => save(r), "W in")}<span style={{ color: T.ink3, fontSize: F.xs }}>in wide</span></>}</>}
              {r.mode === "count" && <>{inp(r.qty, 56, (n) => local(r.id, { qty: n }), () => save(r), "How many")}
                <input defaultValue={r.unit ?? "EA"} aria-label="Unit" maxLength={12} onBlur={(e) => { const u = e.target.value.trim().toUpperCase() || "EA"; if (u !== r.unit) save({ ...r, unit: u }); }}
                  className="bg-transparent outline-none rounded px-1" style={{ width: 44, height: 26, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, textTransform: "uppercase" }} /></>}
              {concrete && r.mode !== "count" && <>{inp(r.depth_in, 46, (n) => local(r.id, { depth_in: n }), () => save(r), "in")}<span style={{ color: T.ink3, fontSize: F.xs }}>in thick</span></>}
              <span style={{ color: q.why ? T.red : T.ink2, fontSize: F.xs }}>
                {q.why ?? `${n2(q.qty ?? 0)} ${r.mode === "count" ? (r.unit || "EA") : r.mode === "linear" ? "LF" : "SF"}${q.cy !== null ? ` · ${n2(q.cy)} CY` : ""}`}
              </span>
              <button onClick={() => void call("DELETE", undefined, `?row=${r.id}`)} aria-label="Remove this size" title="Remove this size"
                style={{ color: T.ink3, cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
          );
        })}
        {t.takeoff && (
          <div style={{ fontSize: F.xs, color: t.takeoff.counted ? T.ink2 : T.ink3 }}>
            ƒ From takeoffs · {t.takeoff.qty === null ? "not counted yet" : `${n2(t.takeoff.qty)} ${takeoff?.unit}`}{t.takeoff.cy !== null ? ` · ${n2(t.takeoff.cy)} CY` : ""}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6, fontSize: F.xs }}>
        <button onClick={add} style={{ color: T.chalk, cursor: "pointer", fontWeight: 600 }}>+ Add a size</button>
        <span style={{ fontWeight: 600 }}>
          Total {t.total === null ? "—" : `${n2(t.total)} ${unit}`}
          {concrete && t.kind !== "EA" && (t.cy !== null ? ` · ${n2(t.cy)} CY` : " · yards need every thickness")}
        </span>
        {t.notes.map((n) => <span key={n} style={{ color: T.ink3 }}>{n}</span>)}
        {err && <span style={{ color: T.red }}>{err}</span>}
      </div>
    </div>
  );
}
