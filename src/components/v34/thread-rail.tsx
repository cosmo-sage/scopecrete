"use client";
/**
 * Threads v2, level 1 (Claude Design handoff, 2026-10-03): the threads.
 *
 *   ThreadRail     — desktop, 72px beside the main rail: the five system
 *                    threads, a rule, "Yours" (the ones Coy made) and + New.
 *   ThreadDrawer   — phone, the same list in a 220px drawer behind ☰.
 *   NewThreadSheet — name it, then pull its people from a job, a customer, or
 *                    pick them by hand. A job or customer thread follows them.
 */
import React, { useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, BUCKET } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { useThreads } from "@/components/v34/threads-ctx";
import { initials, SYSTEM_KEYS, type SystemThreadKey } from "@/lib/v34/threads";
import { STATUS_NAME } from "@/lib/jobs/stages";

export const SYSTEM_THREADS: Record<SystemThreadKey, { label: string; color: string; icon: React.ReactNode }> = {
  customers: { label: "Customer", color: BUCKET.customer, icon: <><circle cx="10" cy="7" r="3.2" /><path d="M3.5 17c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" /></> },
  unsorted: { label: "Unsorted", color: BUCKET.unsorted, icon: <><path d="M2 11l3-7h10l3 7v5H2z" /><path d="M2 11h5l1 2h4l1-2h5" /></> },
  vendors: { label: "Vendor", color: BUCKET.vendor, icon: <><path d="M2 5h10v9H2zM12 8h3.5l2.5 3v3h-6" /><circle cx="5.5" cy="15" r="1.6" /><circle cx="14.5" cy="15" r="1.6" /></> },
  personal: { label: "Personal", color: BUCKET.personal, icon: <path d="M10 16.5s-6-3.6-6-8A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.5c0 4.4-6 8-6 8z" /> },
  spam: { label: "Spam", color: BUCKET.spam, icon: <path d="M5 5l10 10M15 5L5 15" /> },
};
// Archived sits under Vendor (Coy, 2026-10-04: "The archived threads needs it's own tab in the tab menu below Vendor, that is filterable").
const ARCHIVED = { label: "Archived", icon: <><path d="M3 4h14v4H3z" /><path d="M4 8v8h12V8" /><path d="M8 11h4" /></> };
const RAIL_ORDER: Array<SystemThreadKey | "archived"> = ["customers", "unsorted", "vendors", "archived", "personal", "spam"];

/** The thread's name and colour, for headers and back links. */
export function threadLabel(thread: string, custom: Array<{ id: string; name: string }> | null): { name: string; color: string; custom: boolean } {
  if (thread === "archived") return { name: "Archived", color: T.ink2, custom: false };
  const s = (SYSTEM_KEYS as string[]).includes(thread) ? SYSTEM_THREADS[thread as SystemThreadKey] : null;
  if (s) return { name: s.label, color: s.color, custom: false };
  return { name: custom?.find((t) => t.id === thread)?.name ?? "Thread", color: T.hiviz, custom: true };
}

function Icon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{children}</svg>
  );
}

function ThreadCells({ onPick, wide }: { onPick?: () => void; wide?: boolean }) {
  const ctx = useThreads();
  if (!ctx) return null;
  const { thread, setThread, custom, counts, customCounts, setNewThread } = ctx;
  const go = (t: string) => { setThread(t); onPick?.(); };
  const cell = (on: boolean, edge: string): React.CSSProperties => ({
    cursor: "pointer", border: "none", borderLeft: `3px solid ${on ? edge : "transparent"}`,
    // On the list's own colour (Coy, 2026-10-03): the picked thread is tinted with its colour, not lifted to white.
    background: on ? `color-mix(in srgb, ${edge} 12%, var(--sc-card))` : "transparent", color: on ? T.ink : T.ink2, width: "100%",
  });
  return (
    <>
      {RAIL_ORDER.map((k) => {
        const s = k === "archived" ? { ...ARCHIVED, color: T.ink2 } : SYSTEM_THREADS[k], on = thread === k, n = counts?.[k];
        return wide ? (
          <button key={k} onClick={() => go(k)} className="flex items-center gap-2.5 px-3 text-left" style={{ ...cell(on, s.color), height: 44 }}>
            <Icon color={s.color}>{s.icon}</Icon>
            <span style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, ...nums }}>{typeof n === "number" ? n : ""}</span>
          </button>
        ) : (
          <button key={k} role="tab" aria-selected={on} onClick={() => go(k)} className="flex flex-col items-center justify-center gap-0.5 shrink-0" style={{ ...cell(on, s.color), height: 60 }}>
            <Icon color={s.color}>{s.icon}</Icon>
            <span style={{ fontFamily: disp, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, ...nums, minHeight: 13 }}>{typeof n === "number" ? n : ""}</span>
          </button>
        );
      })}
      <div style={{ height: 1, background: T.hairStrong, margin: "8px 10px 4px" }} />
      <div style={{ ...eyebrow, fontSize: 9, textAlign: wide ? "left" : "center", padding: wide ? "2px 12px" : 0, color: T.ink3 }}>Yours</div>
      {(custom ?? []).map((t) => {
        const on = thread === t.id, n = customCounts[t.id] ?? t.count;
        return wide ? (
          <button key={t.id} onClick={() => go(t.id)} className="flex items-center gap-2.5 px-3 text-left" style={{ ...cell(on, T.hiviz), minHeight: 44 }}>
            <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 26, height: 26, border: `1px solid ${T.hiviz}`, color: T.hiviz, fontFamily: disp, fontSize: 11, fontWeight: 700 }}>{initials(t.name)}</span>
            <span style={{ fontSize: F.sm, fontWeight: 600, flex: 1, minWidth: 0, ...clip }}>{t.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.hiviz, ...nums }}>{n}</span>
          </button>
        ) : (
          <button key={t.id} role="tab" aria-selected={on} title={t.name} onClick={() => go(t.id)} className="flex flex-col items-center justify-center gap-0.5 shrink-0 px-1" style={{ ...cell(on, T.hiviz), minHeight: 64, paddingTop: 6, paddingBottom: 6 }}>
            <span className="flex items-center justify-center rounded" style={{ width: 26, height: 26, border: `1px solid ${T.hiviz}`, color: T.hiviz, fontFamily: disp, fontSize: 11, fontWeight: 700 }}>{initials(t.name)}</span>
            <span style={{ fontFamily: disp, fontSize: 9.5, lineHeight: 1.1, letterSpacing: ".04em", textTransform: "uppercase", textAlign: "center", wordBreak: "break-word",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.hiviz, ...nums }}>{n}</span>
          </button>
        );
      })}
      <button onClick={() => { setNewThread(true); onPick?.(); }} className={wide ? "flex items-center gap-2.5 px-3 text-left" : "flex flex-col items-center justify-center gap-0.5 shrink-0"}
        style={{ ...cell(false, T.hiviz), height: wide ? 44 : 52 }}>
        <span className="flex items-center justify-center rounded" style={{ width: 26, height: 26, border: `1px dashed ${T.hairStrong}`, color: T.ink2, fontSize: 15 }}>+</span>
        <span style={{ fontFamily: disp, fontSize: wide ? F.sm : 9.5, letterSpacing: ".06em", textTransform: "uppercase" }}>{wide ? "New thread" : "New"}</span>
      </button>
    </>
  );
}

export function ThreadRail() {
  return (
    <nav aria-label="Threads" className="hidden lg:flex shrink-0 flex-col"
      style={{ width: 72, background: T.card, borderRight: `1px solid ${T.hairSoft}`, position: "sticky", top: "var(--sc-head)", height: "calc(100dvh - var(--sc-head))", overflowY: "auto" }}>
      <ThreadCells />
    </nav>
  );
}

/** Phone: the threads behind ☰, over a scrim. */
export function ThreadDrawer() {
  const ctx = useThreads();
  if (!ctx?.drawer) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50" style={{ top: "var(--sc-head)", bottom: "var(--sc-foot)" }}>
      <button aria-label="Close" onClick={() => ctx.setDrawer(false)} className="absolute inset-0" style={{ background: "rgba(0,0,0,.36)", border: "none" }} />
      <nav aria-label="Threads" className="absolute left-0 top-0 bottom-0 flex flex-col overflow-y-auto" style={{ width: 220, background: T.card, paddingTop: 6 }}>
        <ThreadCells wide onPick={() => ctx.setDrawer(false)} />
      </nav>
    </div>
  );
}

type Pull = "job" | "customer" | "manual";
interface Person { id: string; name: string; bucket: string | null }
const bucketColor = (b: string | null) => (b === "customer" ? BUCKET.customer : b === "vendor" ? BUCKET.vendor : b === "personal" ? BUCKET.personal : b === "spam" ? BUCKET.spam : T.ink2);

export function NewThreadSheet() {
  const ctx = useThreads();
  const open = !!ctx?.newThread;
  const [name, setName] = useState("");
  const [pull, setPull] = useState<Pull>("job");
  const [jobs, setJobs] = useState<Array<{ id: string; title: string | null; status: string | null; address: string | null }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [people, setPeople] = useState<Array<{ contact_id: string; display_name: string; bucket: string | null }>>([]);
  const [pick, setPick] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [preview, setPreview] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let off = false;
    Promise.all([
      fetch("/api/jobs").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/customers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/threads").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([j, c, t]) => {
      if (off) return;
      setJobs(Array.isArray(j?.jobs) ? j.jobs : []);
      setCustomers(Array.isArray(c?.customers) ? (c.customers as Array<{ id: string; name: string | null }>).filter((x) => x.name).map((x) => ({ id: x.id, name: x.name as string })) : []);
      setPeople(Array.isArray(t?.threads) ? t.threads : []);
    });
    return () => { off = true; };
  }, [open]);
  // Who it would start with.
  const previewKey = pull === "manual" ? null : pick ? `${pull}=${pick}` : null;
  useEffect(() => {
    if (!previewKey) return;
    let off = false;
    fetch(`/api/threads/custom?${previewKey}`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setPreview(Array.isArray(b?.preview) ? b.preview : []); }).catch(() => { if (!off) setPreview([]); });
    return () => { off = true; };
  }, [previewKey]);
  const shownPreview: Person[] | null = pull === "manual"
    ? people.filter((p) => picked.has(p.contact_id)).map((p) => ({ id: p.contact_id, name: p.display_name, bucket: p.bucket }))
    : previewKey ? preview : null;
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? people.filter((p) => p.display_name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [find, people]);
  if (!ctx) return null;
  const close = () => { ctx.setNewThread(false); setName(""); setPick(""); setPicked(new Set()); setPreview(null); setErr(null); setFind(""); };
  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/threads/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name, source: pull, job_id: pull === "job" ? pick : undefined, customer_id: pull === "customer" ? pick : undefined,
        contact_ids: pull === "manual" ? [...picked] : undefined }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      ctx.refresh();
      if (b.thread?.id) ctx.setThread(b.thread.id);
      close();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const field: React.CSSProperties = { height: 38, width: "100%", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", background: T.card, color: T.ink, fontSize: F.sm };
  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, height: 32, border: "none", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, fontFamily: disp, fontSize: F.xs, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" });
  const ready = !!name.trim() && (pull === "manual" ? picked.size > 0 : !!pick);
  return (
    <Sheet open={open} onClose={close} title="New thread" sub="A thread is a set of people you want to see together.">
      <div className="px-4 py-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1"><span style={eyebrow}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Wilson Driveway Repair" style={field} /></label>
        <div className="flex flex-col gap-1">
          <span style={eyebrow}>Pull contacts from</span>
          <div className="flex overflow-hidden" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 4 }}>
            {(["job", "customer", "manual"] as Pull[]).map((p) => (
              <button key={p} onClick={() => { setPull(p); setPick(""); setPreview(null); }} style={seg(pull === p)}>{p === "job" ? "A job" : p === "customer" ? "A customer" : "Hand-picked"}</button>
            ))}
          </div>
          {pull === "job" && (
            <select value={pick} onChange={(e) => { setPick(e.target.value); const j = jobs.find((x) => x.id === e.target.value); if (j && !name.trim()) setName(j.title ?? ""); }} style={field} aria-label="Job">
              <option value="">Pick a job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{[j.title || "Untitled job", j.status ? STATUS_NAME[j.status] ?? j.status : null, j.address].filter(Boolean).join(" · ")}</option>)}
            </select>
          )}
          {pull === "customer" && (
            <select value={pick} onChange={(e) => { setPick(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c && !name.trim()) setName(c.name); }} style={field} aria-label="Customer">
              <option value="">Pick a customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {pull === "manual" && (
            <div style={{ position: "relative" }}>
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone by name or number" style={field} aria-label="Find a contact" />
              {matches.length > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 4, marginTop: 2 }}>
                  {matches.map((p) => (
                    <button key={p.contact_id} onClick={() => { setPicked((s) => new Set(s).add(p.contact_id)); setFind(""); }} className="block w-full text-left px-3" style={{ height: 34, fontSize: F.sm, cursor: "pointer", borderBottom: `1px solid ${T.hairSoft}` }}>
                      {p.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {shownPreview && (
          <div className="rounded p-3" style={{ background: T.slab, border: `1px solid ${T.hair}` }}>
            <div style={{ ...eyebrow, color: T.ink3 }}>Starts with {shownPreview.length} contact{shownPreview.length === 1 ? "" : "s"}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {shownPreview.map((p) => (
                <span key={p.id} className="rounded flex items-center gap-1 px-2" style={{ height: 24, border: `1px solid ${bucketColor(p.bucket)}`, color: bucketColor(p.bucket), fontSize: F.xs }}>
                  {p.name}
                  {pull === "manual" && <button aria-label={`Take ${p.name} out`} onClick={() => setPicked((s) => { const n = new Set(s); n.delete(p.id); return n; })} style={{ cursor: "pointer", color: T.ink3 }}>×</button>}
                </span>
              ))}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 8, lineHeight: 1.45 }}>
              {pull === "job" ? "Anyone you add to the job later lands here too. " : pull === "customer" ? "Anyone added to the customer later lands here too. " : ""}
              A contact can sit in as many threads as you like — this doesn&apos;t move them out of Customer or Vendor.
            </div>
          </div>
        )}
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={close} className="rounded px-4" style={{ height: 36, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, fontFamily: disp, fontSize: F.xs, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => void create()} disabled={!ready || busy} className="rounded px-4" style={{ height: 36, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: !ready || busy ? 0.5 : 1 }}>{busy ? "Making it…" : "Create thread"}</button>
        </div>
      </div>
    </Sheet>
  );
}
