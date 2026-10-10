"use client";
/**
 * Details from the plans on one budget section (Coy, 2026-10-09: "the section
 * cuts are going to have the depth and the shape of the footings, how much rebar,
 * what size rebar, where it goes … analyzed by me and the AI to do actual
 * takeoffs").
 *
 * Each clip made with Clip detail in Takeoffs (src/lib/plan-details.ts) shows
 * here. Tap one: the picture large, Open the sheet, and **Read it with AI** —
 * what the model reads off it, each value with the words it came from, a Use
 * button per section field (Coy's tap; nothing changes on its own), and the
 * quantities it works out against this section's own length or area, each
 * saying what it assumes.
 */
import React, { useState } from "react";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import type { FileRow } from "@/components/v34/files-panel";
import { detailQuantities, detailUses, barLabel, readDetailMarker, type DetailRead, type SectionShape } from "@/lib/plan-details";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const readOf = (f: FileRow) => ((f.facts as { detail?: DetailRead } | null)?.detail ?? null);

export function SectionDetails({ jobId, sectionName, shape, details, sheetName, onChange, onOpenSheet, onUse }: {
  jobId: string; sectionName: string | null; shape: SectionShape; details: FileRow[];
  sheetName: (sheetId: string) => string | null;
  onChange: (f: FileRow | null, removedId?: string) => void;
  onOpenSheet: (sheetId: string) => void;
  onUse: (patch: Record<string, unknown>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = details.find((d) => d.id === openId) ?? null;
  return (
    <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
      <div className="flex items-center gap-2">
        <span style={eyebrow}>Details from the plans{details.length ? ` · ${details.length}` : ""}</span>
        <span className="flex-1" />
        <a href={`/dashboard/scope/${jobId}/plans`} title="Open a drawing in Takeoffs → Files, then Clip detail" className="rounded px-2.5 flex items-center"
          style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, textDecoration: "none", ...eyebrow }}>
          + Clip
        </a>
      </div>
      {details.length > 0 && (
        <div className="grid gap-1.5 mt-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
          {details.map((f) => {
            const ref = readDetailMarker(f.source_url);
            const read = readOf(f);
            return (
              <button key={f.id} onClick={() => setOpenId(f.id)} className="rounded overflow-hidden text-left" title={f.name}
                style={{ border: `1px solid ${T.hair}`, background: "#fff", cursor: "pointer", padding: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                {f.url ? <img src={f.url} alt={f.name} style={{ width: "100%", height: 84, objectFit: "contain", display: "block" }} />
                  : <span className="flex items-center justify-center" style={{ height: 84, fontSize: F.xs, color: T.ink3 }}>saving…</span>}
                <span className="block px-1.5 py-0.5" style={{ background: T.card, fontSize: 10.5, color: T.ink2, borderTop: `1px solid ${T.hairSoft}`, ...clip }}>
                  {ref ? sheetName(ref.sheet_id) ?? "Sheet" : "Sheet"}{read ? " · read ✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {open && <DetailSheet f={open} sectionName={sectionName} shape={shape} sheetName={sheetName} onClose={() => setOpenId(null)}
        onChange={(f, removed) => { if (removed) setOpenId(null); onChange(f, removed); }} onOpenSheet={onOpenSheet} onUse={onUse} />}
    </div>
  );
}

function DetailSheet({ f, sectionName, shape, sheetName, onClose, onChange, onOpenSheet, onUse }: {
  f: FileRow; sectionName: string | null; shape: SectionShape; sheetName: (id: string) => string | null; onClose: () => void;
  onChange: (f: FileRow | null, removedId?: string) => void; onOpenSheet: (sheetId: string) => void; onUse: (patch: Record<string, unknown>) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const ref = readDetailMarker(f.source_url);
  const read = readOf(f);
  const readIt = async () => {
    setBusy("Reading the drawing… (up to a minute)"); setErr(null);
    try { const b = await call(`/api/files/${f.id}/detail`, "POST"); onChange(b.file as FileRow); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this clip? The sheet itself stays.")) return;
    setBusy("Deleting…"); setErr(null);
    try { await call(`/api/files/${f.id}`, "DELETE"); onChange(null, f.id); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };
  const btn: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", fontFamily: disp, fontWeight: 600, fontSize: F.sm };
  const sheet = ref ? sheetName(ref.sheet_id) : null;
  const uses = read ? detailUses(read, shape) : [];
  const q = read ? detailQuantities(read, shape) : null;
  return (
    <Sheet open onClose={onClose} title={`Detail${sheet ? ` · ${sheet}` : ""}`} sub={`On ${sectionName || "this section"}`}>
      <div className="px-3 pb-4 flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        {f.url && <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} style={{ width: "100%", background: "#fff", border: `1px solid ${T.hair}`, borderRadius: 4, display: "block" }} /></a>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void readIt()} disabled={!!busy || !f.url} style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: `1px solid ${T.hiviz}`, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {busy?.startsWith("Reading") ? busy : read ? "Read it again" : "Read it with AI"}
          </button>
          {ref && <button onClick={() => { onClose(); onOpenSheet(ref.sheet_id); }} style={btn}>Open the sheet ›</button>}
          <span className="flex-1" />
          <button onClick={() => void remove()} disabled={!!busy} style={{ ...btn, color: T.red }}>Delete clip</button>
        </div>
        {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
        {read && (
          <>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>Read off the drawing by AI — check each against the clip before you use it.</div>
            <Reading read={read} />
            {uses.length > 0 && (
              <div>
                <div style={eyebrow}>Put on the section</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {uses.map((u) => (
                    <button key={u.key} onClick={() => { onUse(u.patch); setUsed((s) => new Set(s).add(u.key)); }} style={{ ...btn, height: 30, fontSize: F.xs }}
                      title={u.key === "rebar" ? String(u.patch.rebar) : undefined}>
                      {used.has(u.key) ? "✓ " : "Use "}{u.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {q && (q.lines.length > 0 || q.missing.length > 0) && (
              <div>
                <div style={eyebrow}>Worked out for this section</div>
                <table className="w-full mt-1" style={{ fontSize: F.sm, borderCollapse: "collapse" }}>
                  <tbody>
                    {q.lines.map((l) => (
                      <tr key={l.label} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                        <td className="py-1 pr-2" style={{ verticalAlign: "top" }}>{l.label}<div style={{ fontSize: F.xs, color: T.ink3 }}>{l.basis}</div></td>
                        <td className="py-1 text-right" style={{ verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600, ...nums }}>{l.qty.toLocaleString()} {l.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {q.missing.length > 0 && <div className="mt-1" style={{ fontSize: F.xs, color: T.ink3 }}>Needs {q.missing.join("; ")}.</div>}
                <div className="mt-1" style={{ fontSize: F.xs, color: T.ink3 }}>Not on the budget — add the items from the Price book with these counts.</div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function Reading({ read }: { read: DetailRead }) {
  const rows: Array<[string, string, string]> = [];
  if (read.title) rows.push(["Detail", read.title, ""]);
  const dim = (label: string, r: DetailRead["width_in"], unit = '"') => { if (r) rows.push([label, `${r.value}${unit}`, r.quote]); };
  dim("Width", read.width_in); dim("Depth", read.depth_in); dim("Slab", read.slab_in); dim("Base", read.base_in); dim("Concrete", read.psi, " psi");
  for (const b of read.bars) rows.push(["Bars", barLabel(b), b.quote]);
  for (const m of read.mesh) rows.push(["Mesh", m.spec, m.quote]);
  if (read.vapor) rows.push(["Vapor barrier", read.vapor, ""]);
  for (const n of read.notes) rows.push(["Note", n, ""]);
  if (!rows.length) return <div style={{ fontSize: F.sm, color: T.ink3 }}>Nothing about the concrete could be read off this clip. Try a tighter box round the detail.</div>;
  return (
    <table className="w-full" style={{ fontSize: F.sm, borderCollapse: "collapse" }}>
      <tbody>
        {rows.map(([k, v, quote], i) => (
          <tr key={i} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
            <td className="py-1 pr-2" style={{ color: T.ink3, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
            <td className="py-1" style={{ verticalAlign: "top" }}>{v}{quote && quote !== v ? <div style={{ fontSize: F.xs, color: T.ink3 }}>“{quote}”</div> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
