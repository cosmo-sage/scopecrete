"use client";

/**
 * Files (renamed from Documents 2026-10-03; Coy: "one place for documents
 * and files and there is a badass search filter system to get anything
 * anytime"). Every file in one place, newest first. The search box finds the
 * words in them (the index from migration 054 — name, note, Dusty's read, the
 * document's own text) AND any name typed: a person, vendor, customer or job
 * by that name brings every file filed on them, each saying why it matched.
 *
 * Laid out like OneDrive (Coy, 2026-10-05): a **Photos | Files** switch
 * (Photos = the pictures as a grid by month; Files = everything, photos
 * included, as a list), a **folder column** on the left (a drawer on a phone)
 * — All files, Recent, each kind of file, and every job, customer, vendor and
 * person with files — the search bar at the top of the content, one **filter
 * bar** (type, way in, job, customer, vendor, person, when) with the filters
 * in use as chips, and the org's **storage** used and left under the folders.
 * Folders and the switch are settings of the one filter (`files-filter.ts`,
 * `files-view.ts`), so the address still carries the view and can be linked.
 * `?file=` opens one file; `?email=` one mirrored email.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime, nums } from "@/lib/v34/tokens";
import { Drawer, MenuButton, PageHeader, SearchBubble, SearchToggle, Segmented } from "@/components/v34/primitives";
import { FileDetails, fileSub, type FileRow } from "@/components/v34/files-panel";
import { EmailList } from "@/components/v34/email-sheet";
import { useWide } from "@/lib/v34/use-wide";
import { CATEGORY_LABEL, sizeLabel, type Category } from "@/lib/files";
import { EMPTY_FILTER, FILE_KINDS, FILE_SOURCES, SINCE_DAYS, activeChips, filterQuery, readFilter, type FileFilter } from "@/lib/files-filter";
import { CATEGORY_FOLDERS, activeFolder, byMonth, folderPatch, isPhotosView, sameFolder, storageLabel, type Folder } from "@/lib/files-view";

type Facet = { id: string; name: string; n: number };
type Facets = { jobs: Facet[]; customers: Facet[]; vendors: Facet[]; people: Facet[] };
type Row = FileRow & { matched?: string | null };

const CAT_LABEL = (c: string) => CATEGORY_FOLDERS.find(([k]) => k === c)?.[1] ?? c;
/** The expandable folder groups: [facet list, filter key, label]. */
const GROUPS = [["jobs", "job", "Jobs"], ["customers", "customer", "Customers"], ["vendors", "vendor", "Vendors"], ["people", "contact", "People"]] as const;

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
  const [wrapRef, wide] = useWide<HTMLDivElement>(900);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({});
  const [storage, setStorage] = useState<{ used_bytes: number; limit_bytes: number; texted_bytes: number } | null>(null);
  const cat = flt.cat, qDeb = flt.q;
  /** Change the filter; the address follows, so the view can be linked or bookmarked. */
  const set = (patch: Partial<FileFilter>) => setFlt((f) => {
    const n = { ...f, ...patch, ...(fixed ?? {}) };
    if (!embedded) { const qs = filterQuery(n); window.history.replaceState(null, "", `/dashboard/files${qs ? `?${qs}` : ""}`); }
    return n;
  });
  const [files, setFiles] = useState<Row[] | null>(null);
  const [proposals, setProposals] = useState<Array<{ id: string; job_id: string; version: number; finalized_at: string; number: string | null; total: number | null; title: string | null; customer: string | null }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<FileRow | null>(null);
  // The preview panel (Coy, 2026-10-07): on a desktop a column on the right of
  // the files, its width dragged and kept on the device; on a phone the whole
  // screen, with Files › folder › name at the top to get back.
  const [preview, setPreviewState] = useState(false);
  const [pw, setPw] = useState(440);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        if (localStorage.getItem("sc:files-preview") === "1") setPreviewState(true);
        const w = Number(localStorage.getItem("sc:files-preview-w")); if (w >= 300 && w <= 1000) setPw(w);
      } catch { /* storage off */ }
    });
  }, []);
  const setPreview = (on: boolean) => { setPreviewState(on); try { localStorage.setItem("sc:files-preview", on ? "1" : "0"); } catch { /* storage off */ } };
  const pickFile = (f: FileRow) => { setOpen(f); setPreview(true); };
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
      setFlt(f); setQ(f.q); setCustom(!!(f.from || f.to)); if (f.q) setSearching(true);
    });
    return () => { off = true; };
  }, [embedded]);
  // The org's storage, once per visit.
  useEffect(() => {
    let off = false;
    fetch("/api/files/storage").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off && b && typeof b.used_bytes === "number") setStorage(b); }).catch(() => {});
    return () => { off = true; };
  }, []);

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
        const fs = b.files as Row[];
        setErr(null);
        setFiles(fs);
        setProposals(b.proposals ?? []);
        if (b.facets) setFacets(b.facets as Facets);
        setJobNames((m) => ({ ...m, ...Object.fromEntries((b.jobs as Array<{ id: string; name: string }>).map((j) => [j.id, j.name])) }));
        setPeopleNames((m) => ({ ...m, ...Object.fromEntries((b.people as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])) }));
        if (fileParam && fs.length === 1) { setOpen(fs[0]); setPreview(true); }
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [url, fileParam]);

  const clearFile = () => { setFileParam(null); if (embedded) return; const qs = filterQuery(flt); window.history.replaceState(null, "", `/dashboard/files${qs ? `?${qs}` : ""}`); };
  const names: Record<string, string> = { ...jobNames, ...peopleNames };
  for (const k of ["jobs", "customers", "vendors", "people"] as const) for (const x of facets?.[k] ?? []) names[x.id] = x.name;
  const photos = isPhotosView(flt);
  const here = activeFolder(flt, fixed);
  // The Photos switch says "Photos" already; its chip would repeat it.
  const chips = activeChips(flt, names, CAT_LABEL).filter((c) => !(fixed && c.key in fixed) && !(photos && c.key === "kind"));
  const clearChip = (k: keyof FileFilter | "date") => {
    if (k === "q") setQ("");
    if (k === "date") { setCustom(false); set({ from: "", to: "" }); } else set({ [k]: "" } as Partial<FileFilter>);
  };
  const go = (folder: Folder) => {
    if (folder.kind === "recent") setCustom(false);
    set(folderPatch(folder)); if (fileParam) clearFile(); setMenuOpen(false);
  };
  const view = (k: string) => {
    if (k === "photos") set({ kind: "image", ...(cat === "email" || cat === "proposal" ? { cat: "" } : {}) });
    else set({ kind: "" });
    if (fileParam) clearFile();
  };
  const folderName = here.kind === "all" ? (photos ? "All photos" : "All files") : here.kind === "recent" ? "Recent · last 30 days"
    : here.kind === "cat" ? CAT_LABEL(here.cat) : names[here.id] ?? "…";

  /* The filter menu's groups: a column of these, each opening its choices. */
  const facetOpts = (list: Facet[] | undefined) => (list ?? []).map((x) => ({ v: x.id, l: x.name, n: x.n }));
  const pick = (k: keyof FileFilter) => (v: string) => set({ [k]: v } as Partial<FileFilter>);
  const filterGroups: FilterGroup[] = [
    ...(!photos ? [{ key: "kind", label: "Type", any: "Any type", value: flt.kind, options: FILE_KINDS.map(([v, l]) => ({ v, l })), onPick: pick("kind") }] : []),
    { key: "source", label: "Way in", any: "Any way in", value: flt.source, options: FILE_SOURCES.map(([v, l]) => ({ v, l })), onPick: pick("source") },
    { key: "job", label: "Job", any: "Any job", value: flt.job, options: facetOpts(facets?.jobs), onPick: pick("job") },
    ...(!fixed?.customer ? [{ key: "customer", label: "Customer", any: "Any customer", value: flt.customer, options: facetOpts(facets?.customers), onPick: pick("customer") }] : []),
    ...(!fixed?.contact ? [
      { key: "vendor", label: "Vendor", any: "Any vendor", value: flt.vendor, options: facetOpts(facets?.vendors), onPick: pick("vendor") },
      { key: "contact", label: "Person", any: "Anyone", value: flt.contact, options: facetOpts(facets?.people), onPick: pick("contact") },
    ] : []),
    { key: "when", label: "When", any: "Any time", value: custom ? "custom" : flt.since,
      options: [...SINCE_DAYS.map(([v, l]) => ({ v, l })), { v: "custom", l: "Between dates…" }],
      onPick: (v) => { if (v === "custom") { setCustom(true); set({ since: "" }); } else { setCustom(false); set({ since: v, from: "", to: "" }); } },
      extra: custom ? (
        <div className="flex flex-col gap-1" style={{ padding: "6px 8px", fontSize: F.xs, color: T.ink3 }}>
          <label>From <input type="date" value={flt.from} onChange={(e) => set({ from: e.target.value, since: "" })} style={dateInput} /></label>
          <label>To <input type="date" value={flt.to} onChange={(e) => set({ to: e.target.value, since: "" })} style={dateInput} /></label>
        </div>
      ) : null },
  ];

  /* ---------------------------------------------------------- folder column */
  const folderBtn = (f: Folder, label: string, n?: number, indent = false) => {
    const on = sameFolder(here, f);
    return (
      <button key={JSON.stringify(f)} onClick={() => go(f)} aria-current={on ? "page" : undefined} className="w-full text-left flex items-center gap-2"
        style={{ minHeight: 30, padding: `0 8px 0 ${indent ? 22 : 8}px`, borderRadius: 4, background: on ? T.hivizDim : "transparent",
                 color: on ? T.hivizText : T.ink, fontSize: F.sm, fontWeight: on ? 600 : 400, cursor: "pointer", border: "none" }}>
        <span style={{ flex: 1, minWidth: 0, ...clip }}>{label}</span>
        {n !== undefined && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{n}</span>}
      </button>
    );
  };
  const menu = (
    <div className="flex flex-col" style={{ height: "100%", minHeight: 0 }}>
      <nav aria-label="Folders" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 4px" }}>
        {folderBtn({ kind: "all" }, photos ? "All photos" : "All files")}
        {folderBtn({ kind: "recent" }, "Recent")}
        <div style={{ ...eyebrow, padding: "10px 8px 4px" }}>Kinds</div>
        {CATEGORY_FOLDERS.filter(([k]) => !embedded || k !== "email").map(([k, l]) => folderBtn({ kind: "cat", cat: k }, l))}
        {GROUPS.filter(([, key]) => !(key === "customer" && fixed?.customer)).map(([list, key, label]) => {
          const items = facets?.[list] ?? [];
          const isOpen = groupsOpen[key] ?? here.kind === key;
          return (
            <div key={key}>
              <button onClick={() => setGroupsOpen((g) => ({ ...g, [key]: !isOpen }))} aria-expanded={isOpen} className="w-full text-left flex items-center gap-1"
                style={{ ...eyebrow, padding: "10px 8px 4px", background: "transparent", border: "none", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .12s" }}>›</span>
                <span style={{ flex: 1 }}>{label}</span>
                <span style={nums}>{facets ? items.length : ""}</span>
              </button>
              {isOpen && (items.length
                ? items.map((x) => folderBtn({ kind: key, id: x.id }, x.name, x.n, true))
                : <div style={{ fontSize: F.xs, color: T.ink3, padding: "2px 8px 4px 22px" }}>{facets ? "None with files" : "Loading…"}</div>)}
            </div>
          );
        })}
      </nav>
      <StorageMeter s={storage} />
    </div>
  );

  /* ------------------------------------------------------------- the rows */
  const where = (f: Row) => [f.job_id ? jobNames[f.job_id] : null, f.contact_id ? peopleNames[f.contact_id] : null].filter(Boolean).join(" · ");
  const thumb = (f: Row, size: number) => (
    <span className="rounded overflow-hidden flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, background: T.slab, border: `1px solid ${T.hair}` }}>
      {f.kind === "image" && f.url
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        ? <img src={f.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontFamily: disp, fontSize: F.xs, fontWeight: 700, color: f.kind === "pdf" ? T.red : T.ink2 }}>{f.kind === "pdf" ? "PDF" : f.kind.toUpperCase()}</span>}
    </span>
  );
  const grid = "40px minmax(0,1fr) minmax(0,190px) 64px 56px";
  const fileRow = (f: Row, i: number) => {
    const w = where(f);
    const kindLabel = f.category ? CATEGORY_LABEL[f.category as Category] : "File";
    const matched = f.matched && f.matched !== "words" ? f.matched : null;
    if (wide) return (
      <button key={f.id} onClick={() => pickFile(f)} className="w-full text-left items-center gap-3 px-3 py-2"
        style={{ display: "grid", gridTemplateColumns: grid, borderTop: i ? `1px solid ${T.hairSoft}` : "none", background: "transparent", cursor: "pointer" }}>
        {thumb(f, 40)}
        <span style={{ minWidth: 0 }}>
          <span className="block" style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip }}>{f.name}</span>
          <span className="block" style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{kindLabel}{f.summary ? ` · ${f.summary}` : ""}</span>
          {matched && <span className="block" style={{ fontSize: F.xs, color: T.hivizText, ...clip }}>Matched: {matched}</span>}
        </span>
        <span style={{ fontSize: F.xs, color: w ? T.ink2 : T.ink3, ...clip }}>{w || (!f.job_id && !f.contact_id ? "Unfiled" : "")}</span>
        <span style={{ fontSize: F.xs, color: T.ink3, textAlign: "right", ...nums }}>{f.byte_size ? sizeLabel(f.byte_size) : ""}</span>
        <span style={{ fontSize: F.xs, color: T.ink3, textAlign: "right", ...nums }}>{relTime(f.created_at)}</span>
      </button>
    );
    return (
      <button key={f.id} onClick={() => pickFile(f)} className="w-full text-left flex items-center gap-3 px-3 py-2"
        style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", background: "transparent", cursor: "pointer" }}>
        {thumb(f, 40)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="flex items-baseline gap-2">
            <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip, flex: 1, minWidth: 0 }}>{f.name}</span>
            <span style={{ fontSize: F.xs, color: T.ink3, flexShrink: 0 }}>{relTime(f.created_at)}</span>
          </span>
          <span className="block" style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
            {kindLabel}
            {w ? ` · ${w}` : !f.job_id && !f.contact_id ? " · unfiled" : ""}
            {f.byte_size ? ` · ${sizeLabel(f.byte_size)}` : ""}
          </span>
          {f.summary && <span className="block" style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{f.summary}</span>}
          {matched && <span className="block" style={{ fontSize: F.xs, color: T.hivizText, ...clip }}>Matched: {matched}</span>}
        </span>
      </button>
    );
  };
  const skeleton = (h: number) => [1, 2, 3].map((i) => <div key={i} className="animate-pulse" style={{ height: h, borderTop: i > 1 ? `1px solid ${T.hairSoft}` : "none", background: T.hairSoft }} />);
  const panel: React.CSSProperties = { marginTop: 10, background: T.card, border: `1px solid ${T.hair}` };
  const search = (
    <SearchBubble value={q} onChange={(v) => { setQ(v); if (fileParam) clearFile(); }} onClose={() => setSearching(false)}
      placeholder={photos ? "Search photos — words, or a name" : "Search files — words in a file, or a name: Wilson, Angelle…"} />
  );

  const details = (f: FileRow) => (
    <FileDetails key={f.id} f={f} big onClose={() => setPreview(false)}
      links={f.job_id || f.contact_id ? (
        <div className="flex gap-3">
          {f.job_id && <Link href={`/dashboard/scope/${f.job_id}`} style={{ ...eyebrow, color: T.chalk }}>Open its job ›</Link>}
          {f.contact_id && <Link href={`/dashboard/messages/${f.contact_id}`} style={{ ...eyebrow, color: T.chalk }}>Open their page ›</Link>}
        </div>
      ) : null}
      onSaved={(nf) => { setFiles((a) => (a ?? []).map((x) => (x.id === nf.id ? nf : x))); setOpen(nf); }}
      onDeleted={(id) => { setFiles((a) => (a ?? []).filter((x) => x.id !== id)); setOpen(null); }} />
  );

  return (
    <>
    {/* The page's subheader like every main-menu page (Coy, 2026-10-06): ☰ on
        a phone, Files, the filter and search icons, one line on what it holds.
        Embedded on a customer's tab it is just the icons' row. */}
    {!embedded && (
      <PageHeader title="Files" menu={!wide ? <MenuButton onClick={() => setMenuOpen(true)} label="Folders" always /> : undefined}
        sub="Every photo, plan, bid, quote, receipt and contract — uploaded, emailed or texted. Search the words in them, or any name."
        actions={<>
          <FilterMenu groups={filterGroups} used={chips.filter((c) => c.key !== "q").length} />
          <SearchToggle open={searching} onToggle={() => { if (searching) { setQ(""); setSearching(false); } else setSearching(true); }} label="Search files" />
          {extra}
        </>}>
        {searching && <div className="mt-2">{search}</div>}
      </PageHeader>
    )}
    <div ref={wrapRef} className="mx-auto" style={{ padding: embedded ? 0 : "0 12px 24px" }}>
      {embedded && (
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          {!wide && <MenuButton onClick={() => setMenuOpen(true)} label="Folders" always />}
          <span style={{ flex: 1 }} />
          <FilterMenu groups={filterGroups} used={chips.filter((c) => c.key !== "q").length} />
          <SearchToggle open={searching} onToggle={() => { if (searching) { setQ(""); setSearching(false); } else setSearching(true); }} label="Search files" />
          {extra}
        </div>
      )}
      {embedded && searching && <div style={{ marginBottom: 8 }}>{search}</div>}

      <div className="flex items-start" style={{ gap: 16 }}>
        {wide && (
          <aside aria-label="Folders and storage" className="rounded"
            style={{ width: 232, flexShrink: 0, position: "sticky", top: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 8px)", height: "calc(100dvh - var(--sc-head) - var(--sc-subhead, 0px) - 24px)",
                     maxHeight: 760, background: T.card, border: `1px solid ${T.hair}`, overflow: "hidden" }}>
            {menu}
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Photos | Files, and which folder is open. */}
          <div className="flex items-center gap-3 flex-wrap">
            <div style={{ width: 190 }}>
              <Segmented small options={[["photos", "Photos"], ["files", "Files"]]} value={photos ? "photos" : "files"} onChange={view} />
            </div>
            <div style={{ flex: 1, minWidth: 0, fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...clip }}>{folderName}</div>
            {fileParam && <button onClick={clearFile} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Show all</button>}
            <button onClick={() => { if (wide) setPreview(!preview); else { const f = open ?? files?.[0]; if (f) pickFile(f); } }}
              aria-pressed={wide ? preview : undefined} disabled={!wide && !open && !files?.length} className="rounded flex items-center gap-1.5"
              style={{ height: 28, padding: "0 10px", border: `1px solid ${wide && preview ? T.hiviz : T.hair}`, background: wide && preview ? T.hivizDim : T.card,
                       color: wide && preview ? T.hivizText : T.ink2, fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" /><path d="M11.5 3.5v13" /></svg>
              Preview
            </button>
            <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{files && cat !== "email" ? `${files.length}${files.length === 300 ? "+" : ""} ${photos ? "photos" : "shown"}` : ""}</span>
          </div>

          {chips.length > 0 && (
            <div className="flex gap-1 flex-wrap items-center" style={{ marginTop: 8 }} aria-label="Filters in use">
              {chips.map((c) => (
                <button key={c.key} onClick={() => clearChip(c.key)} aria-label={`Remove ${c.label}`} className="rounded-full"
                  style={{ height: 24, padding: "0 6px 0 10px", border: `1px solid ${T.hiviz}`, background: T.hivizDim, color: T.hivizText, fontSize: F.xs, cursor: "pointer" }}>
                  {c.label} <span aria-hidden="true" style={{ marginLeft: 2 }}>×</span>
                </button>
              ))}
              <button onClick={() => { setQ(""); setCustom(false); set({ ...base, kind: photos ? "image" : "" }); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", marginLeft: 4 }}>Clear all</button>
            </div>
          )}

          {err && <div role="alert" style={{ fontSize: F.sm, color: T.red, marginTop: 8 }}>Couldn&apos;t load files: {err}</div>}

          {cat === "email" && (
            <div className="rounded overflow-hidden" style={panel}>
              <EmailList q={qDeb} openId={emailParam} />
            </div>
          )}

          {/* Photos: a grid of pictures, by the month they came in. */}
          {photos && cat !== "email" && (
            <div style={{ marginTop: 10 }}>
              {files === null && !err && <div className="rounded overflow-hidden" style={panel}>{skeleton(96)}</div>}
              {files?.length === 0 && (
                <div className="rounded px-3 py-4" style={{ ...panel, fontSize: F.sm, color: T.ink3 }}>
                  {chips.length || here.kind !== "all" ? "No photos here — try another folder or take a filter off." : "No photos yet."}
                </div>
              )}
              {files && byMonth(files).map((m) => (
                <section key={m.key} style={{ marginBottom: 14 }} aria-label={m.label}>
                  <div className="flex items-baseline gap-2" style={{ margin: "4px 0 6px" }}>
                    <h2 style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, margin: 0 }}>{m.label}</h2>
                    <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{m.items.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 132 : 96}px, 1fr))`, gap: 4 }}>
                    {m.items.map((f) => (
                      <button key={f.id} onClick={() => pickFile(f)} title={f.name} aria-label={f.name} className="rounded overflow-hidden"
                        style={{ aspectRatio: "1 / 1", padding: 0, border: `1px solid ${T.hairSoft}`, background: T.slab, cursor: "pointer", position: "relative" }}>
                        {f.url
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                          ? <img src={f.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <span className="flex items-center justify-center" style={{ width: "100%", height: "100%", fontSize: F.xs, color: T.ink3, padding: 6, textAlign: "center" }}>{f.name}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!photos && cat !== "email" && proposals.length > 0 && (
            <div className="rounded overflow-hidden" style={panel}>
              <div className="px-3 py-1.5" style={{ ...eyebrow, borderBottom: `1px solid ${T.hairSoft}` }}>Proposals sent · final</div>
              {proposals.map((r, i) => (
                <Link key={r.id} href={`/dashboard/scope/${r.job_id}/proposal?v=${r.version}`} className="flex items-center gap-3 px-3 py-2 no-underline"
                  style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
                  <span className="shrink-0 rounded flex items-center justify-center" style={{ width: 40, height: 40, background: T.hivizDim, color: T.hivizText, fontFamily: disp, fontSize: 11, fontWeight: 700 }}>PROP</span>
                  <span className="flex-1" style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: F.sm, fontWeight: 600 }}>Proposal {r.number ?? `v${r.version}`} · {r.title || "Untitled job"}</span>
                    <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>{[r.customer, new Date(r.finalized_at).toLocaleDateString()].filter(Boolean).join(" · ")}</span>
                  </span>
                  {r.total !== null && <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{r.total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>}
                </Link>
              ))}
            </div>
          )}

          {/* Files: everything, photos included, as a list (a table when there's room). */}
          {!photos && cat !== "proposal" && cat !== "email" && <div className="rounded overflow-hidden" style={panel}>
            {wide && files && files.length > 0 && (
              <div className="items-center gap-3 px-3 py-1.5" style={{ display: "grid", gridTemplateColumns: grid, ...eyebrow, borderBottom: `1px solid ${T.hairSoft}` }}>
                <span /><span>Name</span><span>Filed on</span><span style={{ textAlign: "right" }}>Size</span><span style={{ textAlign: "right" }}>Added</span>
              </div>
            )}
            {files === null && !err && skeleton(56)}
            {files?.length === 0 && (
              <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>
                {chips.length || here.kind !== "all" ? "Nothing here — try another folder or take a filter off." : "No files uploaded yet."}
              </div>
            )}
            {files?.map(fileRow)}
          </div>}
          {!photos && cat === "proposal" && !proposals.length && !err && <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>No proposal has been sent yet.</div>}
        </div>

        {wide && preview && (
          <aside aria-label="Preview" className="rounded"
            style={{ width: pw, flexShrink: 0, position: "sticky", top: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 8px)", height: "calc(100dvh - var(--sc-head) - var(--sc-subhead, 0px) - 24px)",
                     background: T.card, border: `1px solid ${T.hair}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div role="separator" aria-orientation="vertical" aria-label="Drag to resize the preview" title="Drag to resize"
              onPointerDown={(e) => {
                e.preventDefault();
                const x0 = e.clientX, w0 = pw; let w = w0;
                const mv = (ev: PointerEvent) => { w = Math.max(300, Math.min(1000, w0 + (x0 - ev.clientX))); setPw(w); };
                const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); try { localStorage.setItem("sc:files-preview-w", String(Math.round(w))); } catch { /* storage off */ } };
                window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
              }}
              onDoubleClick={() => { setPw(440); try { localStorage.removeItem("sc:files-preview-w"); } catch { /* storage off */ } }}
              style={{ position: "absolute", left: -1, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 2, touchAction: "none" }} />
            <div className="flex items-start gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{open ? open.name : "Preview"}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{open ? fileSub(open) : "Pick a file to see it here."}</div>
              </div>
              <button onClick={() => setPreview(false)} aria-label="Close the preview" style={{ fontSize: 20, lineHeight: 1, color: T.ink3, cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {open ? details(open) : <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>Tap a file or photo and it opens here, beside the list.</div>}
            </div>
          </aside>
        )}
      </div>

      {!wide && <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Folders" sub={folderName}>{menu}</Drawer>}

      {!wide && preview && open && (
        <div role="dialog" aria-label={open.name} className="fixed inset-0 flex flex-col" style={{ zIndex: 70, background: T.card, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <nav aria-label="Where this file is" className="flex items-center gap-1 px-3" style={{ minHeight: 48, borderBottom: `1px solid ${T.hair}`, fontSize: F.sm }}>
            <button onClick={() => setPreview(false)} style={{ color: T.chalk, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>‹ Files</button>
            <span aria-hidden="true" style={{ color: T.ink3 }}>›</span>
            <button onClick={() => setPreview(false)} style={{ color: T.chalk, cursor: "pointer", flexShrink: 1, minWidth: 0, ...clip }}>{folderName}</button>
            <span aria-hidden="true" style={{ color: T.ink3 }}>›</span>
            <span style={{ color: T.ink, fontWeight: 600, flex: 1, minWidth: 0, ...clip }}>{open.name}</span>
            <button onClick={() => setPreview(false)} aria-label="Close" style={{ fontSize: 22, lineHeight: 1, color: T.ink3, cursor: "pointer", padding: "0 4px" }}>×</button>
          </nav>
          <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 16px 0" }}>{fileSub(open)}</div>
          <div style={{ flex: 1, overflowY: "auto" }}>{details(open)}</div>
        </div>
      )}
    </div>
    </>
  );
}

/**
 * The org's storage under the folders: "37.4 MB used of 1 GB · 987 MB left"
 * with a bar (amber from 80%, red when full). Files and texted files only —
 * /api/files/storage says what isn't counted.
 */
function StorageMeter({ s }: { s: { used_bytes: number; limit_bytes: number; texted_bytes: number } | null }) {
  if (!s) return (
    <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.hairSoft}`, fontSize: F.xs, color: T.ink3 }}>Storage —</div>
  );
  const l = storageLabel(s.used_bytes, s.limit_bytes);
  const fill = l.tone === "full" ? T.red : l.tone === "warn" ? T.hivizSoft : T.chalk;
  return (
    <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${T.hairSoft}`, flexShrink: 0 }}
      title="Files and texted photos. Call recordings, logos and proposal pictures aren't counted.">
      <div style={eyebrow}>Storage</div>
      <div role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.pct * 100)}
        style={{ height: 6, borderRadius: 3, background: T.hairSoft, overflow: "hidden", margin: "6px 0 5px" }}>
        <div style={{ width: `${Math.max(l.pct * 100, l.pct > 0 ? 1 : 0)}%`, height: "100%", background: fill }} />
      </div>
      <div style={{ fontSize: F.xs, color: T.ink2, ...nums }}>{l.used}</div>
      <div style={{ fontSize: F.xs, color: l.tone === "ok" ? T.ink3 : T.red, ...nums }}>{l.left}</div>
    </div>
  );
}

/* ------------------------------------------------------------ filter menu */

type FilterGroup = {
  key: string; label: string; any: string; value: string;
  options: Array<{ v: string; l: string; n?: number }>;
  onPick: (v: string) => void; extra?: React.ReactNode;
};
const dateInput: React.CSSProperties = { display: "block", width: "100%", height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.xs, borderRadius: 4, padding: "0 6px", marginTop: 2 };

/** The filter as one icon (Coy, 2026-10-06: "an icon that opens a column list
 *  that opens sub options to the right of that column"): Type, Way in, Job …
 *  down the left, the one tapped lists its choices on the right. */
function FilterMenu({ groups, used }: { groups: FilterGroup[]; used: number }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<string>(groups[0]?.key ?? "");
  const box = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const g = groups.find((x) => x.key === at) ?? groups[0];
  const row = (on: boolean): React.CSSProperties => ({ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, minHeight: 34, padding: "4px 8px",
    background: on ? T.hivizDim : "transparent", color: on ? T.hivizText : T.ink, border: "none", borderRadius: 4, fontSize: F.sm, cursor: "pointer" });
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Filter" aria-expanded={open} title="Filter"
        className="shrink-0 flex items-center justify-center rounded"
        style={{ width: 26, height: 26, border: `1px solid ${open || used ? T.hiviz : T.hairStrong}`, background: open || used ? T.hivizDim : T.card, cursor: "pointer", position: "relative" }}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke={open || used ? T.hiviz : T.ink2} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3.5h15l-6 7v5.5l-3 1.5v-7z" /></svg>
        {used > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 14, height: 14, borderRadius: 7, background: T.hiviz, color: T.onHiviz, fontSize: 9, fontWeight: 700, lineHeight: "14px", textAlign: "center", padding: "0 3px" }}>{used}</span>}
      </button>
      {open && g && (
        <div role="dialog" aria-label="Filter files" className="rounded flex"
          style={{ position: "absolute", right: 0, top: 32, zIndex: 30, width: "min(380px, calc(100vw - 24px))", maxHeight: "min(60vh, 440px)",
                   background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 10px 28px rgba(0,0,0,.16)", overflow: "hidden" }}>
          <div style={{ width: 128, flexShrink: 0, borderRight: `1px solid ${T.hairSoft}`, padding: 4, overflowY: "auto", background: T.sunk }}>
            {groups.map((x) => {
              const chosen = x.value ? x.options.find((o) => o.v === x.value)?.l ?? "" : "";
              return (
                <button key={x.key} type="button" onClick={() => setAt(x.key)} aria-current={x.key === g.key ? "true" : undefined}
                  style={{ ...row(x.key === g.key), flexDirection: "column", alignItems: "flex-start", gap: 0, background: x.key === g.key ? T.card : "transparent", color: T.ink }}>
                  <span className="flex items-center gap-1" style={{ width: "100%", fontWeight: 600 }}>
                    <span style={{ flex: 1 }}>{x.label}</span><span aria-hidden="true" style={{ color: T.ink3 }}>›</span>
                  </span>
                  {chosen && <span style={{ fontSize: F.xs, color: T.hivizText, ...clip, maxWidth: "100%" }}>{chosen}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: 4, overflowY: "auto" }}>
            <button type="button" onClick={() => g.onPick("")} style={row(!g.value)}>
              <span style={{ flex: 1 }}>{g.any}</span>{!g.value && <span aria-hidden="true">✓</span>}
            </button>
            {g.options.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 8px" }}>None with files</div>}
            {g.options.map((o) => (
              <button key={o.v} type="button" onClick={() => g.onPick(o.v)} style={row(g.value === o.v)}>
                <span style={{ flex: 1, minWidth: 0, ...clip }}>{o.l}</span>
                {o.n !== undefined && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{o.n}</span>}
                {g.value === o.v && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            {g.extra}
          </div>
        </div>
      )}
    </div>
  );
}
