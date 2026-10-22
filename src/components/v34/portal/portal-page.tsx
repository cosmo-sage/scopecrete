"use client";
/**
 * A customer's portal as they open it from their link (migration 123): the
 * proposals sent to them (each opening its own /p/ page to read and sign), the
 * bid requests they sent with where each stands, and a form to send a new one
 * with their plans, specs and photos. No login. Files go straight from the
 * phone to storage as anon, into the link's own folder (the only place the
 * storage policy lets anon write), then the request names them.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Emblem, Wordmark } from "@/components/site/marks";
import { guessCategory, portalPath, proposalState, requestStage, safeFileName, type PortalCategory } from "@/lib/portal";

interface Proposal { token: string; number: string | null; job: string | null; address: string | null; total: number | null; sent_at: string | null; viewed: boolean; signed_at: string | null; signed_by: string | null }
interface Request { id: string; title: string; address: string | null; due_on: string | null; at: string; files: number; from: string | null; job_status: string | null; archived: boolean }
interface Portal { gone?: boolean; own?: boolean; org_name: string | null; customer_name?: string; portal_id?: string; org_id?: string; proposals?: Proposal[]; requests?: Request[] }
interface Pick { id: string; file: File; category: PortalCategory; progress: number; path?: string; error?: string }

const C = { ink: "#2A2A2A", ink2: "#5B5650", ink3: "#8C857C", paper: "#FBF6EC", card: "#FFFFFF", hair: "#E4DCCB", accent: "#B85A3C", green: "#2F8A5B", red: "#B5412C", blue: "#1E5AA8" };
const TONE: Record<string, string> = { new: C.blue, work: C.accent, sent: C.accent, won: C.green, done: C.ink3, off: C.ink3 };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CATS: Array<[PortalCategory, string]> = [["plan", "Plans"], ["spec", "Specs"], ["photo", "Photo"], ["other", "Other"]];
const MAX_FILE = 100 * 1024 * 1024;

/** One file to storage as anon (the bearer is the anon key, so a signed-in session never stands in). */
function upload(path: string, file: File, onProgress: (p: number) => void): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${base}/storage/v1/object/job-files/${path.split("/").map(encodeURIComponent).join("/")}`);
    x.setRequestHeader("apikey", key);
    x.setRequestHeader("Authorization", `Bearer ${key}`);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(x.status === 413 ? "too big" : x.status === 403 ? "not allowed" : `HTTP ${x.status}`)));
    x.onerror = () => reject(new Error("connection lost"));
    x.send(file);
  });
}

export function PortalPage({ token }: { token: string }) {
  const [p, setP] = useState<Portal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"proposals" | "requests">("proposals");
  const [form, setForm] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/c/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error ?? "This link can't be opened."); return; }
      setP(j as Portal);
    }).catch(() => setErr("Couldn't reach the page. Check your connection and try again."));
  }, [token]);
  useEffect(load, [load]);

  const box: React.CSSProperties = { maxWidth: 560, margin: "60px auto", padding: "0 16px", fontSize: 15, color: C.ink, lineHeight: 1.5, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };
  if (err && !p) return <div style={box}>{err}</div>;
  if (!p) return <div style={box}>Opening your page…</div>;
  if (p.gone) return <div style={box}>This page was turned off{p.org_name ? ` by ${p.org_name}` : ""}. Ask them for a new link.</div>;

  const proposals = p.proposals ?? [], requests = p.requests ?? [];
  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ background: C.ink, color: "#fff", padding: "18px 16px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>{p.org_name}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{p.customer_name}</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>Your proposals from {p.org_name}, and bid requests you send them.</div>
        </div>
      </div>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 16px 40px" }}>
        {p.own && <div style={{ background: "#FFF6D8", border: `1px solid ${C.hair}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          This is your customer&apos;s page. They send bid requests from it; you can&apos;t send one to yourself, and your visits aren&apos;t counted.
        </div>}
        {!form && !p.own && (
          <button onClick={() => setForm(true)} style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            + Send a bid request
          </button>
        )}
        {form && p.portal_id && p.org_id && (
          <RequestForm token={token} orgId={p.org_id} portalId={p.portal_id} orgName={p.org_name ?? "us"}
            onClose={() => setForm(false)} onSent={() => { setForm(false); setTab("requests"); load(); }} />
        )}

        <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.hair}`, margin: "18px 0 10px" }}>
          {([["proposals", `Proposals · ${proposals.length}`], ["requests", `Your requests · ${requests.length}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: "none", border: "none", padding: "8px 0", fontSize: 15, fontWeight: tab === k ? 700 : 500, color: tab === k ? C.ink : C.ink3, borderBottom: `2px solid ${tab === k ? C.accent : "transparent"}`, marginBottom: -1, cursor: "pointer" }}>{l}</button>
          ))}
        </div>

        {tab === "proposals" && (proposals.length ? proposals.map((x) => (
          <a key={x.token} href={`/p/${x.token}`} style={{ display: "block", background: C.card, border: `1px solid ${C.hair}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, color: C.ink, textDecoration: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{x.job ?? "Proposal"}</div>
              {x.total !== null && <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{money(Number(x.total))}</div>}
            </div>
            {x.address && <div style={{ fontSize: 13, color: C.ink2 }}>{x.address}</div>}
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
              {[x.number, x.sent_at ? `Sent ${day(x.sent_at)}` : null].filter(Boolean).join(" · ")}
              {" · "}<span style={{ color: x.signed_at ? C.green : C.ink3, fontWeight: x.signed_at ? 600 : 400 }}>{proposalState(x, day)}</span>
              <span style={{ float: "right", color: C.accent, fontWeight: 600 }}>Open ›</span>
            </div>
          </a>
        )) : <Empty>No proposals yet. When {p.org_name} sends you one, it shows here.</Empty>)}

        {tab === "requests" && (requests.length ? requests.map((r) => {
          const s = requestStage(r.job_status, r.archived);
          return (
            <div key={r.id} style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: TONE[s.tone], whiteSpace: "nowrap" }}>● {s.label}</span>
              </div>
              {r.address && <div style={{ fontSize: 13, color: C.ink2 }}>{r.address}</div>}
              <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
                {[`Sent ${day(r.at)}`, r.from ? `by ${r.from}` : null, r.due_on ? `price by ${day(r.due_on)}` : null, r.files ? `${r.files} file${r.files === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        }) : <Empty>Nothing sent yet. Tap Send a bid request to send {p.org_name} a job to price, with your plans.</Empty>)}

        <a href="https://scopecrete.ai" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, color: C.ink3, fontSize: 12, textDecoration: "none" }}>
          Sent with <Emblem size={18} spin={false} /> <Wordmark size={14} />
        </a>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "18px 4px", fontSize: 14, color: C.ink3 }}>{children}</div>;
}

function RequestForm({ token, orgId, portalId, orgName, onClose, onSent }: { token: string; orgId: string; portalId: string; orgName: string; onClose: () => void; onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  // Who's writing, remembered on this phone for the next request (the form mounts only on a tap).
  const [me] = useState<{ name?: string; phone?: string; email?: string }>(() => {
    try { return JSON.parse(localStorage.getItem("sc:portal-me") ?? "{}"); } catch { return {}; }
  });
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).slice(0, 40 - picks.length).map((file) => ({
      id: crypto.randomUUID(), file, category: guessCategory(file.name, file.type), progress: 0,
      error: file.size > MAX_FILE ? "Over 100 MB — email it instead" : undefined,
    }));
    setPicks((p) => [...p, ...next]);
  };
  const set = (id: string, patch: Partial<Pick>) => setPicks((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const send = async () => {
    if (!title.trim()) { setErr("Give the job a name."); return; }
    if (!name.trim() && !phone.trim() && !email.trim()) { setErr("Add your name and a phone or email, so we know who to call."); return; }
    setBusy(true); setErr(null);
    try { localStorage.setItem("sc:portal-me", JSON.stringify({ name, phone, email })); } catch { /* fine */ }
    const done: Array<{ path: string; name: string; category: string }> = [];
    for (const f of picks) {
      if (f.error && !f.path) continue;
      const path = f.path ?? portalPath(orgId, portalId, f.id, f.file.name);
      if (!f.path) {
        try { await upload(path, f.file, (x) => set(f.id, { progress: x })); set(f.id, { path, progress: 1 }); }
        catch (e) { set(f.id, { error: `Didn't upload (${e instanceof Error ? e.message : "error"})` }); continue; }
      }
      done.push({ path, name: safeFileName(f.file.name), category: f.category });
    }
    const failed = picks.filter((f) => f.file.size <= MAX_FILE).length - done.length;
    if (failed > 0 && !confirm(`${failed} file${failed === 1 ? "" : "s"} didn't upload. Send the request without ${failed === 1 ? "it" : "them"}?`)) { setBusy(false); return; }
    try {
      const r = await fetch(`/api/c/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, address, due: due || null, note, name, phone, email, files: done }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onSent();
    } catch (e) { setErr(sentence(e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${C.hair}`, borderRadius: 8, fontSize: 16, background: "#fff", color: C.ink, fontFamily: "inherit" };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.ink2, margin: "12px 0 4px", display: "block" };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 12, padding: "14px 14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Send {orgName} a bid request</div>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, color: C.ink3, cursor: "pointer" }}>×</button>
      </div>
      <label style={label}>Job name *</label>
      <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HPC parking lot" maxLength={120} />
      <label style={label}>Job site address</label>
      <input style={field} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} autoComplete="street-address" />
      <label style={label}>Need the price by</label>
      <input style={field} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <label style={label}>What to price</label>
      <textarea style={{ ...field, minHeight: 96, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000}
        placeholder="Concrete paving per sheet C3.0, 5&quot; and 7&quot; sections, curbs and sidewalks" />

      <label style={label}>Plans, specs and photos</label>
      {picks.map((f) => (
        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${C.hair}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file.name}</div>
            <div style={{ fontSize: 12, color: f.error ? C.red : C.ink3 }}>
              {f.error ?? (f.path ? "Uploaded ✓" : f.progress > 0 ? `Uploading ${Math.round(f.progress * 100)}%` : size(f.file.size))}
            </div>
          </div>
          <select value={f.category} onChange={(e) => set(f.id, { category: e.target.value as PortalCategory })} disabled={busy}
            style={{ fontSize: 14, padding: "6px 4px", border: `1px solid ${C.hair}`, borderRadius: 6, background: "#fff" }}>
            {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {!busy && <button onClick={() => setPicks((p) => p.filter((x) => x.id !== f.id))} aria-label="Remove" style={{ background: "none", border: "none", color: C.ink3, fontSize: 18, cursor: "pointer" }}>×</button>}
        </div>
      ))}
      <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }}
        accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
      <button onClick={() => input.current?.click()} disabled={busy || picks.length >= 40}
        style={{ width: "100%", padding: "11px", border: `1.5px dashed ${C.hair}`, borderRadius: 8, background: C.paper, color: C.ink2, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
        + Add files
      </button>

      <label style={label}>Your name</label>
      <input style={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><label style={label}>Phone</label><input style={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" /></div>
        <div style={{ flex: 1.4 }}><label style={label}>Email</label><input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></div>
      </div>

      {err && <div style={{ color: C.red, fontSize: 14, marginTop: 10 }}>{err}</div>}
      <button onClick={send} disabled={busy}
        style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 10, border: "none", background: busy ? C.ink3 : C.green, color: "#fff", fontSize: 16, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Sending…" : "Send the request"}
      </button>
    </div>
  );
}
