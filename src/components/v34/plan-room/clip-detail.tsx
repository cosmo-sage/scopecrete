"use client";
/**
 * Clip detail — the bar under a drawing in Takeoffs' large reader once a box is
 * dragged round a section cut or detail (Coy, 2026-10-09). Pick the budget
 * section it belongs to (or name a new one) and Save: the box is drawn sharp
 * from the PDF (renderRegion), shrunk to a JPEG and filed on that section with
 * the sheet and box it came from (src/lib/plan-details.ts). It shows under the
 * section on the job page, where AI can read it.
 */
import React, { useEffect, useState } from "react";
import { T, F, disp } from "@/lib/v34/tokens";
import { openPdf, renderRegion } from "@/lib/pdf";
import { sendBytes } from "@/components/v34/files-panel";
import { clipScale, type DetailBox } from "@/lib/plan-details";
import { call, sheetLabel, type Sheet } from "./shared";

const NEW = "__new";

export function ClipBar({ jobId, sheet, url, box, onDone, onCancel }: {
  jobId: string; sheet: Sheet; url: string; box: DetailBox; onDone: (msg: string) => void; onCancel: () => void;
}) {
  const [sections, setSections] = useState<Array<{ id: string; name: string | null }> | null>(null);
  const [pick, setPick] = useState<string>(() => { try { return localStorage.getItem(`sc:clip-section:${jobId}`) ?? ""; } catch { return ""; } });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/sections`, "GET").then((b) => {
      if (off) return;
      const list = (b.sections ?? []) as Array<{ id: string; name: string | null }>;
      setSections(list);
      setPick((p) => (list.some((s) => s.id === p) ? p : list[0]?.id ?? NEW));
    }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [jobId]);

  const save = async () => {
    setErr(null);
    try {
      let sectionId = pick;
      let sectionName = sections?.find((s) => s.id === pick)?.name ?? null;
      if (pick === NEW) {
        if (!name.trim()) { setErr("Name the new section."); return; }
        setBusy("Making the section…");
        const made = await call(`/api/jobs/${jobId}/sections`, "POST", { name: name.trim() });
        sectionId = made.section.id; sectionName = made.section.name;
      }
      setBusy("Drawing the clip…");
      const doc = await openPdf(sheet.file_id, url);
      const canvas = await renderRegion(doc, sheet.page, box, clipScale(box));
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      canvas.width = 0; canvas.height = 0;
      if (!blob) throw new Error("couldn't make the picture");
      setBusy("Saving…");
      const fname = `Detail · ${sheetLabel(sheet)}${sheet.title ? ` ${sheet.title}` : ""}.jpg`.replace(/[/\\]/g, "-").slice(0, 180);
      const b = await call("/api/files", "POST", { name: fname, mime: "image/jpeg", size: blob.size, job_id: jobId, section_id: sectionId,
        detail: { sheet_id: sheet.id, ...box } });
      await sendBytes(b.upload.signed_url, new File([blob], fname, { type: "image/jpeg" }), () => {});
      await call(`/api/files/${b.file.id}/done`, "POST");
      try { localStorage.setItem(`sc:clip-section:${jobId}`, sectionId); } catch { /* fine */ }
      onDone(`Clipped onto ${sectionName || "the section"} · read it on the Budget`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const input: React.CSSProperties = { height: 34, borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 8px", minWidth: 0 };
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
      <span style={{ fontFamily: disp, fontWeight: 700, fontSize: F.sm, letterSpacing: ".06em", textTransform: "uppercase" }}>Clip to</span>
      <select aria-label="Budget section" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!sections || !!busy} style={{ ...input, flex: "1 1 160px" }}>
        {!sections && <option>Loading sections…</option>}
        {sections?.map((s, i) => <option key={s.id} value={s.id}>{s.name || `Section ${i + 1}`}</option>)}
        <option value={NEW}>+ New section…</option>
      </select>
      {pick === NEW && <input aria-label="New section's name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade beams" style={{ ...input, flex: "1 1 140px" }} />}
      <button onClick={onCancel} disabled={!!busy} style={{ ...input, cursor: "pointer", fontFamily: disp, fontWeight: 600 }}>Cancel</button>
      <button onClick={() => void save()} disabled={!!busy || !sections} style={{ ...input, cursor: "pointer", background: T.hiviz, color: T.onHiviz, border: `1px solid ${T.hiviz}`, fontFamily: disp, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
        {busy ?? "Save clip"}
      </button>
      {err && <div style={{ flexBasis: "100%", fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}
