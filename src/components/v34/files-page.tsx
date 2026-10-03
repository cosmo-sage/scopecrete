"use client";

/**
 * Files (renamed from Documents 2026-10-03; Coy, 2026-09-30: "all the documents — quotes, proposals,
 * receipts — searchable and filterable"). Every uploaded file in one list,
 * newest first: search the words in them (the index from migration 054 —
 * name, note, Dusty's read and the document's own text), filter by what it
 * is, by job, by person and by date. Tap one for the same viewer the job and
 * person pages use. `?file=` opens that file (a link from search).
 *
 * Proposals are not here yet because nothing sends one yet; they join this
 * list when the proposal step lands. Texted photos stay on the person's page
 * ("From texts") — they are messages, not uploads.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime } from "@/lib/v34/tokens";
import { FileViewer, type FileRow } from "@/components/v34/files-panel";
import { EmailList } from "@/components/v34/email-sheet";
import { CATEGORY_LABEL, sizeLabel, type Category } from "@/lib/files";

const CHIPS: Array<[string, string]> = [
  ["", "All"], ["photo", "Photos"], ["plan", "Plans"], ["spec", "Specs"], ["bid", "Bid invites"],
  ["vendor_quote", "Vendor quotes"], ["receipt", "Receipts"], ["contract", "Contracts"], ["proposal", "Proposals"], ["email", "Emails"], ["other", "Other"], ["unfiled", "Unfiled"],
];
const SINCE: Array<[string, string]> = [["", "Any time"], ["7", "7 days"], ["30", "30 days"], ["365", "This year"]];

export function FilesPage() {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [cat, setCat] = useState("");
  const [since, setSince] = useState("");
  const [job, setJob] = useState("");
  const [person, setPerson] = useState("");
  const [fileParam, setFileParam] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [proposals, setProposals] = useState<Array<{ id: string; job_id: string; version: number; finalized_at: string; number: string | null; total: number | null; title: string | null; customer: string | null }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<FileRow | null>(null);
  const [emailParam, setEmailParam] = useState<string | null>(null);
  // Names seen so far, so a filter's list doesn't shrink to the one chosen.
  const [jobNames, setJobNames] = useState<Record<string, string>>({});
  const [peopleNames, setPeopleNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      const sp = new URLSearchParams(window.location.search);
      setFileParam(sp.get("file"));
      // ?email= opens one mirrored email (the job's Bid strip links here).
      const em = sp.get("email");
      if (em) { setEmailParam(em); setCat("email"); }
    });
    return () => { off = true; };
  }, []);

  const url = useMemo(() => {
    const u = new URLSearchParams();
    if (fileParam) u.set("file", fileParam);
    if (qDeb.length >= 2) u.set("q", qDeb);
    if (cat && cat !== "email") u.set("cat", cat);
    if (since) u.set("since", since);
    if (job) u.set("job", job);
    if (person) u.set("contact", person);
    return `/api/files/search?${u}`;
  }, [fileParam, qDeb, cat, since, job, person]);

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
        setJobNames((m) => ({ ...m, ...Object.fromEntries((b.jobs as Array<{ id: string; name: string }>).map((j) => [j.id, j.name])) }));
        setPeopleNames((m) => ({ ...m, ...Object.fromEntries((b.people as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])) }));
        if (fileParam && fs.length === 1) setOpen(fs[0]);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [url, fileParam]);

  const clearFile = () => { setFileParam(null); window.history.replaceState(null, "", "/dashboard/files"); };
  const select: React.CSSProperties = { height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, borderRadius: 4, padding: "0 6px", maxWidth: 200 };

  return (
    <div className="mx-auto" style={{ maxWidth: 1000, padding: "12px 12px 24px" }}>
      <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>Files</h1>
      <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 8 }}>
        Every photo, plan, bid, quote, receipt and contract uploaded — search finds words inside them too.
        Add files on a job, a person or a vendor&apos;s page.
      </div>

      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (fileParam) clearFile(); }}
        placeholder="Search names, notes and what's written in them" aria-label="Search files"
        style={{ width: "100%", height: 36, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: F.sm, background: T.card }} />

      <div className="flex gap-1 flex-wrap" style={{ marginTop: 8 }}>
        {CHIPS.map(([k, l]) => {
          const on = cat === k;
          return (
            <button key={k || "all"} onClick={() => { setCat(k); if (fileParam) clearFile(); }} aria-pressed={on} className="rounded px-2"
              style={{ height: 26, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: `1px solid ${on ? T.ink : T.hair}`,
                       fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>{l}</button>
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap items-center" style={{ marginTop: 8 }}>
        <select value={since} onChange={(e) => setSince(e.target.value)} aria-label="When" style={select}>
          {SINCE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={job} onChange={(e) => setJob(e.target.value)} aria-label="Job" style={select}>
          <option value="">Any job</option>
          {Object.entries(jobNames).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" style={select}>
          <option value="">Anyone</option>
          {Object.entries(peopleNames).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        {fileParam && <button onClick={clearFile} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Show all</button>}
        <span style={{ fontSize: F.xs, color: T.ink3, marginLeft: "auto" }}>{files ? `${files.length}${files.length === 300 ? "+" : ""} shown` : ""}</span>
      </div>

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
            {qDeb || cat || since || job || person ? "Nothing matches." : "No files uploaded yet."}
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
