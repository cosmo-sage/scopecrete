"use client";
/**
 * The Plan Room (migration 059; Claude Design, design/plan-room) — a job's
 * plan set, its sheets, the takeoff, and its lines on the budget. Coy,
 * 2026-09-30: "scopecrete.ai will be a tool for me to do takeoffs manually."
 *
 * Files → Takeoff (Files and Sheets one step since 2026-10-05; the Budget step moved to the job's Summary 2026-10-06). A plan PDF put in the room is opened in
 * the browser with pdf.js; each page's title block is read
 * (src/lib/plan-sheets.ts) and stored as a sheet — a first reading, Coy's to
 * correct. Dusty stays docked and sees the takeoff (src/lib/dusty/context.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, disp, strong } from "@/lib/v34/tokens";
import { sendBytes } from "@/components/v34/files-panel";
import { openPdf, readPlanPages } from "@/lib/pdf";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { mayAutoRead, ocrPending, pausePlanOcr, resumePlanOcrAllowed, startPlanOcr, usePlanOcr } from "@/lib/v34/plan-ocr-runner";
import { call, isDrawing, type Param, type PlanFile, type PlansData, type Sheet } from "./shared";
import { FilesStep } from "./files-sheets";
import { TakeoffStep } from "./takeoff";
import { AerialPicker } from "./aerial-picker";
import { PhotosPanel } from "./photos-panel";
import { SendSheet } from "./budget-step";

// The Budget step moved to the job's Summary (Coy, 2026-10-06); an old ?step=budget link opens the room as usual.
type Step = "files" | "takeoff";
const STEPS: Array<[Step, string]> = [["files", "Files"], ["takeoff", "Takeoff"]];

export function PlanRoom({ jobId }: { jobId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  // ?step=sheets (old links) opens Files on its sheets.
  const step = (sp.get("step") === "sheets" ? "files" : STEPS.find(([k]) => k === sp.get("step"))?.[0] ?? null) as Step | null;
  const sheetParam = sp.get("sheet");
  const [data, setData] = useState<PlansData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSendingState] = useState<{ p: Param; ids?: string[] } | null>(null);
  const setSending = (p: Param, ids?: string[]) => setSendingState({ p, ids });
  const [fullscreen, setFullscreen] = useState(false);
  const [aerial, setAerial] = useState(false);
  const [photos, setPhotos] = useState(false);

  const load = useCallback(() => call(`/api/jobs/${jobId}/plans`, "GET")
    .then((d) => { setData(d as PlansData); setErr(null); })
    .catch((e) => setErr(e instanceof Error ? e.message : String(e))), [jobId]);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/plans`, "GET").then((d) => { if (!off) setData(d as PlansData); }).catch((e) => { if (!off) setErr(String(e.message ?? e)); });
    return () => { off = true; };
  }, [jobId]);
  const reload = useCallback(async () => { await load(); }, [load]);

  const go = useCallback((s: Step, sheet?: string | null) => {
    const q = new URLSearchParams(sp.toString());
    q.set("step", s);
    if (sheet) q.set("sheet", sheet); else if (sheet === null) q.delete("sheet");
    router.replace(`?${q.toString()}`, { scroll: false });
  }, [router, sp]);

  // Read each in-room PDF's pages once, the first time it is seen without sheets.
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!data) return;
    const todo = data.files.filter((f) => f.in_plan_room && f.kind === "pdf" && f.url && !data.sheets.some((s) => s.file_id === f.id) && !started.current.has(f.id));
    for (const f of todo) {
      started.current.add(f.id);
      openPdf(f.id, f.url as string)
        .then((doc) => readPlanPages(doc, (n, of) => setReading((r) => ({ ...r, [f.id]: `reading page ${n} of ${of}…` }))))
        .then((pages) => call(`/api/jobs/${jobId}/plans/sheets`, "POST", {
          file_id: f.id,
          sheets: pages.map((p) => ({
            page: p.page, page_w: p.page_w, page_h: p.page_h, number: p.number, title: p.title,
            discipline: p.discipline === "other" ? null : p.discipline,
            scale_text: p.scale?.text ?? null, printed_ft_per_pt: p.scale?.kind === "scale" ? p.scale.ft_per_pt : null,
          })),
        }))
        .then(() => { setReading((r) => { const x = { ...r }; delete x[f.id]; return x; }); return load(); })
        .catch((e) => setReading((r) => ({ ...r, [f.id]: `couldn't read it: ${e instanceof Error ? e.message : e}` })));
    }
  }, [data, jobId, load]);

  // Scanned drawings are read with OCR in the background (migration 064): title blocks, then
  // whole sheets. It keeps going if Coy leaves the page; the activity line shows where it is.
  // A sheet is read once. A desktop starts by itself; a phone only on a tap (it ran out of
  // memory on the 10,000-px scans), and Pause holds it for the rest of the tab.
  const ocr = usePlanOcr();
  const ocrInput = useMemo(() => {
    if (!data) return null;
    const room = new Set(data.files.filter((f) => f.in_plan_room && f.kind === "pdf" && f.url).map((f) => f.id));
    const urls = new Map(data.files.filter((f) => room.has(f.id)).map((f) => [f.id, f.url as string]));
    const drawings = data.sheets.filter((s) => room.has(s.file_id) && isDrawing(s));
    return { urls, drawings, left: ocrPending(drawings, urls) };
  }, [data]);
  const readPlans = useCallback(() => {
    if (!ocrInput?.drawings.length) return;
    resumePlanOcrAllowed(jobId);
    startPlanOcr({ id: jobId, title: data?.job?.title ?? null }, ocrInput.drawings, ocrInput.urls);
  }, [ocrInput, jobId, data?.job?.title]);
  useEffect(() => {
    if (!ocrInput || Object.keys(reading).length || !ocrInput.drawings.length || !mayAutoRead(jobId)) return;
    startPlanOcr({ id: jobId, title: data?.job?.title ?? null }, ocrInput.drawings, ocrInput.urls);
  }, [ocrInput, reading, jobId, data?.job?.title]);
  const ocrLeft = ocrInput ? ocrInput.left.titles.length + ocrInput.left.full.length : 0;
  // What it read shows up as it goes — a fresh look every few sheets, and at the end.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (ocr.jobId !== jobId) return;
    if (ocr.saved - lastSaved.current >= 4 || (!ocr.running && ocr.saved !== lastSaved.current)) { lastSaved.current = ocr.saved; void load(); }
  }, [ocr.saved, ocr.running, ocr.jobId, jobId, load]);

  const upload = useCallback(async (list: FileList) => {
    const files = Array.from(list);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploading(`Uploading ${f.name}${files.length > 1 ? ` (${i + 1} of ${files.length})` : ""}…`);
      try {
        const b0 = await call("/api/files", "POST", { name: f.name, mime: f.type, size: f.size, job_id: jobId, category: "plan", in_plan_room: true });
        await sendBytes(b0.upload.signed_url ?? b0.upload.url, f, (n) => setUploading(`Uploading ${f.name} — ${n}%`));
        await call(`/api/files/${b0.file.id}/done`, "POST");
      } catch (e) { setErr(`${f.name}: ${e instanceof Error ? e.message : e}`); }
    }
    setUploading(null);
    await load();
  }, [jobId, load]);

  const toggle = useCallback(async (f: PlanFile, on: boolean) => {
    setData((d) => d && { ...d, files: d.files.map((x) => (x.id === f.id ? { ...x, in_plan_room: on } : x)) });
    try { await call(`/api/files/${f.id}`, "PATCH", { in_plan_room: on }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); await load(); }
  }, [load]);

  const inRoom = useMemo(() => new Set((data?.files ?? []).filter((f) => f.in_plan_room).map((f) => f.id)), [data]);
  const roomSheets: Sheet[] = useMemo(() => (data?.sheets ?? []).filter((s) => inRoom.has(s.file_id)), [data, inRoom]);
  // Drawings are measured; other pages are read (a spec page bound into a plan set). A page
  // something was already measured on stays a drawing.
  const measured = useMemo(() => new Set((data?.measurements ?? []).map((m) => m.sheet_id)), [data]);
  const sheets = useMemo(() => roomSheets.filter((s) => isDrawing(s) || measured.has(s.id)), [roomSheets, measured]);
  const docPages = useMemo(() => roomSheets.filter((s) => !isDrawing(s) && !measured.has(s.id)), [roomSheets, measured]);
  const scoped = data ? { ...data, sheets } : null;
  const current = step ?? (roomSheets.length && data?.params.length && sheets.length ? "takeoff" : "files");
  const scaled = sheets.filter((s) => s.scale_ft_per_pt).length;
  const photoCount = (data?.files ?? []).filter((f) => f.kind === "image").length;
  const counts: Record<Step, string | null> = {
    files: (data?.files.length ?? 0) ? String(data?.files.length) : null,
    takeoff: data?.params.length ? String(data.params.length) : null,
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - var(--sc-head))" }}>
      <div style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "10px 16px 0" }}>
        <JobHeaderRow jobId={jobId} active="plans" title={data?.job?.title || "Plan room"} />
        {/* The steps on the left and the Plan Room's own tools at the far right, on one row
            under the name's row (Coy, 2026-10-05). */}
        <div className="flex items-end gap-x-4 gap-y-2 flex-wrap mt-2">
          <div className="flex gap-4 overflow-x-auto" role="tablist">
            {STEPS.map(([k, label], i) => (
              <button key={k} role="tab" aria-selected={current === k} onClick={() => go(k)} className="flex items-center gap-1.5 shrink-0"
                style={{ height: 38, borderBottom: `2px solid ${current === k ? T.hiviz : "transparent"}`, color: current === k ? T.ink : T.ink3, fontFamily: disp, fontSize: 14, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>
                <span style={{ width: 17, height: 17, borderRadius: 999, border: `1px solid currentColor`, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                {label}
                {counts[k] && <span style={{ fontFamily: strong, fontSize: 10.5, background: T.sunk, borderRadius: 999, padding: "0 6px", letterSpacing: 0 }}>{counts[k]}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end" style={{ paddingBottom: 4 }}>
          {ocr.running && ocr.jobId === jobId ? (
            <span className="flex items-center gap-1.5" title={ocr.label} style={{ fontSize: 11.5, borderRadius: 3, padding: "3px 8px", background: T.dustyTint, color: T.ink2, fontWeight: 600 }}>
              Reading {ocr.phase === "title" ? "sheet titles" : "the plans"} · {ocr.done + 1} of {ocr.total}
              <button onClick={() => pausePlanOcr(jobId)} style={{ color: T.chalk, cursor: "pointer", fontWeight: 600 }}>Pause</button>
            </span>
          ) : ocrInput && ocrInput.left.scans > 0 ? (
            <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, borderRadius: 3, padding: "3px 8px", background: T.slab, color: T.ink2, fontWeight: 600 }}>
              {ocrInput.left.read} of {ocrInput.left.scans} scanned sheets read
              {ocrLeft > 0 && <button onClick={readPlans} style={{ color: T.chalk, cursor: "pointer", fontWeight: 600 }}>Read the rest</button>}
            </span>
          ) : null}
          {sheets.length > 0 && (
            <span style={{ fontSize: 11.5, borderRadius: 3, padding: "3px 8px", background: scaled === sheets.length ? T.greenDim : T.sunDim, color: scaled === sheets.length ? T.green : T.sun, fontWeight: 600 }}>
              {scaled === sheets.length ? "✓ " : ""}{scaled} of {sheets.length} sheets scaled
            </span>
          )}
          <button onClick={() => setPhotos((v) => !v)} className="rounded flex items-center" title="The job's photos, and the ones the customer texted, beside the plans" aria-pressed={photos}
            style={{ height: 32, padding: "0 12px", background: photos ? T.ink : T.card, color: photos ? T.card : T.ink, border: `1px solid ${photos ? T.ink : T.hairStrong}`, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            Photos{photoCount ? ` · ${photoCount}` : ""}
          </button>
          <button onClick={() => setAerial(true)} className="rounded flex items-center" title="An overhead photo of the site to measure on"
            style={{ height: 32, padding: "0 12px", background: T.card, color: T.ink, border: `1px solid ${T.hairStrong}`, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            Aerial
          </button>
          <label className="rounded flex items-center" style={{ height: 32, padding: "0 12px", background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            <input type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf" className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
            ↑ Add plans
          </label>
          </div>
        </div>
      </div>

      {err && <div className="px-4 py-2" style={{ background: T.redDim, color: T.red, fontSize: F.xs }}>{err}</div>}
      {!data && !err && <div className="p-5" style={{ fontSize: F.sm, color: T.ink3 }}>Opening the plan room…</div>}
      {data && scoped && (
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {current === "files" && <FilesStep files={data.files} sheets={sheets} docPages={docPages} reading={reading} onToggle={(f, on) => void toggle(f, on)}
            onAdd={(l) => void upload(l)} uploading={uploading} onOpen={(s) => go("takeoff", s.id)} initial={sp.get("step") === "sheets" || (!step && roomSheets.length) ? "sheets" : "files"} />}
          {current === "takeoff" && (
            <TakeoffStep jobId={jobId} data={scoped} files={data.files} sheetId={sheetParam} setSheetId={(id) => go("takeoff", id)}
              reload={reload} onSend={setSending} fullscreen={fullscreen} setFullscreen={setFullscreen} onPhotos={() => setPhotos((v) => !v)} photosOpen={photos} />
          )}
        </div>
      )}
      {data && <PhotosPanel jobId={jobId} files={data.files} open={photos} onClose={() => setPhotos(false)} onAdded={load} over={fullscreen && current === "takeoff"} />}
      <AerialPicker jobId={jobId} open={aerial} onClose={() => setAerial(false)}
        onSaved={(sheetId) => { setAerial(false); void load().then(() => go("takeoff", sheetId)); }} />
      <SendSheet jobId={jobId} p={sending?.p ?? null} initial={sending?.ids} data={data} onClose={() => setSendingState(null)} onSent={() => void reload()} />
    </div>
  );
}
