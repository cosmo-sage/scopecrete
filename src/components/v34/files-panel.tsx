"use client";

/**
 * Files on a job or a person (migration 045). Coy, 2026-09-29: "I need to be
 * able to upload documents and photos for Dusty to parse."
 *
 * - Add: camera or library on a phone (many at once), drag and drop on a
 *   desktop. Bytes go straight to storage on a signed upload link, with
 *   progress; a failed one can be retried.
 * - A grid: photos as thumbnails, documents as tiles. Filters: All · Photos ·
 *   Documents · From texts (the photos that person texted — message_media).
 * - Tap one: see it, rename it, say what it is, move it to an area, put it on
 *   the proposal, delete it. Dusty's read shows here once he has read it.
 *
 * One component, on the job page and the customer / vendor page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { CATEGORIES, CATEGORY_LABEL, sizeLabel, type Category } from "@/lib/files";

export interface FileRow {
  id: string; job_id: string | null; contact_id: string | null; section_id: string | null;
  name: string; kind: string; category: Category | null; mime_type: string | null; byte_size: number | null;
  note: string | null; show_on_proposal: boolean; page_count: number | null;
  fetch_state: string | null; read_state: string | null; read_error: string | null;
  summary: string | null; facts: Record<string, unknown> | null; created_at: string; url: string | null;
  /** A photo of one takeoff shape's area (migration 069). */
  takeoff_measurement_id?: string | null;
}
interface Texted { id: string; message_id: string; kind: string | null; mime_type: string | null; received_at: string | null; url: string | null; on_job?: boolean }
interface Pending { key: string; file: File; pct: number; error: string | null }
type Filter = "all" | "photos" | "docs" | "texts";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** PUT the file to the signed upload link, reporting progress. */
export function sendBytes(url: string, file: File, onPct: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`upload failed (${x.status})`)));
    x.onerror = () => reject(new Error("upload failed — check the connection"));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    x.send(body);
  });
}

const READ_LABEL: Record<string, string> = {
  waiting: "Waiting for Dusty", reading: "Dusty is reading", read: "Read", failed: "Dusty couldn't read it", skipped: "Not read",
};

export function FilesPanel({ jobId, contactId, sectionId, sections, title = "Files", compact }: {
  jobId?: string; contactId?: string; sectionId?: string;
  /** The job's areas, to file a photo under one. */
  sections?: Array<{ id: string; name: string | null }>;
  title?: string; compact?: boolean;
}) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [texted, setTexted] = useState<Texted[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<FileRow | null>(null);
  const [drag, setDrag] = useState(false);
  const [tick, setTick] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  const [bringing, setBringing] = useState<string | null>(null);
  const bringTexted = async (ids: string[] | "all") => {
    if (!jobId) return;
    setBringing(ids === "all" ? "all" : ids[0]); setErr(null);
    try {
      const r = await call(`/api/jobs/${jobId}/texted-photos`, "POST", ids === "all" ? { all: true } : { media_ids: ids });
      const failed = (r.failed ?? []) as Array<{ reason: string }>;
      if (failed.length) setErr(`${failed.length} couldn't be added: ${failed[0].reason}`);
      setTick((n) => n + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBringing(null); }
  };

  const query = jobId ? `job_id=${jobId}` : `contact_id=${contactId}`;
  useEffect(() => {
    let off = false;
    call(`/api/files?${query}`, "GET")
      .then((b) => { if (!off) { setFiles(b.files as FileRow[]); setTexted(b.texted as Texted[]); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [query, tick]);

  // Dusty reads in the background — check back while anything is waiting on him.
  const waiting = (files ?? []).some((f) => f.read_state === "waiting" || f.read_state === "reading");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [waiting]);

  const upload = useCallback(async (p: Pending) => {
    const set = (patch: Partial<Pending>) => setPending((a) => a.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
    set({ error: null, pct: 0 });
    try {
      const made = await call("/api/files", "POST", {
        name: p.file.name, mime: p.file.type, size: p.file.size,
        job_id: jobId ?? null, contact_id: jobId ? null : contactId ?? null, section_id: sectionId ?? null,
      });
      await sendBytes(made.upload.signed_url, p.file, (pct) => set({ pct }));
      const done = await call(`/api/files/${made.file.id}/done`, "POST");
      setFiles((a) => [done.file as FileRow, ...(a ?? [])]);
      setPending((a) => a.filter((x) => x.key !== p.key));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [jobId, contactId, sectionId]);

  const add = (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const ps = picked.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, pct: 0, error: null }));
    setPending((a) => [...ps, ...a]);
    // A few at a time: a phone on one bar of signal shouldn't open twenty uploads.
    void (async () => { for (let i = 0; i < ps.length; i += 3) await Promise.all(ps.slice(i, i + 3).map(upload)); })();
  };

  const shown = useMemo(() => {
    const fs = files ?? [];
    if (filter === "photos") return fs.filter((f) => f.kind === "image" || f.kind === "video");
    if (filter === "docs") return fs.filter((f) => f.kind !== "image" && f.kind !== "video");
    if (filter === "texts") return [];
    return fs;
  }, [files, filter]);
  const count = (k: Filter) => k === "texts" ? texted.length
    : k === "photos" ? (files ?? []).filter((f) => f.kind === "image" || f.kind === "video").length
    : k === "docs" ? (files ?? []).filter((f) => f.kind !== "image" && f.kind !== "video").length
    : (files ?? []).length;

  return (
    <section aria-label={title} className="rounded" style={{ background: drag ? T.chalkDim : T.card, border: `1px ${drag ? "dashed" : "solid"} ${drag ? T.chalk : T.hair}` }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
      <div className="px-3 pt-2.5 flex items-center gap-2">
        <span style={{ ...eyebrow, color: T.ink }}>{title}</span>
        <span className="hidden lg:inline" style={{ fontSize: F.xs, color: T.ink3 }}>drop files here · Dusty reads them</span>
        <span className="flex-1" />
        <button onClick={() => input.current?.click()} className="rounded px-2.5"
          style={{ height: 30, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
          + Add photos / files
        </button>
        <input ref={input} type="file" multiple hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} aria-label="Choose files" />
      </div>

      {!compact && (
        <div className="px-3 pt-2 flex gap-1 flex-wrap">
          {([["all", "All"], ["photos", "Photos"], ["docs", "Documents"], ["texts", "From texts"]] as const).map(([k, l]) => {
            const n = count(k); const on = filter === k;
            return (
              <button key={k} onClick={() => setFilter(k)} disabled={!n && k !== "all"} className="rounded px-2"
                style={{ height: 26, background: on ? T.ink : T.card, color: on ? T.card : n ? T.ink2 : T.ink3, border: `1px solid ${on ? T.ink : T.hair}`,
                         fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", opacity: n || k === "all" ? 1 : 0.45, cursor: "pointer" }}>
                {l}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="px-3 pt-2 flex flex-col gap-1">
          {pending.map((p) => (
            <div key={p.key} className="flex items-center gap-2" style={{ fontSize: F.xs }}>
              <span style={{ flex: 1, minWidth: 0, color: p.error ? T.red : T.ink2, ...clip }}>{p.file.name}{p.error ? ` — ${p.error}` : ""}</span>
              {p.error ? (
                <>
                  <button onClick={() => void upload(p)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Retry</button>
                  <button onClick={() => setPending((a) => a.filter((x) => x.key !== p.key))} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>×</button>
                </>
              ) : (
                <span className="rounded overflow-hidden" style={{ width: 90, height: 5, background: T.hairSoft }} role="progressbar" aria-valuenow={p.pct}>
                  <span style={{ display: "block", height: "100%", width: `${p.pct}%`, background: T.chalk }} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {err && <div className="px-3 pt-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}

      <div className="p-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
        {files === null && [1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ aspectRatio: "1", background: T.hairSoft }} />)}
        {files !== null && filter !== "texts" && shown.length === 0 && pending.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: F.sm, color: T.ink3 }}>
            {filter === "all" ? "Nothing yet. Add photos, plans, specs or receipts — Dusty reads them." : "None of these."}
          </div>
        )}
        {filter !== "texts" && shown.map((f) => <FileTile key={f.id} f={f} onOpen={() => setOpen(f)} />)}
        {filter === "texts" && jobId && texted.some((m) => !m.on_job) && (
          <div className="flex items-center gap-2" style={{ gridColumn: "1 / -1", fontSize: F.xs, color: T.ink2 }}>
            <span style={{ flex: 1 }}>Bring a texted photo onto the job to use it in the Plan Room, under an area, or as the proposal&apos;s cover.</span>
            <button onClick={() => void bringTexted("all")} disabled={!!bringing}
              style={{ height: 28, padding: "0 10px", borderRadius: 3, background: T.ink, color: T.card, fontSize: F.xs, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: bringing ? 0.5 : 1 }}>
              {bringing === "all" ? "Bringing…" : `Add all ${texted.filter((m) => !m.on_job).length} to the job`}
            </button>
          </div>
        )}
        {filter === "texts" && texted.map((m) => <TextedTile key={m.id} m={m}
          onAdd={jobId && !m.on_job ? () => void bringTexted([m.id]) : undefined} busy={bringing === m.id || bringing === "all"} />)}
      </div>

      <FileViewer f={open} sections={sections} onClose={() => setOpen(null)}
        onSaved={(nf) => { setFiles((a) => (a ?? []).map((x) => (x.id === nf.id ? nf : x))); setOpen(nf); }}
        onDeleted={(id) => { setFiles((a) => (a ?? []).filter((x) => x.id !== id)); setOpen(null); }} />
    </section>
  );
}

export function FileTile({ f, onOpen }: { f: FileRow; onOpen: () => void }) {
  const img = f.kind === "image" && f.url;
  return (
    <button onClick={onOpen} className="rounded overflow-hidden text-left flex flex-col" title={f.name}
      style={{ border: `1px solid ${T.hair}`, background: T.slab, cursor: "pointer", aspectRatio: "1", position: "relative" }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={f.url as string} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="flex-1 flex flex-col justify-center items-center px-1.5 gap-1">
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: f.kind === "pdf" ? T.red : T.ink2 }}>{f.kind === "pdf" ? "PDF" : f.kind.toUpperCase()}</span>
          <span style={{ fontSize: 10, color: T.ink2, textAlign: "center", lineHeight: 1.2, maxHeight: 36, overflow: "hidden" }}>{f.name}</span>
        </span>
      )}
      <span className="absolute left-0 right-0 bottom-0 px-1.5 py-0.5" style={{ background: "rgba(18,22,26,.62)", color: "#fff", fontSize: 9.5, letterSpacing: ".04em", ...clip }}>
        {f.category ? CATEGORY_LABEL[f.category] : "File"}{f.read_state === "read" ? " · read" : f.read_state === "waiting" || f.read_state === "reading" ? " · …" : ""}
      </span>
    </button>
  );
}

function TextedTile({ m, onAdd, busy }: { m: Texted; onAdd?: () => void; busy?: boolean }) {
  const [url, setUrl] = useState(m.url);
  const [why, setWhy] = useState<string | null>(null);
  // Not copied yet: the thread's media route fetches it from Quo and stores it.
  useEffect(() => {
    if (url) return;
    let off = false;
    fetch(`/api/messages/${m.message_id}/media`).then((r) => r.json()).then((b) => {
      const it = (b.items ?? []).find((x: { id: string }) => x.id === m.id);
      if (!off) { if (it?.url) setUrl(it.url); else setWhy(it?.reason ?? "unavailable"); }
    }).catch(() => { if (!off) setWhy("unavailable"); });
    return () => { off = true; };
  }, [m.id, m.message_id, url]);
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="rounded overflow-hidden block"
      style={{ border: `1px solid ${T.hair}`, background: T.slab, aspectRatio: "1", position: "relative" }} title={m.received_at ? `Texted ${relTime(m.received_at)} ago` : "Texted"}>
      {url && (m.kind === "image" || (m.mime_type ?? "").startsWith("image/")) ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={url} alt="Texted photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="flex h-full items-center justify-center px-1.5 text-center" style={{ fontSize: 10, color: T.ink3 }}>{why ?? (url ? "Open" : "…")}</span>
      )}
      <span className="absolute left-0 right-0 bottom-0 px-1.5 py-0.5" style={{ background: "rgba(18,22,26,.62)", color: "#fff", fontSize: 9.5 }}>
        {m.on_job ? "On the job ✓" : `Texted${m.received_at ? ` · ${relTime(m.received_at)}` : ""}`}
      </span>
      {onAdd && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }} disabled={busy} aria-label="Add to the job"
          className="absolute rounded" style={{ top: 4, right: 4, padding: "2px 6px", background: T.hiviz, color: T.onHiviz, fontSize: 10.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
          {busy ? "…" : "+ Job"}
        </button>
      )}
    </a>
  );
}

export function FileViewer({ f, sections, onClose, onSaved, onDeleted, links }: {
  f: FileRow | null; sections?: Array<{ id: string; name: string | null }>;
  /** Extra doors at the top of the sheet (Documents: its job, their page). */
  links?: React.ReactNode;
  onClose: () => void; onSaved: (f: FileRow) => void; onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!f) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { const b = await call(`/api/files/${f.id}`, "PATCH", patch); onSaved(b.file as FileRow); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${f.name}? It can't be brought back.`)) return;
    setBusy(true);
    try { await call(`/api/files/${f.id}`, "DELETE"); onDeleted(f.id); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%" };
  // Price lines (read-files v2) are a table, not a fact: counted here, checked and imported in the Price book.
  const HIDDEN = new Set(["price_lines", "price_lines_from_photo"]);
  const facts = f.facts && typeof f.facts === "object" ? Object.entries(f.facts).filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) : [];
  const priceLines = Array.isArray(f.facts?.price_lines) ? (f.facts?.price_lines as unknown[]).length : 0;

  return (
    <Sheet open onClose={onClose} title={f.name} sub={`${f.category ? CATEGORY_LABEL[f.category] : "File"} · ${sizeLabel(f.byte_size)}${f.page_count ? ` · ${f.page_count} pages` : ""}`}>
      <div className="px-4 py-3 flex flex-col gap-3">
        {links}
        {f.url && f.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={f.url} alt={f.name} style={{ width: "100%", maxHeight: "50vh", objectFit: "contain", background: T.slab, borderRadius: 4 }} />
        )}
        {f.url && f.kind !== "image" && (
          <a href={f.url} target="_blank" rel="noreferrer" className="rounded px-3 flex items-center justify-center"
            style={{ height: 38, border: `1px solid ${T.hair}`, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", color: T.ink }}>Open {f.kind === "pdf" ? "the PDF" : "the file"}</a>
        )}

        <div className="rounded px-3 py-2" style={{ background: T.slab }}>
          <div style={{ ...eyebrow, color: T.ink3 }}>Dusty · {READ_LABEL[f.read_state ?? ""] ?? "Not read"}</div>
          {f.summary && <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.45, marginTop: 2 }}>{f.summary}</div>}
          {f.read_error && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>{f.read_error}</div>}
          {facts.length > 0 && (
            <div className="mt-1.5" style={{ fontSize: F.xs, color: T.ink2 }}>
              <div style={{ ...eyebrow, color: T.ink3 }}>What he noticed · suggestions, nothing changed</div>
              {facts.map(([k, v]) => <div key={k}>{k.replace(/_/g, " ")}: <b style={{ color: T.ink }}>{Array.isArray(v) ? v.join(", ") : String(v)}</b></div>)}
            </div>
          )}
          {priceLines > 0 && (
            <div className="mt-1.5" style={{ fontSize: F.xs, color: T.ink2 }}>
              {priceLines} price{priceLines === 1 ? "" : "s"} on it{f.facts?.price_lines_from_photo === true ? " (read from a photo — check each)" : ""}.{" "}
              <Link href="/dashboard/price-book" style={{ color: T.chalk }}>Check them against the Price book →</Link>
              <span style={{ display: "block", color: T.ink3 }}>Price book → Import → A vendor&apos;s quote → pick this vendor, then this file.</span>
            </div>
          )}
        </div>

        <label className="block"><span style={eyebrow}>Name</span>
          <input defaultValue={f.name} key={`n${f.id}`} style={field} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.name) void save({ name: v }); }} />
        </label>
        <label className="block"><span style={eyebrow}>What it is</span>
          <select value={f.category ?? ""} onChange={(e) => void save({ category: e.target.value || null })} style={field} disabled={busy}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        {sections && sections.length > 0 && (
          <label className="block"><span style={eyebrow}>Area</span>
            <select value={f.section_id ?? ""} onChange={(e) => void save({ section_id: e.target.value || null })} style={field} disabled={busy}>
              <option value="">Whole job</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name || "Unnamed area"}</option>)}
            </select>
          </label>
        )}
        <label className="block"><span style={eyebrow}>Note</span>
          <textarea defaultValue={f.note ?? ""} key={`t${f.id}`} rows={2} maxLength={2000}
            style={{ ...field, height: "auto", padding: "6px 8px", resize: "none" }}
            onBlur={(e) => { if ((e.target.value.trim() || null) !== (f.note ?? null)) void save({ note: e.target.value }); }} />
        </label>
        {f.job_id && (
          <label className="flex items-center gap-2" style={{ fontSize: F.sm }}>
            <input type="checkbox" checked={f.show_on_proposal} disabled={busy} onChange={(e) => void save({ show_on_proposal: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: T.chalk }} />
            Show on the proposal
          </label>
        )}
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <button onClick={() => void del()} disabled={busy} className="self-start" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Delete file</button>
      </div>
    </Sheet>
  );
}
