"use client";

/**
 * Files (renamed from Documents 2026-10-03; Coy: "one place for documents
 * and files and there is a badass search filter system to get anything
 * anytime"). Every file in one list, newest first. The search box finds the
 * words in them (the index from migration 054 — name, note, Dusty's read, the
 * document's own text) AND any name typed: a person, vendor, customer or job
 * by that name brings every file filed on them, each saying why it matched.
 * Filters: what it is, photo / PDF / other, how it came (uploaded, email,
 * texted), job, customer, vendor, person, and when (last N days or a range).
 * The whole filter lives in the address (`files-filter.ts`), so a view can be
 * linked; chips over the list show each one with ×. `?file=` opens one file.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime } from "@/lib/v34/tokens";
import { FileViewer, type FileRow } from "@/components/v34/files-panel";
import { EmailList } from "@/components/v34/email-sheet";
import { CATEGORY_LABEL, sizeLabel, type Category } from "@/lib/files";
import { EMPTY_FILTER, FILE_KINDS, FILE_SOURCES, SINCE_DAYS, activeChips, filterQuery, readFilter, type FileFilter } from "@/lib/files-filter";

type Facet = { id: string; name: string; n: number };
type Facets = { jobs: Facet[]; customers: Facet[]; vendors: Facet[]; people: Facet[] };

const CHIPS: Array<[string, string]> = [
  ["", "All"], ["photo", "Photos"], ["plan", "Plans"], ["spec", "Specs"], ["bid", "Bid invites"],
  ["vendor_quote", "Vendor quotes"], ["receipt", "Receipts"], ["contract", "Contracts"], ["proposal", "Proposals"], ["email", "Emails"], ["other", "Other"], ["unfiled", "Unfiled"],
];

/**
 * `fixed` pins filters (the customer page's Files tab pins its customer); `embedded`
 * drops the page title and leaves the address alone; `extra` sits beside the search.
 */
export function FilesPage({ fixed, embedded, extra }: { fixed?: Partial<FileFilter>; embedded?: boolean; extra?: React.ReactNode } = {}) {
  const base = useMemo(() => ({ ...EMPTY_FILTER, ...(fixed ?? {}) }), [fixed]);
  const [flt, setFlt] = useState<FileFilter>(base);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [fileParam, setFileParam] = useState<string | null>(null);
  const cat = flt.cat, qDeb = flt.q;
  /** Change the filter; the address follows, so the view can be linked or bookmarked. */
  const set = (patch: Partial<FileFilter>) => setFlt((f) => {
    const n = { ...f, ...patch, ...(fixed ?? {}) };
    if (!embedded) { const qs = filterQuery(n); window.history.replaceState(null, "", `/dashboard/files${qs ? `?${qs}` : ""}`); }
    return n;
  });
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [proposals, setProposals] = useState<Array<{ id: string; job_id: string; version: number; finalized_at: string; number: string | null; total: number | null; title: string | null; customer: string | null }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<FileRow | null>(null);
  const [emailParam, setEmailParam] = useState<string | null>(null);
  // Names seen so far, so a filter's list doesn't shrink to the one chosen.
  const [jobNames, setJobNames] = useState<Record<string, string>>({});
  const [peopleNames, setPeopleNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => { if (q.trim() !== flt.q) set({ q: q.trim() }); }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- set() only writes the filter
  }, [q]);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off || embedded) return;
      const sp = new URLSearchParams(window.location.search);
      setFileParam(sp.get("file"));
      const f = readFilter(sp);
      // ?email= opens one mirrored email (the job's Bid strip links here).
      const em = sp.get("email");
      if (em) { setEmailParam(em); f.cat = "email"; }
      setFlt(f); setQ(f.q); setCustom(!!(f.from || f.to));
    });
    return () => { off = true; };
  }, [embedded]);

  const url = useMemo(() => {
    const u = new URLSearchParams(filterQuery({ ...flt, cat: flt.cat === "email" ? "" : flt.cat, q: flt.q.length >= 2 ? flt.q : "" }));
    if (fileParam) u.set("file", fileParam);
    if (!facets) u.set("facets", "1");
    return `/api/files/search?${u}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- facets are asked for once
  }, [fileParam, flt]);

  useEffect(() => {
    let off = false;
    fetch(url)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => {
        if (off) return;
        const fs = b.files as FileRow[];
        setErr(null);
        setFiles(fs);
        setProposals(b.proposals ?? []);
        if (b.facets) setFacets(b.facets as Facets);
        setJobNames((m) => ({ ...m, ...Object.fromEntries((b.jobs as Array<{ id: string; name: string }>).map((j) => [j.id, j.name])) }));
        setPeopleNames((m) => ({ ...m, ...Object.fromEntries((b.people as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])) }));
        if (fileParam && fs.length === 1) setOpen(fs[0]);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [url, fileParam]);

  const clearFile = () => { setFileParam(null); const qs = filterQuery(flt); window.history.replaceState(null, "", `/dashboard/files${qs ? `?${qs}` : ""}`); };
  const names: Record<string, string> = { ...jobNames, ...peopleNames };
  for (const k of ["jobs", "customers", "vendors", "people"] as const) for (const x of facets?.[k] ?? []) names[x.id] = x.name;
  const chips = activeChips(flt, names, (c) => CHIPS.find(([k]) => k === c)?.[1] ?? c).filter((c) => !(fixed && c.key in fixed));
  const clearChip = (k: keyof FileFilter | "date") => {
    if (k === "q") setQ("");
    if (k === "date") { setCustom(false); set({ from: "", to: "" }); } else set({ [k]: "" } as Partial<FileFilter>);
  };
  const facetSelect = (k: "job" | "customer" | "vendor" | "contact", list: Facet[] | undefined, any: string) => (
    <select value={flt[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<FileFilter>)} aria-label={any} style={{ ...select, color: flt[k] ? T.ink : T.ink2 }}>
      <option value="">{any}</option>
      {(list ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.n})</option>)}
    </select>
  );
  const select: React.CSSProperties = { height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, borderRadius: 4, padding: "0 6px", maxWidth: 200 };

  return (
    <div className="mx-auto" style={{ maxWidth: 1000, padding: embedded ? 0 : "12px 12px 24px" }}>
      {!embedded && <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>Files</h1>}
      {!embedded && <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 8 }}>
        Every photo, plan, bid, quote, receipt and contract — uploaded, emailed or texted. Search finds the words inside them,
        or type any name: a person, vendor, customer or job brings up everything filed on them.
      </div>}

      <div className="flex gap-2 items-center">
      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (fileParam) clearFile(); }}
        placeholder="Words in a file, or a name — Wilson, Angelle, Burgess Ave…" aria-label="Search files"
        style={{ flex: 1, minWidth: 0, height: 36, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: F.sm, background: T.card }} />
      {extra}
      </div>

      <div className="flex gap-1 flex-wrap" style={{ marginTop: 8 }}>
        {CHIPS.filter(([k]) => !embedded || k !== "email").map(([k, l]) => {
          const on = cat === k;
          return (
            <button key={k || "all"} onClick={() => { set({ cat: k }); if (fileParam) clearFile(); }} aria-pressed={on} className="rounded px-2"
              style={{ height: 26, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: `1px solid ${on ? T.ink : T.hair}`,
                       fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>{l}</button>
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap items-center" style={{ marginTop: 8 }}>
        <select value={flt.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Type of file" style={select}>
          <option value="">Any type</option>
          {FILE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={flt.source} onChange={(e) => set({ source: e.target.value })} aria-label="How it came" style={select}>
          <option value="">Any way in</option>
          {FILE_SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {facetSelect("job", facets?.jobs, "Any job")}
        {!fixed?.customer && facetSelect("customer", facets?.customers, "Any customer")}
        {!fixed?.contact && facetSelect("vendor", facets?.vendors, "Any vendor")}
        {!fixed?.contact && facetSelect("contact", facets?.people, "Anyone")}
        <select value={custom ? "custom" : flt.since} aria-label="When" style={select}
          onChange={(e) => { const v = e.target.value; if (v === "custom") { setCustom(true); set({ since: "" }); } else { setCustom(false); set({ since: v, from: "", to: "" }); } }}>
          <option value="">Any time</option>
          {SINCE_DAYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="custom">Between dates…</option>
        </select>
        {custom && (
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink3 }}>
            <input type="date" value={flt.from} onChange={(e) => set({ from: e.target.value, since: "" })} aria-label="From" style={{ ...select, maxWidth: 150 }} />
            to
            <input type="date" value={flt.to} onChange={(e) => set({ to: e.target.value, since: "" })} aria-label="To" style={{ ...select, maxWidth: 150 }} />
          </span>
        )}
        {fileParam && <button onClick={clearFile} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Show all</button>}
        <span style={{ fontSize: F.xs, color: T.ink3, marginLeft: "auto" }}>{files ? `${files.length}${files.length === 300 ? "+" : ""} shown` : ""}</span>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-1 flex-wrap items-center" style={{ marginTop: 8 }} aria-label="Filters in use">
          {chips.map((c) => (
            <button key={c.key} onClick={() => clearChip(c.key)} aria-label={`Remove ${c.label}`} className="rounded-full"
              style={{ height: 24, padding: "0 6px 0 10px", border: `1px solid ${T.hiviz}`, background: T.hivizDim, color: T.hivizText, fontSize: F.xs, cursor: "pointer" }}>
              {c.label} <span aria-hidden="true" style={{ marginLeft: 2 }}>×</span>
            </button>
          ))}
          <button onClick={() => { setQ(""); setCustom(false); set({ ...base }); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", marginLeft: 4 }}>Clear all</button>
        </div>
      )}

      {err && <div role="alert" style={{ fontSize: F.sm, color: T.red, marginTop: 8 }}>Couldn&apos;t load files: {err}</div>}

      {cat === "email" && (
        <div className="rounded overflow-hidden" style={{ marginTop: 10, background: T.card, border: `1px solid ${T.hair}` }}>
          <EmailList q={qDeb} openId={emailParam} />
        </div>
      )}

      {cat !== "email" && proposals.length > 0 && (
        <div className="rounded overflow-hidden" style={{ marginTop: 10, background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="px-3 py-1.5" style={{ ...eyebrow, borderBottom: `1px solid ${T.hairSoft}` }}>Proposals sent · final</div>
          {proposals.map((r, i) => (
            <Link key={r.id} href={`/dashboard/scope/${r.job_id}/proposal?v=${r.version}`} className="flex items-center gap-3 px-3 py-2 no-underline"
              style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
              <span className="shrink-0 rounded flex items-center justify-center" style={{ width: 40, height: 40, background: "#F6E2D8", color: "#9A4527", fontFamily: disp, fontSize: 11, fontWeight: 700 }}>PROP</span>
              <span className="flex-1" style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: F.sm, fontWeight: 600 }}>Proposal {r.number ?? `v${r.version}`} · {r.title || "Untitled job"}</span>
                <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>{[r.customer, new Date(r.finalized_at).toLocaleDateString()].filter(Boolean).join(" · ")}</span>
              </span>
              {r.total !== null && <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{r.total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>}
            </Link>
          ))}
        </div>
      )}

      {cat !== "proposal" && cat !== "email" && <div className="rounded overflow-hidden" style={{ marginTop: 10, background: T.card, border: `1px solid ${T.hair}` }}>
        {files === null && !err && [1, 2, 3].map((i) => <div key={i} className="animate-pulse" style={{ height: 56, borderTop: i > 1 ? `1px solid ${T.hairSoft}` : "none", background: T.hairSoft }} />)}
        {files?.length === 0 && (
          <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>
            {chips.length ? "Nothing matches — take a filter off above." : "No files uploaded yet."}
          </div>
        )}
        {files?.map((f, i) => {
          const img = f.kind === "image" && f.url;
          const where = [f.job_id ? jobNames[f.job_id] : null, f.contact_id ? peopleNames[f.contact_id] : null].filter(Boolean).join(" · ");
          return (
            <button key={f.id} onClick={() => setOpen(f)} className="w-full text-left flex items-center gap-3 px-3 py-2"
              style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", background: "transparent", cursor: "pointer" }}>
              <span className="rounded overflow-hidden flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: T.slab, border: `1px solid ${T.hair}` }}>
                {img
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  ? <img src={f.url as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontFamily: disp, fontSize: F.xs, fontWeight: 700, color: f.kind === "pdf" ? T.red : T.ink2 }}>{f.kind === "pdf" ? "PDF" : f.kind.toUpperCase()}</span>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="flex items-baseline gap-2">
                  <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip, flex: 1, minWidth: 0 }}>{f.name}</span>
                  <span style={{ fontSize: F.xs, color: T.ink3, flexShrink: 0 }}>{relTime(f.created_at)}</span>
                </span>
                <span className="block" style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
                  {f.category ? CATEGORY_LABEL[f.category as Category] : "File"}
                  {where ? ` · ${where}` : !f.job_id && !f.contact_id ? " · unfiled" : ""}
                  {f.byte_size ? ` · ${sizeLabel(f.byte_size)}` : ""}
                </span>
                {f.summary && <span className="block" style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{f.summary}</span>}
                {(f as FileRow & { matched?: string | null }).matched && (f as FileRow & { matched?: string | null }).matched !== "words" && (
                  <span className="block" style={{ fontSize: F.xs, color: T.hivizText, ...clip }}>Matched: {(f as FileRow & { matched?: string | null }).matched}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>}
      {cat === "proposal" && !proposals.length && !err && <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>No proposal has been marked final yet.</div>}

      <FileViewer f={open} onClose={() => setOpen(null)}
        links={open && (open.job_id || open.contact_id) ? (
          <div className="flex gap-3">
            {open.job_id && <Link href={`/dashboard/scope/${open.job_id}`} style={{ ...eyebrow, color: T.chalk }}>Open its job ›</Link>}
            {open.contact_id && <Link href={`/dashboard/messages/${open.contact_id}`} style={{ ...eyebrow, color: T.chalk }}>Open their page ›</Link>}
          </div>
        ) : null}
        onSaved={(nf) => { setFiles((a) => (a ?? []).map((x) => (x.id === nf.id ? nf : x))); setOpen(nf); }}
        onDeleted={(id) => { setFiles((a) => (a ?? []).filter((x) => x.id !== id)); setOpen(null); }} />
    </div>
  );
}
