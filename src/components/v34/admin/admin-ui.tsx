"use client";

/**
 * The ScopeCrete admin's small parts (Claude Design "Super Admin" package):
 * panels, tiles, tags, bars, the conveyor, the confirm-with-a-reason dialog,
 * the New company drawer and the toast. Styles in src/styles/admin.css.
 */

import React, { useEffect, useState } from "react";
import { cleanSlug, PLANS, planLabel } from "@/lib/admin";

export const ICONS: Record<string, string> = {
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  companies: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  pipelines: "M2 7h7l3 5 3-5h7M2 17h7l3-5 3 5h7",
  dusty: "M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9z",
  usage: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  feedback: "M4 5h16v11H9l-5 4z",
  releases: "M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 5-5 4-9 6",
  costs: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  log: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  check: "M20 6L9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  search: "M11 11a5 5 0 1 0-10 0 5 5 0 0 0 10 0zm3.5 3.5L18 18",
};

export function Ico({ d, size }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Panel({ title, right, children, pad = true }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="panel">
      <div className="ph"><span className="lbl">{title}</span>{right != null && <span className="r">{right}</span>}</div>
      {pad ? <div className="pb">{children}</div> : children}
    </div>
  );
}

export function Tile({ label, value, sub, na }: { label: string; value: React.ReactNode; sub?: React.ReactNode; na?: boolean }) {
  return (
    <div className={`tile${na ? " na" : ""}`}>
      <span className="lbl">{label}</span>
      <span className="v">{value}</span>
      {sub != null && sub !== "" && <span className="d">{sub}</span>}
    </div>
  );
}

export const Dot = ({ h }: { h: string }) => <i className={`dot ${h}`} />;
export const Tag = ({ c, children }: { c?: string; children: React.ReactNode }) => <span className={`tag ${c ?? ""}`}>{children}</span>;

export function Bar({ pct, c, width }: { pct: number; c?: string; width?: number }) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return <span className={`bar ${c ?? ""}`} style={width ? { width } : undefined}><i style={{ width: `${p}%` }} /></span>;
}

export function Spark({ data, color = "var(--sc-ink2)", w = 72, h = 18 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const mx = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (v / mx) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

/** Daily bars with day labels under them. */
export function DayBars({ data, labels, color = "var(--sc-ink)" }: { data: number[]; labels: string[]; color?: string }) {
  const W = 600, H = 120, n = Math.max(1, data.length), gw = W / n, mx = Math.max(1, ...data);
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
      {data.map((v, i) => { const bh = (v / mx) * H; return <rect key={i} x={i * gw + 6} y={H - bh} width={gw - 12} height={bh} fill={color} />; })}
      {labels.map((l, i) => <text key={i} x={i * gw + gw / 2} y={H + 13} fontSize="11" fill="var(--sc-ink3)" textAnchor="middle">{l}</text>)}
    </svg>
  );
}

export interface Stage { l: string; v: React.ReactNode; s?: React.ReactNode; bad?: boolean; c?: string }
export function Conveyor({ stages }: { stages: Stage[] }) {
  return (
    <div className="conv">
      {stages.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="arrow">›</span>}
          <div className={`stg ${s.c ?? ""}`}>
            <span className="lbl">{s.l}</span>
            <span className="v">{s.v}</span>
            {s.s != null && s.s !== "" && <span className={`s${s.bad ? " bad" : ""}`}>{s.s}</span>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><b>{title}</b><p>{children}</p></div>;
}

export function BarRow({ label, value, max, c = "v", text }: { label: React.ReactNode; value: number; max: number; c?: string; text?: React.ReactNode }) {
  return (
    <div className="brow">
      <span>{label}</span>
      <Bar pct={max ? (value / max) * 100 : 0} c={c} />
      <span className="r tn">{text ?? value.toLocaleString()}</span>
    </div>
  );
}

// ------------------------------------------------------------------ confirm

export interface ConfirmAsk {
  title: string; what: React.ReactNode; who: React.ReactNode; ok: string; danger?: boolean;
  run: (reason: string) => Promise<string | void>;
}

/** Every write: what changes, for whom, a reason for the admin log, then the call. */
export function Confirm({ ask, onClose, admin }: { ask: ConfirmAsk; onClose: (msg?: string) => void; admin: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const go = async () => {
    if (reason.trim().length < 3) { setBad(true); return; }
    setBusy(true); setErr(null);
    try { const msg = await ask.run(reason.trim()); onClose(msg || "Done"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const at = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={ask.title}>
        <h3>{ask.title}</h3>
        <div className="ch"><span><b>What changes:</b> {ask.what}</span><span><b>For whom:</b> {ask.who}</span></div>
        <div className={`fld${bad ? " err" : ""}`}>
          <label htmlFor="adm-reason">Reason (goes in the admin log)</label>
          <textarea id="adm-reason" autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setBad(false); }} placeholder="e.g. Customer reported a text never showed up" />
        </div>
        <p>Written to the admin log as {admin} at {at} CT.</p>
        {err && <p className="dn">{err}</p>}
        <div className="acts">
          <button className="ib" onClick={() => onClose()} disabled={busy}>Cancel</button>
          <button className={`ib ${ask.danger ? "dng" : "pri"}`} onClick={go} disabled={busy}>{busy ? "Working…" : ask.ok}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new company

interface Draft { name: string; slug: string; email: string; plan: string; reason: string }
export interface Created { org_id: string; invite_url: string; expires_at: string; name: string; slug: string; email: string }

/** Company → owner & plan → review; then the invite link, shown once. */
export function NewCompany({ onClose, onCreated, post }: {
  onClose: () => void; onCreated: (c: Created) => void;
  post: (body: Record<string, unknown>) => Promise<{ org_id: string; invite_url: string; expires_at: string }>;
}) {
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Draft>({ name: "", slug: "", email: "", plan: "solo", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof Draft, v: string) => { setD((x) => ({ ...x, [k]: v })); setErr(null); };

  const next = () => {
    if (step === 1 && (!d.name.trim() || d.slug.length < 2)) { setErr("A name and an address of 2 or more letters or numbers."); return; }
    if (step === 2 && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email.trim())) { setErr("The owner's email."); return; }
    setStep(step + 1);
  };
  const create = async () => {
    if (d.reason.trim().length < 3) { setErr("A note for the admin log."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await post({ action: "create_org", name: d.name.trim(), slug: d.slug, email: d.email.trim(), plan: d.plan, reason: d.reason.trim() });
      const c = { ...r, name: d.name.trim(), slug: d.slug, email: d.email.trim() };
      setMade(c); onCreated(c);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const copy = async () => {
    if (!made) return;
    try { await navigator.clipboard.writeText(made.invite_url); setCopied(true); } catch { setCopied(false); }
  };
  const steps = ["Company", "Owner & plan", "Review"];
  return (
    <>
      <div className="scrim" onMouseDown={() => { if (!busy) onClose(); }} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="New company">
        <div className="dh"><h3>New company</h3><button className="ib sm" onClick={onClose} disabled={busy}>Close</button></div>
        <div className="db">
          {made ? (
            <>
              <div className="ok" style={{ border: 0, padding: 0 }}><Ico d={ICONS.check} />{made.name} is made</div>
              <div className="fld">
                <label>The owner&apos;s invite link — shown once</label>
                <div className="box" style={{ wordBreak: "break-all", fontFamily: "var(--sc-font-code, monospace)", fontSize: 11.5 }}>{made.invite_url}</div>
                <div className="acts" style={{ justifyContent: "flex-start" }}>
                  <button className="ib pri" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
                  <a className="ib" href={`mailto:${encodeURIComponent(made.email)}?subject=${encodeURIComponent("Your ScopeCrete account")}&body=${encodeURIComponent(`Here's your link to set up ${made.name} on ScopeCrete:\n\n${made.invite_url}\n\nSign in with this email address (${made.email}).`)}`}>Email it</a>
                </div>
                <span className="hint">Send it yourself — ScopeCrete sends nothing. It works once, for {made.email}, for 14 days. Only its fingerprint is kept, so it can&apos;t be shown again.</span>
              </div>
              <div className="note">
                <b>Still by hand</b>
                Their own address, {made.slug}.app.scopecrete.ai, needs a Cloudflare record (CNAME {made.slug}.app → cname.vercel-dns.com, DNS only) and the domain added to the Vercel project. Until then they sign in on app.scopecrete.ai. Their Quo webhook and intake email are set up from their Lines page and with you.
              </div>
            </>
          ) : (
            <>
              <div className="steps">
                {steps.map((s, i) => (
                  <React.Fragment key={s}>
                    <span className={i + 1 === step ? "on" : i + 1 < step ? "d" : ""}><i>{i + 1 < step ? "✓" : i + 1}</i>{s}</span>
                    {i < 2 && <em />}
                  </React.Fragment>
                ))}
              </div>
              {step === 1 && (
                <>
                  <div className="fld"><label htmlFor="nc-name">Company name</label>
                    <input id="nc-name" autoFocus value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cypress Concrete LLC" maxLength={120} /></div>
                  <div className="fld"><label htmlFor="nc-slug">Their address</label>
                    <input id="nc-slug" value={d.slug} onChange={(e) => set("slug", cleanSlug(e.target.value))} placeholder="cypress" />
                    <span className="hint"><b>{d.slug || "cypress"}</b>.app.scopecrete.ai — letters and numbers only</span></div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="fld"><label htmlFor="nc-email">Owner email</label>
                    <input id="nc-email" type="email" autoFocus value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="owner@company.com" />
                    <span className="hint">They get the invite link and become the owner.</span></div>
                  <div className="fld"><label htmlFor="nc-plan">Plan</label>
                    <select id="nc-plan" value={d.plan} onChange={(e) => set("plan", e.target.value)}>
                      {PLANS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
                    </select>
                    <span className="hint">Recorded on the company. Nothing is billed — billing isn&apos;t built.</span></div>
                </>
              )}
              {step === 3 && (
                <>
                  <div className="box"><dl className="kv">
                    <dt>Company</dt><dd><b>{d.name}</b></dd>
                    <dt>Address</dt><dd>{d.slug}.app.scopecrete.ai</dd>
                    <dt>Owner</dt><dd>{d.email}</dd>
                    <dt>Plan</dt><dd>{planLabel(d.plan)}</dd>
                  </dl></div>
                  <div className="note"><b>What happens on Create</b>Makes the company and an owner invite link for you to send. Logged in the admin log.</div>
                  <div className="fld"><label htmlFor="nc-reason">Note for the admin log</label>
                    <input id="nc-reason" autoFocus value={d.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Signed up at the Houma meet-up" /></div>
                </>
              )}
              {err && <span className="dn" style={{ fontSize: 12.5 }}>{err}</span>}
            </>
          )}
        </div>
        <div className="df">
          {made ? <button className="ib pri" onClick={onClose}>Done</button> : (
            <>
              {step > 1 && <button className="ib" onClick={() => { setStep(step - 1); setErr(null); }} disabled={busy}>Back</button>}
              <span style={{ flex: 1 }} />
              {step < 3 ? <button className="ib pri" onClick={next}>Next ›</button>
                : <button className="ib pri" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create company"}</button>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function useToast(): [React.ReactNode, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3600);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}

// ------------------------------------------------------------------ new owner link

/** A fresh owner invite for a company that already exists (migration 112): the email,
 *  a reason for the admin log, then the link — shown once. The open invite for that
 *  email is withdrawn, so an old link stops working. Nothing is deleted. */
export function OwnerLink({ org, name, email: start, onClose, post }: {
  org: string; name: string; email: string; onClose: () => void;
  post: (body: Record<string, unknown>) => Promise<{ invite_url: string; expires_at: string }>;
}) {
  const [email, setEmail] = useState(start);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ invite_url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) { setErr("The owner's email."); return; }
    if (reason.trim().length < 3) { setErr("A note for the admin log."); return; }
    setBusy(true); setErr(null);
    try { setMade(await post({ action: "owner_link", org, email: email.trim(), reason: reason.trim() })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const copy = async () => {
    if (!made) return;
    try { await navigator.clipboard.writeText(made.invite_url); setCopied(true); } catch { setCopied(false); }
  };
  const body = made ? `Here's your link to set up ${name} on ScopeCrete:\n\n${made.invite_url}\n\nSign in with this email address (${email.trim()}). If you already have a ScopeCrete password, use it; if not, you'll set one after you join.` : "";
  return (
    <>
      <div className="scrim" onMouseDown={() => { if (!busy) onClose(); }} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="New owner link">
        <div className="dh"><h3>New owner link</h3><button className="ib sm" onClick={onClose} disabled={busy}>Close</button></div>
        <div className="db">
          {made ? (
            <div className="fld">
              <label>{name}&apos;s owner link — shown once</label>
              <div className="box" style={{ wordBreak: "break-all", fontFamily: "var(--sc-font-code, monospace)", fontSize: 11.5 }}>{made.invite_url}</div>
              <div className="acts" style={{ justifyContent: "flex-start" }}>
                <button className="ib pri" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
                <a className="ib" href={`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent("Your ScopeCrete account")}&body=${encodeURIComponent(body)}`}>Email it</a>
              </div>
              <span className="hint">Send it yourself — ScopeCrete sends nothing. It works once, for {email.trim()}, for 14 days. Any older link for that email no longer works.</span>
            </div>
          ) : (
            <>
              <p className="mut" style={{ fontSize: 13, margin: 0 }}>For {name}. The company, its data and anyone already in it stay as they are; the old open invite for this email is withdrawn.</p>
              <div className="fld"><label htmlFor="ol-email">Owner email</label>
                <input id="ol-email" type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="owner@company.com" /></div>
              <div className="fld"><label htmlFor="ol-reason">Reason (goes in the admin log)</label>
                <textarea id="ol-reason" value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="e.g. The first link was lost" /></div>
              {err && <p className="dn">{err}</p>}
              <div className="acts"><button className="ib pri" onClick={make} disabled={busy}>{busy ? "Working…" : "Make the link"}</button></div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ view company

/** Open a company's app read only (migration 121): a reason for the admin log, then the whole
 *  app as its owner sees it, for up to 8 hours. Postgres refuses every write while the view is
 *  on; the red strip at the top ends it. */
export function ViewCompany({ org, name, onClose, post }: {
  org: string; name: string; onClose: () => void;
  post: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (reason.trim().length < 3) { setErr("A note for the admin log."); return; }
    setBusy(true); setErr(null);
    try { await post({ org, reason: reason.trim() }); window.location.assign("/dashboard"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <>
      <div className="scrim" onMouseDown={() => { if (!busy) onClose(); }} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="View company">
        <div className="dh"><h3>View {name}</h3><button className="ib sm" onClick={onClose} disabled={busy}>Close</button></div>
        <div className="db">
          <p className="mut" style={{ fontSize: 13, margin: 0 }}>
            Opens {name}&apos;s app as its owner sees it — jobs, threads, customers, budgets — read only, for up to 8 hours.
            Nothing can be changed while you look. It goes in the admin log with your reason.
          </p>
          <div className="fld"><label htmlFor="vc-reason">Reason (goes in the admin log)</label>
            <textarea id="vc-reason" autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="e.g. Checking their setup with Jeremy" /></div>
          {err && <p className="dn">{err}</p>}
          <div className="acts"><button className="ib pri" onClick={open} disabled={busy}>{busy ? "Opening…" : "View company"}</button></div>
        </div>
      </div>
    </>
  );
}
