"use client";
/**
 * Photos of one takeoff shape's area (migration 069; Coy, 2026-10-03: "attach
 * photos to the takeoff sections to pull right into the budget section
 * groups. This way the customer can easily understand what this section is
 * covering. They will have the map view + photos for that map area").
 *
 * Tick the job's photos that show this shape's area, or take / add new ones.
 * A ticked photo is a job file with takeoff_measurement_id set: it shows under
 * the section the shape is counted in, and on the proposal beside the map.
 */
import React, { useState } from "react";
import { T, F, disp, clip } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { sendBytes } from "@/components/v34/files-panel";
import { call, type PlanFile } from "./shared";

export function ShapePhotos({ jobId, shapeId, shapeName, files, open, onClose, onChanged }: {
  jobId: string; shapeId: string; shapeName: string; files: PlanFile[]; open: boolean; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const photos = files.filter((f) => f.kind === "image" && f.url);
  const set = async (id: string, on: boolean) => {
    setBusy(id); setErr(null);
    try { await call(`/api/files/${id}`, "PATCH", { takeoff_measurement_id: on ? shapeId : null }); await onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const add = async (list: FileList) => {
    setErr(null);
    for (const f of Array.from(list)) {
      setBusy(`Adding ${f.name}…`);
      try {
        const b = await call("/api/files", "POST", { name: f.name, mime: f.type, size: f.size, job_id: jobId, category: "photo" });
        await sendBytes(b.upload.signed_url ?? b.upload.url, f, (n) => setBusy(`Adding ${f.name} — ${n}%`));
        await call(`/api/files/${b.file.id}/done`, "POST");
        await call(`/api/files/${b.file.id}`, "PATCH", { takeoff_measurement_id: shapeId });
      } catch (e) { setErr(`${f.name}: ${e instanceof Error ? e.message : e}`); }
    }
    setBusy(null);
    await onChanged();
  };
  const mine = photos.filter((f) => f.takeoff_measurement_id === shapeId).length;
  return (
    <Sheet open={open} onClose={onClose} title={`Photos of ${shapeName}`} sub={`${mine} on this shape · they show on its budget section and the proposal`}>
      <div className="px-3 pb-3">
        <label className="flex items-center justify-center rounded" style={{ height: 40, border: `1px dashed ${T.hairStrong}`, cursor: "pointer", fontFamily: disp, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", fontSize: F.sm }}>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ""; }} />
          {busy && busy.startsWith("Adding") ? busy : "+ Take or add photos"}
        </label>
        {!photos.length && <div className="mt-2" style={{ fontSize: F.sm, color: T.ink3 }}>No photos on this job yet. Add some above, or bring in the ones the customer texted from Files → Photos.</div>}
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
          {photos.map((f) => {
            const on = f.takeoff_measurement_id === shapeId;
            const other = !!f.takeoff_measurement_id && !on;
            return (
              <button key={f.id} onClick={() => void set(f.id, !on)} disabled={!!busy} aria-pressed={on} title={other ? "On another shape — tick to move it here" : f.name}
                className="rounded overflow-hidden text-left" style={{ border: `2px solid ${on ? T.hiviz : T.hair}`, background: T.sunk, cursor: "pointer", opacity: busy === f.id ? 0.5 : 1, padding: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url ?? ""} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                <div className="px-1.5 py-1 flex items-center gap-1" style={{ background: T.card, fontSize: 10.5 }}>
                  <span style={{ flex: 1, minWidth: 0, ...clip, color: T.ink2 }}>{f.name}</span>
                  <span style={{ fontWeight: 700, color: on ? T.hivizText : T.ink3 }}>{on ? "✓" : other ? "other" : "+"}</span>
                </div>
              </button>
            );
          })}
        </div>
        {err && <div className="mt-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      </div>
    </Sheet>
  );
}
