"use client";
/**
 * Add plans — JobTread's review step (Coy, 2026-10-14: "take a lesson from how jobtread handles
 * plan uploads and autofills the names of the sheets and autoscales if there is a scale").
 *
 * The PDFs Coy picks are opened here, on his device, before anything is uploaded. Each page is a
 * row: a thumbnail (desktop), its name read off the title block ("C3.0 PAVING AND JOINTING PLAN"),
 * the scale it prints already picked (1" = 20'), a tick to keep it, and its status — Pending,
 * Reading, Read, or Scan (a scanned page has no words here; the scan reader names it after Save).
 * Autofill off leaves the names as "Plans.pdf (4)" and no scale. Everything is his to change, and
 * Save is his tap: the file is uploaded, its ticked pages become sheets with those names, and the
 * scale left picked is set on each sheet. Unticked pages are left out of Takeoffs.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, clip } from "@/lib/v34/tokens";
import { Toggle } from "@/components/v34/primitives";
import { sendBytes } from "@/components/v34/files-panel";
import { keepLocalPdf, localThumb, openLocalPdf, readPlanPage, releasePage, type Doc, type PageReading } from "@/lib/pdf";
import { choicesFor, NO_SCALE, placeholderName, scaleToSave, scaleValue, sheetName, splitName } from "@/lib/plan-upload";
import { call } from "./shared";

type Status = "pending" | "reading" | "read" | "scan" | "error";
interface Row { page: number; reading: PageReading | null; status: Status; thumb?: string; name?: string; scale?: string; keep: boolean }
interface PlanSet { key: string; file: File; doc: Doc | null; rows: Row[]; error?: string }

const coarse = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
const AUTOFILL_KEY = "sc:plans-autofill";

export function AddPlans({ files, jobId, onClose, onUploaded, onDone }: {
  files: File[]; jobId: string; onClose: () => void;
  /** A file is up — Takeoffs mustn't read it on its own while its sheets are being saved. */
  onUploaded: (fileId: string) => void;
  onDone: () => void | Promise<void>;
}) {
  const [sets, setSets] = useState<PlanSet[]>(() => files.map((f, i) => ({ key: `${i}:${f.name}`, file: f, doc: null, rows: [] })));
  const [autofill, setAutofillState] = useState(() => { try { return localStorage.getItem(AUTOFILL_KEY) !== "off"; } catch { return true; } });
  const setAutofill = (v: boolean) => { setAutofillState(v); try { localStorage.setItem(AUTOFILL_KEY, v ? "on" : "off"); } catch { /* ignore */ } };
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const patchRow = useCallback((key: string, page: number, p: Partial<Row>) =>
    setSets((ss) => ss.map((s) => (s.key !== key ? s : { ...s, rows: s.rows.map((r) => (r.page === page ? { ...r, ...p } : r)) }))), []);

  // Read every page's title block, one file and one page at a time; then the thumbnails.
  useEffect(() => {
    let off = false;
    (async () => {
      const opened: Array<{ key: string; doc: Doc; n: number }> = [];
      for (const s of sets) {
        let doc: Doc;
        try { doc = await openLocalPdf(s.file); }
        catch (e) {
          if (off) return;
          setSets((ss) => ss.map((x) => (x.key === s.key ? { ...x, error: `Couldn't open it here (${e instanceof Error ? e.message : e}). It will be uploaded and read in Takeoffs.` } : x)));
          continue;
        }
        if (off) { void doc.destroy(); return; }
        const n = doc.numPages;
        setSets((ss) => ss.map((x) => (x.key === s.key ? { ...x, doc, rows: Array.from({ length: n }, (_, i) => ({ page: i + 1, reading: null, status: "pending" as Status, keep: true })) } : x)));
        opened.push({ key: s.key, doc, n });
        for (let p = 1; p <= n; p++) {
          if (off) return;
          patchRow(s.key, p, { status: "reading" });
          try {
            const r = await readPlanPage(doc, p);
            if (off) return;
            patchRow(s.key, p, { reading: r, status: r.words ? "read" : "scan" });
          } catch { if (!off) patchRow(s.key, p, { status: "error" }); }
        }
      }
      // Thumbnails after the names: a scanned sheet is decoded whole to draw even a small one,
      // too much for a phone (Takeoffs draws none there either, 2026-10-07).
      if (coarse()) return;
      for (const o of opened) {
        for (let p = 1; p <= o.n; p++) {
          if (off) return;
          try {
            const t = await localThumb(o.doc, p, 120);
            if (!off) patchRow(o.key, p, { thumb: t });
          } catch { /* no picture — the row still saves */ }
          releasePage(o.doc, p);
        }
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, for the files picked
  }, []);
  const docs = useRef<Doc[]>([]);
  useEffect(() => { docs.current = sets.flatMap((s) => (s.doc ? [s.doc] : [])); }, [sets]);
  useEffect(() => () => { for (const d of docs.current) void d.destroy(); }, []);

  const nameOf = useCallback((r: Row) => {
    if (r.name !== undefined) return r.name;
    // Nothing read (a scan, or Autofill off): blank, with "Plans.pdf (4)" shown greyed in the box.
    return autofill && r.reading ? sheetName(r.reading.number, r.reading.title) : "";
  }, [autofill]);
  const scaleOf = useCallback((r: Row) => (r.scale !== undefined ? r.scale : autofill ? scaleValue(r.reading?.scale) : ""), [autofill]);

  const allRows = sets.flatMap((s) => s.rows);
  const total = allRows.length;
  const done = allRows.filter((r) => r.status !== "pending" && r.status !== "reading").length;
  const opening = sets.some((s) => !s.doc && !s.error);
  const ready = !opening && done === total;
  const kept = allRows.filter((r) => r.keep).length;
  const allOn = total > 0 && kept === total;
  const named = allRows.filter((r) => r.keep && r.reading && (r.name !== undefined || (autofill && sheetName(r.reading.number, r.reading.title)))).length;
  const scaled = allRows.filter((r) => r.keep && scaleOf(r) && scaleOf(r) !== NO_SCALE).length;
  const scans = allRows.filter((r) => r.status === "scan").length;

  const save = useCallback(async () => {
    setErr(null);
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const keep = s.rows.filter((r) => r.keep);
      const inRoom = !!s.error || keep.length > 0;
      const label = `${s.file.name}${sets.length > 1 ? ` (${i + 1} of ${sets.length})` : ""}`;
      try {
        setSaving(`Uploading ${label}…`);
        const b0 = await call("/api/files", "POST", { name: s.file.name, mime: s.file.type || "application/pdf", size: s.file.size, job_id: jobId, category: "plan", in_plan_room: inRoom });
        const fileId = b0.file.id as string;
        onUploaded(fileId);
        await sendBytes(b0.upload.signed_url ?? b0.upload.url, s.file, (n) => setSaving(`Uploading ${label} — ${n}%`));
        await call(`/api/files/${fileId}/done`, "POST");
        void keepLocalPdf(fileId, s.file);
        if (s.error || !keep.some((r) => r.reading)) continue;
        setSaving(`Saving ${keep.length} sheet${keep.length === 1 ? "" : "s"} of ${label}…`);
        await call(`/api/jobs/${jobId}/plans/sheets`, "POST", {
          file_id: fileId,
          sheets: keep.filter((r) => r.reading).map((r) => {
            const p = r.reading as PageReading;
            const typed = r.name !== undefined;
            const read = autofill ? { number: p.number, title: p.title } : { number: null, title: null };
            const nm = typed ? splitName(r.name as string) : read;
            const sc = scaleToSave(scaleOf(r), p.scale);
            return {
              page: p.page, page_w: p.page_w, page_h: p.page_h, number: nm.number, title: nm.title,
              discipline: p.discipline === "other" ? null : p.discipline,
              scale_text: p.scale?.text ?? null, printed_ft_per_pt: p.scale?.kind === "scale" ? p.scale.ft_per_pt : null,
              ...(typed && (nm.number || nm.title) ? { named: true } : {}),
              ...(sc ?? {}),
            };
          }),
        });
      } catch (e) {
        if (alive.current) { setErr(`${s.file.name}: ${e instanceof Error ? e.message : e}`); setSaving(null); }
        await onDone();
        return;
      }
    }
    await onDone();
    if (alive.current) { setSaving(null); onClose(); }
  }, [sets, jobId, autofill, scaleOf, onUploaded, onDone, onClose]);

  const setAll = (on: boolean) => setSets((ss) => ss.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, keep: on })) })));
  const progress = useMemo(() => {
    if (opening && !total) return "Opening the plans…";
    if (!ready) return `Reading ${Math.min(done + 1, total)} of ${total} pages`;
    const bits = [`${kept} of ${total} page${total === 1 ? "" : "s"}`];
    if (autofill) bits.push(`${named} named`, `${scaled} scaled`);
    if (scans) bits.push(`${scans} scanned — named after saving`);
    return bits.join(" · ");
  }, [opening, ready, done, total, kept, autofill, named, scaled, scans]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center" style={{ background: "rgba(18,22,26,.44)" }}
      onClick={() => { if (!saving) onClose(); }}>
      <div role="dialog" aria-label="Add plans" onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full sm:rounded-lg overflow-hidden"
        style={{ maxWidth: 640, maxHeight: "100%", height: "100dvh", background: T.card, borderTop: `4px solid ${T.hiviz}`, boxShadow: "0 18px 50px rgba(10,14,18,.3)" }}>
        <div className="flex items-center gap-3 px-4 shrink-0" style={{ minHeight: 52, borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ flex: 1, fontFamily: disp, fontSize: F.lg, fontWeight: 600 }}>Add plans</div>
          <button onClick={onClose} disabled={!!saving} className="rounded px-3" style={{ minHeight: 34, border: `1px solid ${T.hair}`, fontSize: F.sm, opacity: saving ? 0.5 : 1 }}>× Close</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ background: T.sunk }}>
          <label className="flex items-center gap-2 px-1 py-1.5" style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.hivizText }}>
            <input type="checkbox" checked={allOn} disabled={!total} onChange={(e) => setAll(e.target.checked)} style={{ width: 16, height: 16 }} />
            New plans
          </label>
          {sets.map((s) => (
            <div key={s.key}>
              {sets.length > 1 && <div className="px-1 pt-2 pb-1" style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{s.file.name}</div>}
              {s.error && <div className="rounded p-3 mb-2" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, color: T.ink2 }}>{s.error}</div>}
              {!s.error && !s.doc && <div className="rounded p-3 mb-2" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, color: T.ink3 }}>Opening {s.file.name}…</div>}
              {s.rows.map((r) => (
                <PageRow key={r.page} row={r} name={nameOf(r)} scale={scaleOf(r)} disabled={!!saving}
                  placeholder={placeholderName(s.file.name, r.page)}
                  onKeep={(v) => patchRow(s.key, r.page, { keep: v })}
                  onName={(v) => patchRow(s.key, r.page, { name: v })}
                  onScale={(v) => patchRow(s.key, r.page, { scale: v })} />
              ))}
            </div>
          ))}
        </div>

        <div className="shrink-0 px-4 pt-2" style={{ borderTop: `1px solid ${T.hair}`, paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: F.xs, fontWeight: 600, color: T.ink2, whiteSpace: "nowrap" }}>{saving ?? progress}</span>
            {!ready && total > 0 && (
              <span className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: T.hair }}>
                <span className="block h-full" style={{ width: `${Math.round((done / total) * 100)}%`, background: T.chalk, transition: "width .2s" }} />
              </span>
            )}
          </div>
          {err && <div className="mt-1" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
          <div className="flex items-center gap-2 mt-1">
            <div style={{ flex: 1 }}><Toggle on={autofill} onChange={setAutofill} label="Autofill names and scales" /></div>
            <button onClick={onClose} disabled={!!saving} className="rounded px-3" style={{ minHeight: 36, border: `1px solid ${T.hair}`, fontSize: F.sm, opacity: saving ? 0.5 : 1 }}>Cancel</button>
            <button onClick={() => void save()} disabled={!ready || !!saving}
              className="rounded px-4" style={{ minHeight: 36, background: T.hiviz, color: T.onHiviz, fontWeight: 600, fontSize: F.sm, opacity: !ready || saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "✓ Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageRow({ row, name, scale, placeholder, disabled, onKeep, onName, onScale }: {
  row: Row; name: string; scale: string; placeholder: string; disabled: boolean;
  onKeep: (v: boolean) => void; onName: (v: string) => void; onScale: (v: string) => void;
}) {
  const r = row.reading;
  const letter = r ? Math.max(r.page_w, r.page_h) < 1150 : false;
  const choices = choicesFor(r?.scale);
  const status: Record<Status, { t: string; c: string }> = {
    pending: { t: "◷ Pending", c: T.sun },
    reading: { t: "↻ Reading", c: T.chalk },
    read: { t: "✓ Read", c: T.green },
    scan: { t: "Scan · named after Save", c: T.ink3 },
    error: { t: "Couldn't read", c: T.red },
  };
  const st = status[row.status];
  return (
    <div className="flex items-stretch gap-2 mb-2" style={{ opacity: row.keep ? 1 : 0.55 }}>
      <label className="flex items-center justify-center rounded shrink-0" style={{ width: 34, background: T.card, border: `1px solid ${T.hair}` }}>
        <input type="checkbox" checked={row.keep} disabled={disabled} onChange={(e) => onKeep(e.target.checked)} aria-label={`Keep page ${row.page}`} style={{ width: 16, height: 16 }} />
      </label>
      <div className="flex-1 min-w-0 flex gap-2.5 rounded p-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="relative shrink-0 rounded overflow-hidden hidden sm:flex items-center justify-center" style={{ width: 84, height: 58, background: T.sunk, border: `1px solid ${T.hair}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn here */}
          {row.thumb ? <img src={row.thumb} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} /> : null}
          <span className="absolute rounded-sm px-1" style={{ right: 2, bottom: 2, background: T.dark, color: "#fff", fontSize: 10, fontWeight: 700 }}>{row.page}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="sm:hidden shrink-0 rounded-sm px-1" style={{ background: T.dark, color: "#fff", fontSize: 10, fontWeight: 700 }}>{row.page}</span>
            <input value={name} disabled={disabled} placeholder={placeholder} onChange={(e) => onName(e.target.value)} aria-label={`Name of page ${row.page}`}
              className="flex-1 min-w-0 rounded px-2" style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, color: T.ink }} />
          </div>
          <div className="flex items-center gap-2">
            <select value={scale} disabled={disabled} onChange={(e) => onScale(e.target.value)} aria-label={`Scale of page ${row.page}`}
              className="rounded px-1.5" style={{ height: 30, minWidth: 0, flex: "0 1 210px", border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, color: scale ? T.ink : T.ink3 }}>
              <option value="">Select scale</option>
              <option value={NO_SCALE}>No scale</option>
              {choices.map((c) => <option key={c.value} value={c.value}>{c.label}{r?.scale?.kind === "scale" && scaleValue(r.scale) === c.value ? " · printed" : ""}</option>)}
            </select>
            {scale && <button onClick={() => onScale("")} disabled={disabled} aria-label="Clear the scale" className="shrink-0" style={{ fontSize: F.sm, color: T.ink3, width: 22 }}>×</button>}
            {letter && <span className="shrink-0" style={{ fontSize: 10.5, color: T.ink3 }}>page to read</span>}
            <span className="ml-auto text-right" style={{ fontSize: F.xs, fontWeight: 600, color: st.c, ...clip }}>{st.t}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
