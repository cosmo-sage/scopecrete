"use client";

/**
 * The bid request composer (migration 091; Claude Design, Vendors v2 · V2/P2).
 * One composer, two doors: the Vendors page (start from who — the vendors Coy
 * ticked) and a job (start from what — the job filled in, vendors suggested by
 * trade). Five questions: which job · which scopes (the budget's areas and
 * their lines with quantities — costs are never shown, here or to the vendor)
 * · what they see · how they price it · who gets it, by text, email or both.
 *
 * Send makes one link per vendor (POST /api/bid-requests), then texts each one
 * through Quo (/api/texts — this tap is Coy's, §6) and leaves email to his own
 * mail app, one tap per vendor (§10: ScopeCrete sends no email).
 */

import React, { useContext, useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, formatPhone } from "@/lib/v34/tokens";
import { Drawer, OrgNameContext } from "@/components/v34/primitives";
import { InitialsBox } from "@/components/v34/thread-list";
import { call } from "@/components/v34/cost-cards";
import { bidText, shownScopes, suppliedByDefault, type ComposeScope } from "@/lib/bids";

export interface BidVendor {
  id: string; name: string | null; company_name?: string | null; phone: string | null; email: string | null; subtype?: string | null;
  trades?: string[]; bids?: { sent: number; answered: number; label: string; speed: string | null; median_hours: number | null };
}
interface JobLite { id: string; title: string | null; address: string | null; status: string | null }
interface PacketFile { id: string; name: string; kind: "photo" | "plan" | "aerial" }
interface ComposeJob { id: string; title: string | null; address: string | null; street: string | null; scopes: ComposeScope[]; files: PacketFile[]; access: string | null }
type Ch = "text" | "email" | "both";
interface Made { id: string; contact_id: string; name: string | null; phone: string | null; email: string | null; channel: Ch; url: string; text: string; email_parts: { subject: string; body: string } }

const vname = (v: Pick<BidVendor, "name" | "company_name" | "phone">) => v.name?.trim() || v.company_name || formatPhone(v.phone) || "Vendor";
const qty = (n: number | null, u: string | null) => (n === null ? u ?? "" : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${u ?? ""}`.trim());
const MODES: Array<[string, string, string]> = [
  ["lump", "Lump sum", "Each sub sends one number for the scopes ticked."],
  ["per_item", "Per item", "Each sub prices every line: per SF, per LF, per EA."],
  ["their_rates", "Their rates", "Their prices from their last answers are filled in; they change them or just send."],
];
const defaultCh = (v: BidVendor): Ch => (v.phone ? (v.email ? "both" : "text") : "email");

function Check({ on, onClick, label, size = 18 }: { on: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} role="checkbox" aria-checked={on} aria-label={label} className="shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: 3, border: `1.5px solid ${on ? T.green : T.hairStrong}`, background: on ? T.green : "transparent", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>
      {on ? "✓" : ""}
    </button>
  );
}

const stepHead = (n: number, t: string, sub?: string) => (
  <div className="flex items-baseline gap-2 mb-2">
    <span className="flex items-center justify-center" style={{ width: 20, height: 20, borderRadius: 10, background: T.ink, color: T.card, fontSize: 11, fontWeight: 700 }}>{n}</span>
    <span style={{ fontFamily: disp, fontWeight: 700, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".06em" }}>{t}</span>
    {sub && <span style={{ fontSize: F.xs, color: T.ink3 }}>{sub}</span>}
  </div>
);
const chip = (on: boolean, dis?: boolean): React.CSSProperties => ({
  height: 28, padding: "0 10px", borderRadius: 3, border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
  fontSize: F.xs, fontWeight: 600, cursor: dis ? "not-allowed" : "pointer", opacity: dis ? 0.4 : 1, whiteSpace: "nowrap",
});
const field: React.CSSProperties = { height: 32, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 3, padding: "0 8px" };

export function BidComposer({ open, onClose, vendors: start, jobId: startJob, from, onDone }: {
  open: boolean; onClose: () => void;
  /** Vendors already picked (the Vendors page's selection). */
  vendors?: BidVendor[];
  /** A job already picked (the job page's Get bids). */
  jobId?: string | null;
  /** "Started from Vendors · 3 flatwork subs" */
  from?: string;
  onDone?: (msg: string) => void;
}) {
  const org = useContext(OrgNameContext);
  const [jobs, setJobs] = useState<JobLite[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(startJob ?? null);
  const [job, setJob] = useState<ComposeJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Record<string, boolean>>({});
  const [open2, setOpen2] = useState<Record<string, boolean>>({});
  const [lines, setLines] = useState<Record<string, boolean>>({});
  const [supplied, setSupplied] = useState<Record<string, boolean>>({});
  const [pk, setPk] = useState({ address: true, dates: true, quantities: true, photos: true, aerial: true });
  const [plans, setPlans] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState("lump");
  const [priceBy, setPriceBy] = useState("");
  const [pour, setPour] = useState("");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState(true);
  const [pool, setPool] = useState<BidVendor[]>(start ?? []);
  const [who, setWho] = useState<Record<string, Ch>>(() => Object.fromEntries((start ?? []).map((v) => [v.id, defaultCh(v)])));
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made[] | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let off = false;
    call("/api/bid-requests/compose", "GET").then((b) => { if (!off) setJobs(b.jobs as JobLite[]); }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    // Every vendor, for + Add vendor and the suggestions.
    call("/api/vendors", "GET").then((b) => { if (!off) setPool(b.vendors as BidVendor[]); }).catch(() => {});
    return () => { off = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !jobId) return;
    let off = false;
    call(`/api/bid-requests/compose?job=${jobId}`, "GET").then((b) => {
      if (off) return;
      const j = b.job as ComposeJob;
      setJob(j); setErr(null);
      // Every scope with lines ticked; materials supplied by default (suppliedByDefault); every plan in.
      setScopes(Object.fromEntries(j.scopes.filter((s) => s.lines.length).map((s) => [s.key, true])));
      setLines({}); setSupplied({});
      setPlans(Object.fromEntries(j.files.filter((f) => f.kind === "plan").map((f) => [f.id, true])));
    }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [open, jobId]);

  const picked = useMemo(() => pool.filter((v) => who[v.id]), [pool, who]);
  const shown = useMemo(() => (job ? shownScopes(job.scopes, { scopes, lines, supplied, quantities: pk.quantities }) : []), [job, scopes, lines, supplied, pk.quantities]);
  const files = useMemo(() => (job?.files ?? []).filter((f) => (f.kind === "photo" ? pk.photos : f.kind === "aerial" ? pk.aerial : plans[f.id])), [job, pk, plans]);
  const photosN = (job?.files ?? []).filter((f) => f.kind === "photo").length, aerialN = (job?.files ?? []).filter((f) => f.kind === "aerial").length;
  const texts = picked.filter((v) => who[v.id] !== "email" && v.phone).length;
  const emails = picked.filter((v) => who[v.id] !== "text" && v.email).length;
  const anySupplied = shown.some((s) => s.lines.some((l) => l.supplied));
  // Suggestions from the job door: subs first, best responders first.
  const suggest = useMemo(() => pool.filter((v) => !who[v.id] && (!find.trim() || [v.name, v.company_name, ...(v.trades ?? [])].some((x) => (x ?? "").toLowerCase().includes(find.trim().toLowerCase()))))
    .sort((a, b) => Number(b.subtype === "subcontractor") - Number(a.subtype === "subcontractor") || (b.bids?.answered ?? 0) - (a.bids?.answered ?? 0) || vname(a).localeCompare(vname(b)))
    .slice(0, 8), [pool, who, find]);
  const tradeHint = useMemo(() => {
    const t = new Set(picked.flatMap((v) => v.trades ?? []));
    return t.size ? [...t].slice(0, 3).join(", ") : null;
  }, [picked]);

  const preview = picked[0] ? bidText({ name: vname(picked[0]), org, job: job?.title ?? null, scopes: shown.map((s) => s.title),
    size: shown.length === 1 ? shown[0].size : null, street: pk.address ? job?.street ?? null : null, pour: pk.dates ? pour || null : null,
    priceBy: pk.dates ? priceBy || null : null, url: "scopecrete.ai/b/…" }) : null;

  const send = async () => {
    if (!jobId) return;
    setBusy(true); setErr(null);
    try {
      const b = await call("/api/bid-requests", "POST", {
        job_id: jobId, pick: { scopes, lines, supplied }, price_mode: mode, price_by: priceBy || null, pour_date: pour || null, note: note.trim() || null,
        follow_up: follow, packet: { files: files.map((f) => f.id), quantities: pk.quantities, address: pk.address, dates: pk.dates },
        recipients: picked.map((v) => ({ contact_id: v.id, channel: who[v.id] })),
      });
      const rows = b.recipients as Made[];
      setMade(rows);
      // Texts go now, one by one, through Quo — this tap is Coy's.
      const st: Record<string, string> = {};
      for (const r of rows) {
        if (r.channel === "email") continue;
        if (!r.phone) { st[r.id] = "No phone — email it"; continue; }
        st[r.id] = "Texting…"; setStatus({ ...st });
        try {
          await call("/api/texts", "POST", { contact_id: r.contact_id, body: r.text });
          await call(`/api/bid-requests/recipients/${r.id}`, "PATCH", { sent: "text" }).catch(() => null);
          st[r.id] = "Texted ✓";
        } catch (e) { st[r.id] = `Text failed: ${e instanceof Error ? e.message : String(e)}`; }
        setStatus({ ...st });
      }
      const n = Object.values(st).filter((x) => x === "Texted ✓").length;
      onDone?.(`Bid request saved for ${rows.length} vendor${rows.length === 1 ? "" : "s"}${n ? ` · ${n} texted` : ""}. Answers land on their page and the job's Summary.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const mail = (r: Made) => {
    window.location.assign(`mailto:${encodeURIComponent(r.email ?? "")}?subject=${encodeURIComponent(r.email_parts.subject)}&body=${encodeURIComponent(r.email_parts.body)}`);
    void call(`/api/bid-requests/recipients/${r.id}`, "PATCH", { sent: "email" }).then(() => setStatus((s) => ({ ...s, [`${r.id}:e`]: "Email opened ✓" }))).catch(() => {});
  };

  if (!open) return null;
  const ready = !!jobId && shown.length > 0 && picked.length > 0 && picked.every((v) => (who[v.id] === "text" ? !!v.phone : who[v.id] === "email" ? !!v.email : !!v.phone || !!v.email));
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4, padding: 12 };

  return (
    <Drawer open={open} onClose={onClose} title="Bid request" sub={made ? "Sent · one link per vendor" : from ?? "Draft"} wide>
      {made ? (
        <div className="p-4 flex flex-col gap-2" style={{ maxWidth: 760 }}>
          <div style={{ fontSize: F.sm, color: T.ink2 }}>Each vendor has their own link. Their answer lands in their thread (as a note), on their page and on the job&apos;s Summary.</div>
          {made.map((r) => (
            <div key={r.id} className="flex items-center gap-2 flex-wrap" style={{ ...card, padding: "8px 10px" }}>
              <InitialsBox name={r.name} size={28} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: F.sm }}>{r.name ?? "Vendor"}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{status[r.id] ?? (r.channel === "email" ? "Email it below" : "")}{status[`${r.id}:e`] ? ` · ${status[`${r.id}:e`]}` : ""}</div>
              </div>
              {r.channel !== "text" && r.email && <button onClick={() => mail(r)} style={chip(false)}>Email ↗</button>}
              <button onClick={() => void navigator.clipboard?.writeText(r.url).then(() => setStatus((s) => ({ ...s, [`${r.id}:e`]: "Link copied" })))} style={chip(false)}>Copy link</button>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ ...chip(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>See their page</a>
            </div>
          ))}
          <div className="flex justify-end mt-2"><button onClick={onClose} style={{ ...chip(true), height: 36, padding: "0 16px" }}>Done</button></div>
        </div>
      ) : (
        <div className="p-3 lg:p-4 flex flex-col gap-3" style={{ background: T.slab, minHeight: "100%" }}>
          {err && <div className="rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}

          {/* 1 · job */}
          <section style={card}>
            {stepHead(1, "Which job")}
            {jobs === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : jobs.length === 0 ? <div style={{ fontSize: F.sm, color: T.ink3 }}>No open jobs.</div> : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(jobId && !jobs.some((j) => j.id === jobId) && job ? [{ id: job.id, title: job.title, address: job.address, status: null }, ...jobs] : jobs).slice(0, 24).map((j) => (
                  <button key={j.id} onClick={() => setJobId(j.id)} className="text-left rounded shrink-0 px-3 py-2"
                    style={{ width: 200, border: `1.5px solid ${j.id === jobId ? T.hiviz : T.hair}`, background: j.id === jobId ? T.card : "transparent", cursor: "pointer" }}>
                    <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{j.title ?? "Untitled job"}</div>
                    <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{j.address ?? "no address"}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 2 · scopes */}
          <section style={card}>
            {stepHead(2, "Which scopes they price", job ? `from the ${job.title ?? "job"} budget · your costs stay hidden` : undefined)}
            {!jobId ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Pick the job first.</div> : !job ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>
              : job.scopes.length === 0 ? <div style={{ fontSize: F.sm, color: T.ink3 }}>This job has no areas yet. Add them on the job first.</div> : (
              <div className="flex flex-col">
                {job.scopes.map((s) => {
                  const on = !!scopes[s.key];
                  return (
                    <div key={s.key} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                      <div className="flex items-center gap-2 py-1.5" style={{ cursor: "pointer" }} onClick={() => setOpen2({ ...open2, [s.key]: !open2[s.key] })}>
                        <Check on={on} onClick={() => setScopes({ ...scopes, [s.key]: !on })} label={`Include ${s.title}`} />
                        <span style={{ fontWeight: 600, fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{s.title}{s.size ? <span style={{ fontWeight: 400, color: T.ink3 }}> · {s.size}</span> : null}</span>
                        <span style={{ fontSize: F.xs, color: T.ink3 }}>{s.lines.length ? `${s.lines.length} line${s.lines.length === 1 ? "" : "s"}` : "no lines"} {open2[s.key] ? "▾" : "▸"}</span>
                      </div>
                      {open2[s.key] && s.lines.map((l) => {
                        const lon = lines[l.id] !== false, sup = supplied[l.id] ?? suppliedByDefault(l);
                        return (
                          <div key={l.id} className="flex items-center gap-2 py-1 pl-7" style={{ opacity: on ? 1 : 0.5 }}>
                            <Check size={15} on={lon} onClick={() => setLines({ ...lines, [l.id]: !lon })} label={`Include ${l.name}`} />
                            <span style={{ fontSize: F.sm, flex: 1, minWidth: 0, color: lon ? T.ink : T.ink3, ...clip }}>{l.name}</span>
                            <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{qty(l.qty, l.unit)}</span>
                            <button onClick={() => setSupplied({ ...supplied, [l.id]: !sup })} title="Who supplies the material"
                              style={{ ...chip(sup), height: 22, padding: "0 6px", fontSize: 10, background: sup ? T.greenDim : T.card, color: sup ? T.green : T.ink3, border: `1px solid ${sup ? T.green : T.hair}` }}>
                              {sup ? `${org ?? "We"} supplies` : "They price it"}
                            </button>
                          </div>
                        );
                      })}
                      {!s.lines.length && open2[s.key] && <div className="pl-7 pb-1" style={{ fontSize: F.xs, color: T.ink3 }}>No items on this area&apos;s budget.</div>}
                    </div>
                  );
                })}
                <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>
                  {anySupplied ? `Material marked "${org ?? "We"} supplies" is listed for them, not priced — they price labor.` : "Tap an area to pick its lines, or mark the material as yours."}
                </div>
              </div>
            )}
          </section>

          {/* 3 · packet */}
          <section style={card}>
            {stepHead(3, "What they see", "pulled from the job")}
            <div className="flex flex-wrap gap-1.5">
              {([["address", "Address & access", job?.address ?? "no address"], ["dates", "Pour date & price-by", null], ["quantities", "Quantities", null]] as const).map(([k, l, d]) => (
                <button key={k} onClick={() => setPk({ ...pk, [k]: !pk[k] })} style={chip(pk[k])} title={d ?? undefined}>{pk[k] ? "✓ " : ""}{l}</button>
              ))}
              {aerialN > 0 && <button onClick={() => setPk({ ...pk, aerial: !pk.aerial })} style={chip(pk.aerial)}>{pk.aerial ? "✓ " : ""}Aerial{aerialN > 1 ? ` · ${aerialN}` : ""}</button>}
              {photosN > 0 && <button onClick={() => setPk({ ...pk, photos: !pk.photos })} style={chip(pk.photos)}>{pk.photos ? "✓ " : ""}Site photos · {photosN}</button>}
              {(job?.files ?? []).filter((f) => f.kind === "plan").map((f) => (
                <button key={f.id} onClick={() => setPlans({ ...plans, [f.id]: !plans[f.id] })} style={{ ...chip(!!plans[f.id]), maxWidth: 240, ...clip }}>{plans[f.id] ? "✓ " : ""}{f.name}</button>
              ))}
            </div>
            {job && !job.files.length && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>No photos, plans or aerial on this job yet.</div>}
          </section>

          {/* 4 · pricing */}
          <section style={card}>
            {stepHead(4, "How they price it")}
            <div className="flex flex-wrap gap-1.5 items-center">
              {MODES.map(([k, l]) => <button key={k} onClick={() => setMode(k)} style={chip(mode === k)}>{l}</button>)}
              <span style={{ fontSize: F.xs, color: T.ink3 }}>{MODES.find((m) => m[0] === mode)?.[2]}</span>
            </div>
            <div className="flex flex-wrap gap-3 items-end mt-2">
              <label><span style={eyebrow}>Price by</span><br /><input type="date" value={priceBy} onChange={(e) => setPriceBy(e.target.value)} style={field} /></label>
              <label><span style={eyebrow}>Pour</span><br /><input type="date" value={pour} onChange={(e) => setPour(e.target.value)} style={field} /></label>
              <label className="flex items-center gap-1.5" style={{ fontSize: F.sm, height: 32 }}>
                <Check on={follow} onClick={() => setFollow(!follow)} label="Remind me to follow up" />
                <span>Remind me {priceBy ? "on the price-by date" : "in 3 days"} if they haven&apos;t answered</span>
              </label>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="A note for them (optional)" aria-label="Note for the vendors"
              style={{ ...field, height: "auto", width: "100%", padding: 8, marginTop: 8 }} />
          </section>

          {/* 5 · who */}
          <section style={card}>
            <div className="flex items-center">
              <div style={{ flex: 1 }}>{stepHead(5, "Who gets it", tradeHint ?? undefined)}</div>
              <button onClick={() => setAdding(!adding)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>{adding ? "Done adding" : "+ Add vendor"}</button>
            </div>
            {picked.length === 0 && !adding && <div style={{ fontSize: F.sm, color: T.ink3, marginBottom: 6 }}>Nobody yet — pick from the vendors below.</div>}
            {picked.map((v) => {
              const cur = who[v.id];
              return (
                <div key={v.id} className="flex items-center gap-2 py-1.5 flex-wrap" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                  <InitialsBox name={vname(v)} size={26} />
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{vname(v)}</div>
                    <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{[v.phone ? formatPhone(v.phone) : "no phone", v.email ?? "no email on file"].join(" · ")}</div>
                  </div>
                  {(["text", "email", "both"] as Ch[]).map((k) => {
                    const dis = (k !== "email" && !v.phone) || (k !== "text" && !v.email);
                    return <button key={k} disabled={dis} onClick={() => setWho({ ...who, [v.id]: k })} style={chip(cur === k, dis)}>{k === "text" ? "Text" : k === "email" ? "Email" : "Both"}</button>;
                  })}
                  <button onClick={() => { const n = { ...who }; delete n[v.id]; setWho(n); }} aria-label={`Take off ${vname(v)}`} style={{ color: T.ink3, fontSize: 18, width: 24 }}>×</button>
                </div>
              );
            })}
            {(adding || picked.length === 0) && (
              <div className="mt-2">
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a vendor or trade" aria-label="Find a vendor" style={{ ...field, width: "100%" }} />
                <div className="flex flex-col mt-1">
                  {suggest.map((v) => (
                    <button key={v.id} onClick={() => setWho({ ...who, [v.id]: defaultCh(v) })} className="flex items-center gap-2 py-1.5 text-left" style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                      <InitialsBox name={vname(v)} size={24} />
                      <span style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{vname(v)}</span>
                      <span style={{ fontSize: F.xs, color: T.ink3, flex: 1, minWidth: 0, ...clip }}>{[...(v.trades ?? []), v.bids?.sent ? v.bids.label : null, v.bids?.speed].filter(Boolean).join(" · ")}</span>
                      <span style={{ fontSize: F.xs, color: T.chalk }}>+ Add</span>
                    </button>
                  ))}
                  {!suggest.length && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>No other vendors match. Add one on the Vendors page.</div>}
                </div>
              </div>
            )}
            {preview && (
              <div className="mt-3 rounded p-2.5" style={{ background: T.sunk, fontSize: F.sm, lineHeight: 1.45 }}>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Text · each vendor gets their own link</div>
                {preview}
                <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Email carries the same words and link, from your own mail app.</div>
              </div>
            )}
          </section>

          <div className="flex items-center gap-3 flex-wrap sticky bottom-0 py-2" style={{ background: T.slab }}>
            <span style={{ fontSize: F.sm, color: T.ink2, flex: 1, minWidth: 180 }}>
              {texts} text{texts === 1 ? "" : "s"} · {emails} email{emails === 1 ? "" : "s"} · {shown.length} scope{shown.length === 1 ? "" : "s"} · {files.length} file{files.length === 1 ? "" : "s"}
            </span>
            <button onClick={() => void send()} disabled={!ready || busy}
              style={{ height: 40, padding: "0 18px", borderRadius: 4, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".06em",
                cursor: ready && !busy ? "pointer" : "not-allowed", opacity: ready && !busy ? 1 : 0.5 }}>
              {busy ? "Sending…" : `Send ${picked.length} bid request${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

