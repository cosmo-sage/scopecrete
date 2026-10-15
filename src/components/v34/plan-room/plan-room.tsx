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
import { T, F } from "@/lib/v34/tokens";
import { sendBytes } from "@/components/v34/files-panel";
import { openPdf, readPlanPages } from "@/lib/pdf";
import { JobHeaderRow } from "@/components/v34/job-tabs";
import { mayAutoRead, ocrPending, pausePlanOcr, resumePlanOcrAllowed, startPlanOcr, usePlanOcr } from "@/lib/v34/plan-ocr-runner";
import { call, isDrawing, type Param, type PlanFile, type PlansData, type Sheet } from "./shared";
import { FilesStep } from "./files-sheets";
import { TakeoffStep } from "./takeoff";
import { SendSheet } from "./budget-step";
import { AddPlans } from "./add-plans";

// The Budget step moved to the job's Summary (Coy, 2026-10-06); an old ?step=budget link opens the room as usual.
// Satellite (was the Aerial drawer) sits between them (Coy, 2026-10-07); since 2026-10-08 it opens the
// Map page framing this job for a clip (Coy: "push the snipits from the map into the takeoffs tool …
// That can replace the current satellite page"), which comes back here on the new sheet. Later that
// day the tab went (Coy: "Satellite tab can be removed completely since we have the map page"):
// a clip comes from the Map's Clip for takeoff; an old ?step=satellite link still opens it.
// Since 2026-10-10 the two are separate job views (Coy: "take the 'Files' tab out of the 'Takeoffs'
// page and make it it's own page between Summary and Takeoffs" and "the 'measurements' tab will be
// merged with the main 'takeoffs' page since the takeoffs page will not have sub-tabs"): /files opens
// the files, /plans the drawing. An old ?step=files or ?step=sheets link on /plans goes to /files.
type Step = "files" | "takeoff";

export function PlanRoom({ jobId, view }: { jobId: string; view: Step }) {
  const router = useRouter();
  const sp = useSearchParams();
  const sheetParam = sp.get("sheet");
  const [data, setData] = useState<PlansData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSendingState] = useState<{ p: Param; ids?: string[]; whole?: boolean } | null>(null);
  const setSending = (p: Param, ids?: string[], whole?: boolean) => setSendingState({ p, ids, whole });
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(() => call(`/api/jobs/${jobId}/plans`, "GET")
    .then((d) => { setData(d as PlansData); setErr(null); })
    .catch((e) => setErr(e instanceof Error ? e.message : String(e))), [jobId]);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/plans`, "GET").then((d) => { if (!off) setData(d as PlansData); }).catch((e) => { if (!off) setErr(String(e.message ?? e)); });
    return () => { off = true; };
  }, [jobId]);
  const reload = useCallback(async () => { await load(); }, [load]);

  // A sheet opens on Takeoffs; from Files that is the other view.
  const go = useCallback((s: Step, sheet?: string | null) => {
    if (s === "files") { router.push(`/dashboard/scope/${jobId}/files`); return; }
    const q = new URLSearchParams(view === "takeoff" ? sp.toString() : "");
    q.delete("step");
    if (sheet) q.set("sheet", sheet); else if (sheet === null) q.delete("sheet");
    const qs = q.toString();
    const url = `/dashboard/scope/${jobId}/plans${qs ? `?${qs}` : ""}`;
    if (view === "takeoff") router.replace(url, { scroll: false }); else router.push(url);
  }, [router, sp, jobId, view]);
  useEffect(() => {
    const st = sp.get("step");
    if (view === "takeoff" && (st === "files" || st === "sheets")) router.replace(`/dashboard/scope/${jobId}/files${st === "sheets" ? "?step=sheets" : ""}`);
  }, [sp, router, jobId, view]);
  // An old ?step=satellite link opens the Map's clip for this job.
  useEffect(() => { if (sp.get("step") === "satellite") router.replace(`/dashboard/map?clip=${jobId}`); }, [sp, router, jobId]);

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

  // A plan PDF goes through Add plans first (Coy, 2026-10-14: JobTread's review — names and
  // scales read off each page, his to change before Save); photos and sketches go straight up.
  const [adding, setAdding] = useState<File[] | null>(null);
  const upload = useCallback(async (list: FileList) => {
    const all = Array.from(list);
    const pdfs = all.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdfs.length) setAdding(pdfs);
    const files = all.filter((f) => !pdfs.includes(f));
    if (!files.length) return;
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

  // Delete a file from Takeoffs → Files (Coy, 2026-10-09). The same delete as the Files page.
  const remove = useCallback(async (f: PlanFile) => {
    try { await call(`/api/files/${f.id}`, "DELETE"); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const inRoom = useMemo(() => new Set((data?.files ?? []).filter((f) => f.in_plan_room).map((f) => f.id)), [data]);
  const roomSheets: Sheet[] = useMemo(() => (data?.sheets ?? []).filter((s) => inRoom.has(s.file_id)), [data, inRoom]);
  // Drawings are measured; other pages are read (a spec page bound into a plan set). A page
  // something was already measured on stays a drawing.
  const measured = useMemo(() => new Set((data?.measurements ?? []).map((m) => m.sheet_id)), [data]);
  const sheets = useMemo(() => roomSheets.filter((s) => isDrawing(s) || measured.has(s.id)), [roomSheets, measured]);
  const docPages = useMemo(() => roomSheets.filter((s) => !isDrawing(s) && !measured.has(s.id)), [roomSheets, measured]);
  const scoped = data ? { ...data, sheets } : null;
  const current: Step = view;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - var(--sc-head))" }}>
      <div style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "10px 16px 0" }}>
        <JobHeaderRow jobId={jobId} active={view === "files" ? "files" : "plans"} title={data?.job?.title || (view === "files" ? "Files" : "Takeoffs")} customerId={data?.job?.customer_id} />
        {/* The reading chip on its own row under the name's row, only while there is one. */}
        <div className={`${(ocr.running && ocr.jobId === jobId) || (ocrInput && ocrInput.left.scans > 0) ? "flex" : "hidden"} items-end gap-x-4 gap-y-2 flex-wrap mt-2`}>
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
          </div>
        </div>
      </div>

      {err && <div className="px-4 py-2" style={{ background: T.redDim, color: T.red, fontSize: F.xs }}>{err}</div>}
      {!data && !err && <div className="p-5" style={{ fontSize: F.sm, color: T.ink3 }}>Opening {view === "files" ? "Files" : "Takeoffs"}…</div>}
      {data && scoped && (
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {current === "files" && <FilesStep files={data.files} sheets={sheets} docPages={docPages} reading={reading} onToggle={(f, on) => void toggle(f, on)} onDelete={(f) => void remove(f)} measured={measured}
            onAdd={(l) => void upload(l)} uploading={uploading} onOpen={(s) => go("takeoff", s.id)} jobId={jobId} onAdded={load} initial={sp.get("step") === "sheets" || roomSheets.length ? "sheets" : "files"} />}
          {current === "takeoff" && (
            <TakeoffStep jobId={jobId} data={scoped} files={data.files} sheetId={sheetParam} setSheetId={(id) => go("takeoff", id)}
              reload={reload} onSend={setSending} fullscreen={fullscreen} setFullscreen={setFullscreen} />
          )}
        </div>
      )}
      {adding && <AddPlans files={adding} jobId={jobId} onClose={() => setAdding(null)}
        onUploaded={(id) => { started.current.add(id); }} onDone={load} />}
      <SendSheet jobId={jobId} p={sending?.p ?? null} initial={sending?.ids} whole={sending?.whole} data={data} onClose={() => setSendingState(null)} onSent={() => void reload()} />
    </div>
  );
}
