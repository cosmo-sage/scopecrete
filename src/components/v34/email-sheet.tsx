"use client";
/**
 * The email mirror on screen (migration 061): a list of mirrored emails and
 * the sheet for one — the original sender, Dusty-free text, its attachments
 * (from Documents' file viewer), and where it is filed. Coy files it on a
 * customer and/or a job: a job takes its files (PDFs into the Plan Room).
 * A domain suggestion is one tap. Nothing here creates a contact.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime } from "@/lib/v34/tokens";
import { sizeLabel } from "@/lib/files";

export interface EmailRow {
  id: string; subject: string | null; from_address: string | null; from_name: string | null;
  original_from_address: string | null; original_from_name: string | null; sent_at: string | null; created_at: string;
  customer_id: string | null; contact_id: string | null; job_id: string | null; suggested_customer_id: string | null;
  match: "exact" | "domain_suggested" | "coy" | "none"; match_note: string | null; status: "filed" | "unfiled" | "quarantined";
  customer_name: string | null; suggested_customer_name: string | null; job_title: string | null; contact_name: string | null;
  attachments: { total: number; fetched: number; held: number; failed: number };
}
interface Att { id: string; name: string; mime_type: string | null; byte_size: number | null; fetch_state: string; fetch_error: string | null; attempts: number; file: { id: string; url: string | null; kind: string } | null }
interface Detail { email: EmailRow & { text_body: string | null }; attachments: Att[]; options: { customers: Array<{ id: string; name: string }>; jobs: Array<{ id: string; title: string | null; customer_id: string | null; status: string }> } }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export const sender = (e: Pick<EmailRow, "original_from_name" | "original_from_address" | "from_name" | "from_address">) =>
  e.original_from_name || e.original_from_address || e.from_name || e.from_address || "Unknown sender";

function StatusTag({ e }: { e: EmailRow }) {
  const [bg, fg, label] = e.status === "quarantined" ? [T.redDim, T.red, "Not from your forwarders"]
    : e.status === "unfiled" ? (e.suggested_customer_id ? [T.sunDim, T.sun, `Looks like ${e.suggested_customer_name ?? "a customer"}`] : [T.sunDim, T.sun, "Unfiled"])
      : [T.greenDim, T.green, `${e.match === "exact" ? "Auto · " : ""}${[e.customer_name, e.job_title].filter(Boolean).join(" · ") || "Filed"}`];
  return <span style={{ fontSize: 10.5, borderRadius: 3, padding: "1px 6px", background: bg, color: fg, fontWeight: 600, ...clip, maxWidth: 260 }}>{label}</span>;
}

/** Mirrored emails, waiting-on-Coy first. `customer` narrows to one customer's. */
export function EmailList({ customer, q, onCount }: { customer?: string; q?: string; onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<EmailRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    const u = new URLSearchParams();
    if (customer) u.set("customer", customer);
    if (q && q.length >= 2) u.set("q", q);
    call(`/api/emails?${u}`, "GET").then((b) => { if (!off) { setRows(b.emails); setErr(null); onCount?.(b.emails.length); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [customer, q, tick, onCount]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return (
    <>
      {err && <div role="alert" style={{ fontSize: F.sm, color: T.red, padding: 8 }}>Couldn&apos;t load emails: {err}</div>}
      {rows === null && !err && <div className="animate-pulse rounded" style={{ height: 56, background: T.hairSoft }} />}
      {rows?.length === 0 && (
        <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>
          {customer ? "No emails for this customer yet." : "No emails yet. Forward bid emails to your intake address and they appear here, with their attachments."}
        </div>
      )}
      {rows?.map((e, i) => (
        <button key={e.id} onClick={() => setOpen(e.id)} className="w-full text-left flex items-start gap-3 px-3 py-2"
          style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", background: "transparent", cursor: "pointer", color: T.ink }}>
          <span className="shrink-0 rounded flex items-center justify-center" style={{ width: 40, height: 40, background: T.chalkDim, color: T.chalk, fontFamily: disp, fontSize: 11, fontWeight: 700 }}>MAIL</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="flex items-baseline gap-2">
              <span style={{ fontSize: F.sm, fontWeight: 600, ...clip, flex: 1, minWidth: 0 }}>{e.subject || "(no subject)"}</span>
              <span style={{ fontSize: F.xs, color: T.ink3, flexShrink: 0 }}>{relTime(e.sent_at ?? e.created_at)}</span>
            </span>
            <span className="flex items-center gap-2 mt-0.5" style={{ fontSize: F.xs, color: T.ink2, minWidth: 0 }}>
              <span style={{ ...clip, minWidth: 0 }}>{sender(e)}</span>
              {e.attachments.total > 0 && <span style={{ flexShrink: 0 }}>· {e.attachments.total} file{e.attachments.total === 1 ? "" : "s"}</span>}
              <StatusTag e={e} />
            </span>
          </span>
        </button>
      ))}
      {open && <EmailSheet id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

export function EmailSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [undo, setUndo] = useState<Pick<EmailRow, "customer_id" | "contact_id" | "job_id"> | null>(null);
  const load = useCallback(() => call(`/api/emails/${id}`, "GET").then((b) => { setD(b); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e))), [id]);
  useEffect(() => {
    let off = false;
    call(`/api/emails/${id}`, "GET").then((b) => { if (!off) setD(b); }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [id]);
  const file = useCallback(async (body: Record<string, unknown>) => {
    if (!d) return;
    setBusy(true);
    try {
      const before = { customer_id: d.email.customer_id, contact_id: d.email.contact_id, job_id: d.email.job_id };
      await call(`/api/emails/${id}`, "PATCH", body);
      setUndo(before);
      await load(); onChanged?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [d, id, load, onChanged]);

  const e = d?.email;
  const body = e?.text_body ?? "";
  const sel: React.CSSProperties = { height: 32, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, width: "100%" };
  const jobs = d ? d.options.jobs.filter((j) => !e?.customer_id || !j.customer_id || j.customer_id === e.customer_id) : [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div onClick={(x) => x.stopPropagation()} className="h-full overflow-y-auto" style={{ width: "min(560px, 100vw)", background: T.card, color: T.ink, paddingTop: "var(--sc-head)" }}>
        <div className="flex items-start gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrow}>Email</div>
            <div style={{ fontSize: F.md, fontWeight: 600, lineHeight: 1.25 }}>{e?.subject || (e ? "(no subject)" : "…")}</div>
            {e && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2 }}>
              From <b>{sender(e)}</b>{e.original_from_address && e.original_from_name ? ` <${e.original_from_address}>` : ""}
              {e.original_from_address && e.from_address && e.from_address !== e.original_from_address ? ` · forwarded by ${e.from_address}` : ""}
              {" · "}{new Date(e.sent_at ?? e.created_at).toLocaleString()}
            </div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ fontSize: 20, color: T.ink3, width: 32, height: 32 }}>×</button>
        </div>
        {err && <div role="alert" className="px-4 py-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
        {!d && !err && <div className="m-4 animate-pulse rounded" style={{ height: 160, background: T.hairSoft }} />}
        {d && e && (
          <>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: e.status === "filed" ? "transparent" : T.sunk }}>
              <div className="flex items-center gap-2 flex-wrap"><StatusTag e={e} />{e.match_note && <span style={{ fontSize: F.xs, color: T.ink3 }}>{e.match_note}</span>}</div>
              {e.status === "quarantined" && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 6 }}>Kept, but its files wait until you file it — this didn&apos;t come from one of your forwarding addresses.</div>}
              {e.suggested_customer_id && !e.customer_id && (
                <button disabled={busy} onClick={() => void file({ accept_suggestion: true })} className="rounded mt-2"
                  style={{ height: 32, padding: "0 12px", background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  File on {e.suggested_customer_name ?? "that customer"}
                </button>
              )}
              <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ fontSize: F.xs, color: T.ink2 }}>Customer
                  <select aria-label="Customer" disabled={busy} value={e.customer_id ?? ""} onChange={(x) => void file({ customer_id: x.target.value || null, ...(x.target.value ? {} : { contact_id: null }) })} style={sel}>
                    <option value="">None</option>
                    {d.options.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: F.xs, color: T.ink2 }}>Job
                  <select aria-label="Job" disabled={busy} value={e.job_id ?? ""} onChange={(x) => void file({ job_id: x.target.value || null })} style={sel}>
                    <option value="">None</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.title || "Untitled job"}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-3 mt-2" style={{ fontSize: F.xs }}>
                {e.job_id && <Link href={`/dashboard/scope/${e.job_id}/plans`} style={{ color: T.chalk }}>Open the Plan room ›</Link>}
                {e.customer_id && <Link href={`/dashboard/customers/${e.customer_id}`} style={{ color: T.chalk }}>Open the customer ›</Link>}
                {undo && <button disabled={busy} onClick={() => { const u = undo; setUndo(null); void file({ ...u }).then(() => setUndo(null)); }} style={{ color: T.chalk, textDecoration: "underline" }}>Undo</button>}
              </div>
              {e.job_id && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Its files are on the job; PDFs are in the Plan room.</div>}
            </div>

            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div style={eyebrow}>Attachments</div>
              {!d.attachments.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>None.</div>}
              {d.attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}`, fontSize: F.sm }}>
                  <span style={{ flex: 1, minWidth: 0, ...clip }}>{a.name}</span>
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>{sizeLabel(a.byte_size)}</span>
                  {a.file ? <Link href={`/dashboard/documents?file=${a.file.id}`} style={{ fontSize: F.xs, color: T.chalk }}>Open</Link>
                    : <span title={a.fetch_error ?? ""} style={{ fontSize: F.xs, color: a.fetch_state === "failed" ? T.red : T.ink3 }}>
                      {a.fetch_state === "held" ? "waiting until filed" : a.fetch_state === "waiting" ? "fetching…" : a.fetch_state === "skipped" ? `skipped — ${a.fetch_error ?? ""}` : `couldn't fetch${a.attempts >= 3 ? "" : " — retrying"}`}
                    </span>}
                </div>
              ))}
            </div>

            <div className="px-4 py-3">
              <div style={eyebrow}>The email</div>
              <div style={{ fontSize: F.sm, whiteSpace: "pre-wrap", lineHeight: 1.5, overflowWrap: "anywhere" }}>{all || body.length <= 4000 ? body || "(no text)" : `${body.slice(0, 4000)}…`}</div>
              {body.length > 4000 && !all && <button onClick={() => setAll(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", marginTop: 6 }}>Show all</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
