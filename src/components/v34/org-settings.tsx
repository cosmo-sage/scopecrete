"use client";

/**
 * Settings → You and Organisation (Claude Design handoff design/org-branding/;
 * Coy on Vercel, 2026-09-30: "it should show User: Coy Sacco · Email ·
 * Organization", and rename the org and upload its logo).
 *
 *   - You: your name and phone (✎ — PATCH /api/me; both go on the proposals
 *     you prepare), your email, the org and your role.
 *   - Organisation (owners edit; everyone else read-only, "Owners only"):
 *       Name → PATCH /api/org (sc_rename_org — the name lives once, orgs.name).
 *       Logo → two slots, light backgrounds (dark lettering) and dark
 *         backgrounds (light lettering, Night Shift). PNG / WebP are shrunk to
 *         1200px here, then sent straight to storage; an SVG is cleaned on
 *         the server (/api/org/logo/done).
 *       People → every member with name, email and role (sc_org_people).
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, strong } from "@/lib/v34/tokens";
import { sendBytes } from "@/components/v34/files-panel";
import { usePref } from "@/lib/v34/prefs";
import { ROLES, FIELD_PAGES, roleLabel, accessSummary } from "@/lib/access";

export interface OrgInfo { id: string; name: string; logo_light: boolean; logo_dark: boolean; logo_stamp: string | null }
interface Person { user_id: string; name: string | null; email: string | null; role: string | null; you: boolean;
  contact_id?: string | null; contact_name?: string | null; pages?: string[]; all_jobs?: boolean; job_ids?: string[] }
type Variant = "light" | "dark";

const btn: React.CSSProperties = { ...eyebrow, fontSize: 12, height: 30, padding: "0 10px", borderRadius: 3, cursor: "pointer" };

/**
 * Coy, 2026-10-06: the org's logo on or off in the header. Off, the header
 * shows the scopecrete.ai emblem and wordmark alone; proposals keep the logo.
 * Saved on the account (user_preferences, migration 053), like the theme.
 */
function HeaderLogoSwitch() {
  const [on, setOn] = usePref<boolean>("header_logo", true);
  const shown = on !== false;
  return (
    <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: F.sm, color: T.ink2 }}>Show the logo in the header</div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>
          {shown ? "Your logo, with \u201cpowered by scopecrete.ai\u201d beside it." : "The header shows scopecrete.ai. Proposals still carry your logo."}
        </div>
      </div>
      <button type="button" role="switch" aria-checked={shown} aria-label="Show the logo in the header" onClick={() => setOn(!shown)}
        style={{ width: 38, height: 22, borderRadius: 999, background: shown ? T.green : T.hairStrong, position: "relative", cursor: "pointer", flex: "0 0 auto" }}>
        <span style={{ position: "absolute", top: 3, left: shown ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

/** Shrink a raster logo so its longest side is at most 1200px (PNG out). SVGs pass through. */
async function prepare(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That image could not be opened.")); i.src = url; });
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" });
  } finally { URL.revokeObjectURL(url); }
}

/** One of your own details, edited in place (✎) and saved to your account through PATCH /api/me. */
function MineField({ field, value, label, placeholder, empty, inputMode, onSaved }: {
  field: "name" | "phone"; value: string | null; label: string; placeholder: string; empty: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const optional = field === "phone";
  async function save() {
    const v = draft.trim();
    if (!v && !optional) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: v }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    setEditing(false); onSaved();
  }
  if (editing) return (
    <>
      <span className="flex gap-1.5">
        <input value={draft} autoFocus maxLength={80} inputMode={inputMode} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 min-w-0" style={{ height: 30, padding: "0 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm }} />
        <button onClick={() => void save()} disabled={busy || (!optional && !draft.trim())} style={{ ...btn, border: "none", background: T.hiviz, color: T.onHiviz }}>{busy ? "…" : "Save"}</button>
      </span>
      {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </>
  );
  return (
    <span className="flex items-baseline gap-2">
      {value ? <span style={field === "name" ? { fontFamily: strong, fontWeight: 600, fontSize: F.md, ...clip } : { ...clip }}>{value}</span>
        : <span style={{ color: T.ink3 }}>{empty}</span>}
      <button onClick={() => { setDraft(value ?? ""); setEditing(true); }} aria-label={`Edit your ${label}`} style={{ color: T.chalk, fontSize: F.sm, cursor: "pointer" }}>{value ? "✎" : `Add your ${label}`}</button>
    </span>
  );
}

export function YouSection({ name, phone, email, orgName, role, onSaved }: {
  name: string | null; phone: string | null; email: string | null; orgName: string | null; role: string | null; onSaved: () => void;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline gap-2" style={{ padding: "3px 0" }}>
      <span style={{ ...eyebrow, width: 92, flex: "none" }}>{label}</span>
      <span className="flex-1 min-w-0" style={{ fontSize: F.sm }}>{value}</span>
    </div>
  );
  return (
    <section>
      <div style={eyebrow}>You</div>
      <div className="mt-1">
        {row("User", <MineField field="name" value={name} label="name" placeholder="Your name" empty="No name yet" onSaved={onSaved} />)}
        {row("Phone", <MineField field="phone" value={phone} label="phone" placeholder="(225) 555-0123" empty="No phone yet" inputMode="tel" onSaved={onSaved} />)}
        {row("Email", <span style={{ color: T.ink2, ...clip, display: "block" }}>{email ?? "—"}</span>)}
        {row("Organization", <span style={{ color: T.ink2 }}>{orgName ?? "—"}{role ? <span style={{ color: T.ink3 }}> · {role}</span> : null}</span>)}
      </div>
      <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Your name and phone go on the proposals you prepare.</div>
    </section>
  );
}

export function OrgSection({ onChanged }: { onChanged: () => void }) {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [accessReady, setAccessReady] = useState(false);
  const [rev, setRev] = useState(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Variant | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/org").then(async (r) => ({ ok: r.ok, b: await r.json().catch(() => ({})) })).then(({ ok, b }) => {
      if (off) return;
      if (!ok) { setLoadErr(b?.error ?? "Couldn't load the organisation."); return; }
      setOrg(b.org); if (rev === 0) setDraft(b.org.name); setCanEdit(!!b.can_edit); setPeople(b.people ?? []); setAccessReady(!!b.access_ready);
    }).catch(() => { if (!off) setLoadErr("Couldn't load the organisation."); });
    return () => { off = true; };
  }, [rev]);

  const took = (o: OrgInfo) => { setOrg(o); onChanged(); };
  const dirty = !!org && draft.trim() !== "" && draft.trim() !== org.name;

  async function saveName() {
    if (!dirty) return;
    setState("saving"); setErr(null);
    const r = await fetch("/api/org", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.trim() }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setState("error"); setErr(b?.error ?? `HTTP ${r.status}`); return; }
    took(b.org); setDraft(b.org.name); setState("saved");
    setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2400);
  }

  async function upload(variant: Variant, picked: File) {
    setBusy(variant); setErr(null);
    try {
      const file = await prepare(picked);
      const start = await fetch("/api/org/logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant, mime: file.type, size: file.size }) });
      const s = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(s?.error ?? `HTTP ${start.status}`);
      await sendBytes(s.upload.signed_url, file, () => {});
      const done = await fetch("/api/org/logo/done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant, path: s.upload.path }) });
      const d = await done.json().catch(() => ({}));
      if (!done.ok) throw new Error(d?.error ?? `HTTP ${done.status}`);
      took(d.org);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(null);
  }
  async function remove(variant: Variant) {
    setBusy(variant); setErr(null);
    const r = await fetch(`/api/org/logo?variant=${variant}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (r.ok) took(b.org); else setErr(b?.error ?? `HTTP ${r.status}`);
    setBusy(null);
  }

  if (loadErr) return <section className="py-3"><div style={eyebrow}>Organisation</div><div style={{ fontSize: F.sm, color: T.red }}>{loadErr}</div></section>;
  if (!org) return <section className="py-3"><div style={eyebrow}>Organisation</div><div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div></section>;

  const help = state === "saved" ? "Renamed — the header, Dusty and everything that reads the name now say it."
    : dirty ? "Saving renames the organisation everywhere it appears."
    : "Shown in the header, to your team, and to Dusty; quotes and invoices will carry it.";

  return (
    <section className="py-3">
      <div className="flex items-baseline">
        <span className="flex-1" style={{ fontFamily: strong, fontWeight: 600, fontSize: F.md }}>Organisation</span>
        {!canEdit && <span style={{ ...eyebrow, color: T.ink3 }}>Owners only</span>}
      </div>

      <label style={{ ...eyebrow, display: "block", marginTop: 10, color: T.ink2 }} htmlFor="sc-org-name">Name</label>
      <div className="flex gap-1.5" style={{ marginTop: 4 }}>
        <input id="sc-org-name" value={draft} disabled={!canEdit} maxLength={120}
          onChange={(e) => { setDraft(e.target.value); setState("idle"); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void saveName(); }}
          className="flex-1 min-w-0" style={{ height: 36, padding: "0 10px", borderRadius: 4, fontSize: F.md,
            border: `1px solid ${dirty ? T.hivizSoft : T.hairStrong}`, background: T.card, color: T.ink }} />
        {canEdit && (
          <button onClick={() => void saveName()} disabled={!dirty || state === "saving"}
            style={{ ...btn, fontSize: 13, height: 36, padding: "0 14px", border: "none", borderRadius: 4,
              background: dirty ? T.hiviz : T.hairStrong, color: T.onHiviz, cursor: dirty ? "pointer" : "default" }}>
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save"}
          </button>
        )}
      </div>
      <div style={{ fontSize: F.xs, marginTop: 4, color: err ? T.red : state === "saved" ? T.green : T.ink3 }}>{err ?? help}</div>

      <div style={{ ...eyebrow, marginTop: 12, color: T.ink2 }}>Logo</div>
      {(["light", "dark"] as const).map((v) => (
        <LogoSlot key={v} variant={v} has={v === "light" ? org.logo_light : org.logo_dark} stamp={org.logo_stamp}
          canEdit={canEdit} busy={busy === v} onPick={(f) => void upload(v, f)} onRemove={() => void remove(v)} />
      ))}
      <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 5 }}>
        Transparent PNG, SVG or WebP, at least 600px wide. Shown 28px tall in the header with &ldquo;powered by scopecrete.ai&rdquo; beside it.
      </div>
      <HeaderLogoSwitch />

      <People people={people} canEdit={canEdit} accessReady={accessReady} onChanged={() => setRev((n) => n + 1)} />
    </section>
  );
}

/**
 * People and invites (migration 062; Coy, 2026-10-01: "add other users to my
 * Org … and send invites to the dashboard"). An owner invites an email as
 * owner, member or onsite estimator; the link is shown once, to copy, text or
 * mail from his own account — ScopeCrete sends nothing. Pending invites can be
 * withdrawn; a member can be removed (never yourself, never the last owner).
 *
 * Onsite estimators (migration 081; Coy, 2026-10-05): "they need to be setup
 * as a vendor before I can enable internal access" — an estimator is picked
 * from the vendors, given pages (Photos & files · Plan room · Budget) and jobs
 * (every job or the ones ticked), and sees nothing else. ✎ on a person changes
 * it later.
 */
interface Invite { id: string; email: string; role: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null;
  contact_id?: string | null; pages?: string[]; all_jobs?: boolean; job_ids?: string[] }
interface AccessDraft { role: string; contact_id: string | null; pages: string[]; all_jobs: boolean; job_ids: string[] }
interface VendorOpt { id: string; name: string | null; company_name: string | null; email: string | null; contact_subtype: string | null }
interface JobOpt { id: string; title: string | null; address: string | null; status: string | null }

/** A vendor from their page's "Give app access" (vendor-page.tsx), waiting for this form. */
export const PENDING_VENDOR_KEY = "sc:invite-vendor";

function People({ people, canEdit, accessReady, onChanged }: { people: Person[]; canEdit: boolean; accessReady: boolean; onChanged: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState<AccessDraft>({ role: "member", contact_id: null, pages: ["files", "plan_room"], all_jobs: false, job_ids: [] });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [vendors, setVendors] = useState<VendorOpt[] | null>(null);
  const [jobs, setJobs] = useState<JobOpt[] | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    let off = false;
    fetch("/api/org/invites").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off && b?.invites) setInvites(b.invites); }).catch(() => {});
    return () => { off = true; };
  }, [canEdit, tick]);
  // A vendor sent here from their page: open the invite on them.
  useEffect(() => {
    if (!canEdit || !accessReady) return;
    let pending: { contact_id: string; email: string | null } | null = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_VENDOR_KEY) ?? "null"); sessionStorage.removeItem(PENDING_VENDOR_KEY); } catch { /* private mode */ }
    if (pending?.contact_id) {
      Promise.resolve().then(() => {
        setOpen(true); setEditing(null); setMade(null);
        setDraft((d) => ({ ...d, role: "field", contact_id: pending!.contact_id }));
        if (pending!.email) setEmail(pending!.email);
      });
    }
  }, [canEdit, accessReady]);
  // The vendors and jobs to pick from, once an estimator is being set up.
  const needLists = (open || editing) && draft.role === "field";
  useEffect(() => {
    if (!needLists) return;
    let off = false;
    if (!vendors) fetch("/api/vendors").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off) setVendors((b?.vendors ?? []) as VendorOpt[]); }).catch(() => {});
    if (!jobs) fetch("/api/jobs").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off) setJobs((b?.jobs ?? []) as JobOpt[]); }).catch(() => {});
    return () => { off = true; };
  }, [needLists, vendors, jobs]);
  const pending = invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date());

  async function invite() {
    setBusy(true); setErr(null); setMade(null); setCopied(false);
    const r = await fetch("/api/org/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...draft }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    setMade({ email: b.invite.email, link: b.link }); setEmail(""); setTick((n) => n + 1);
  }
  async function saveAccess(p: Person) {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/org/members/${p.user_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    setEditing(null); onChanged();
  }
  async function revoke(id: string) {
    const r = await fetch(`/api/org/invites/${id}`, { method: "DELETE" });
    if (r.ok) setTick((n) => n + 1); else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't withdraw it.");
  }
  async function remove(p: Person) {
    if (!window.confirm(`Take ${p.name ?? p.email} out of the organisation? Their account stays; they stop seeing it.`)) return;
    const r = await fetch(`/api/org/members/${p.user_id}`, { method: "DELETE" });
    if (r.ok) onChanged(); else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't remove them.");
  }
  function startEdit(p: Person) {
    setOpen(false); setMade(null); setErr(null); setEditing(p.user_id);
    setDraft({ role: p.role ?? "member", contact_id: p.contact_id ?? null, pages: p.pages ?? [], all_jobs: !!p.all_jobs, job_ids: p.job_ids ?? [] });
  }
  async function copy() { try { await navigator.clipboard.writeText(made!.link); setCopied(true); } catch { /* blocked */ } }
  const mail = made ? `mailto:${made.email}?subject=${encodeURIComponent("Join me on ScopeCrete")}&body=${encodeURIComponent(`Here's your invite to our ScopeCrete dashboard:\n\n${made.link}\n\nSign in with this email address (${made.email}). The link works once and expires in 14 days.`)}` : "";
  const sms = made ? `sms:?&body=${encodeURIComponent(`Your ScopeCrete invite (sign in as ${made.email}): ${made.link}`)}` : "";
  const small: React.CSSProperties = { ...btn, fontSize: 12, height: 30, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center" };
  const fieldReady = draft.role !== "field" || !!draft.contact_id;
  const form = (
    <AccessForm draft={draft} setDraft={setDraft} vendors={vendors} jobs={jobs} accessReady={accessReady} small={small}
      onVendor={(v) => { if (!email && v?.email && !editing) setEmail(v.email); }} />
  );

  return (
    <>
      <div className="flex items-center" style={{ marginTop: 12 }}>
        <span className="flex-1" style={{ ...eyebrow, color: T.ink2 }}>People</span>
        {canEdit && !open && <button onClick={() => { setOpen(true); setEditing(null); setMade(null); setDraft({ role: "member", contact_id: null, pages: ["files", "plan_room"], all_jobs: false, job_ids: [] }); }} style={small}>+ Invite</button>}
      </div>
      <div className="mt-1" style={{ border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card }}>
        {people.length === 0 && <div style={{ padding: "8px 10px", fontSize: F.sm, color: T.ink3 }}>No one listed.</div>}
        {people.map((p, i) => (
          <div key={p.user_id} style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
            <div className="flex items-center gap-2" style={{ padding: "7px 10px" }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{p.name ?? <span style={{ color: T.ink3, fontWeight: 400 }}>No name yet</span>}{p.you && <span style={{ color: T.ink3, fontWeight: 400 }}> · you</span>}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{p.email ?? "—"}</div>
                {p.role === "field" && <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
                  {p.contact_name ? `Vendor: ${p.contact_name} · ` : ""}{accessSummary({ pages: p.pages ?? [], all_jobs: !!p.all_jobs, job_ids: p.job_ids ?? [] })}
                </div>}
              </div>
              {p.role && <span style={{ ...eyebrow, fontFamily: disp, color: T.ink2 }}>{roleLabel(p.role)}</span>}
              {canEdit && accessReady && editing !== p.user_id && <button onClick={() => startEdit(p)} aria-label={`Change ${p.name ?? p.email}'s access`} title="Change access" style={{ color: T.ink3, cursor: "pointer", padding: "0 4px" }}>✎</button>}
              {canEdit && !p.you && <button onClick={() => void remove(p)} aria-label={`Remove ${p.name ?? p.email}`} title="Remove from the organisation" style={{ color: T.ink3, cursor: "pointer", padding: "0 4px" }}>×</button>}
            </div>
            {editing === p.user_id && (
              <div className="flex flex-col gap-2" style={{ padding: "4px 10px 10px", background: T.slab }}>
                {form}
                <div className="flex gap-1.5 justify-end">
                  <button type="button" onClick={() => { setEditing(null); setErr(null); }} style={small}>Cancel</button>
                  <button type="button" onClick={() => void saveAccess(p)} disabled={busy || !fieldReady} style={{ ...small, background: T.hiviz, color: T.onHiviz, border: "none" }}>{busy ? "Saving…" : "Save access"}</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {pending.map((v) => (
          <div key={v.id} className="flex items-center gap-2" style={{ padding: "7px 10px", borderTop: `1px solid ${T.hairSoft}`, background: T.slab }}>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: F.sm, ...clip }}>{v.email}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>Invited · waiting · expires {new Date(v.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {v.role === "field" ? ` · ${accessSummary({ pages: v.pages ?? [], all_jobs: !!v.all_jobs, job_ids: v.job_ids ?? [] })}` : ""}</div>
            </div>
            <span style={{ ...eyebrow, fontFamily: disp, color: T.ink3 }}>{roleLabel(v.role)}</span>
            <button onClick={() => void revoke(v.id)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Withdraw</button>
          </div>
        ))}
      </div>

      {canEdit && open && (
        <div className="mt-2 rounded p-2.5 flex flex-col gap-2" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
          {made ? (
            <>
              <div style={{ fontSize: F.sm }}>Invite made for <b>{made.email}</b>. Send them this link — it works once, for that email, for 14 days:</div>
              <input readOnly value={made.link} onFocus={(e) => e.target.select()} aria-label="Invite link"
                style={{ height: 32, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 8px", fontSize: F.xs, background: T.slab, color: T.ink, width: "100%" }} />
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => void copy()} style={small}>{copied ? "Copied ✓" : "Copy link"}</button>
                <a href={mail} style={small}>Email it</a>
                <a href={sms} style={small}>Text it</a>
                <span className="flex-1" />
                <button onClick={() => { setMade(null); }} style={small}>Invite another</button>
                <button onClick={() => { setOpen(false); setMade(null); }} style={small}>Done</button>
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>The link is shown only now. Lost it? Invite the same email again — the old link stops working.</div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void invite(); }} className="flex flex-col gap-2">
              {form}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com" aria-label="Their email"
                style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", fontSize: F.sm, background: T.card, color: T.ink }} />
              <div className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => { setOpen(false); setErr(null); }} style={small}>Cancel</button>
                <button type="submit" disabled={busy || !email.trim() || !fieldReady} style={{ ...small, background: T.hiviz, color: T.onHiviz, border: "none" }}>{busy ? "Making…" : "Make invite link"}</button>
              </div>
            </form>
          )}
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </>
  );
}

/** Role, then — for an onsite estimator — their vendor, pages and jobs. */
function AccessForm({ draft, setDraft, vendors, jobs, accessReady, small, onVendor }: {
  draft: AccessDraft; setDraft: React.Dispatch<React.SetStateAction<AccessDraft>>; vendors: VendorOpt[] | null; jobs: JobOpt[] | null;
  accessReady: boolean; small: React.CSSProperties; onVendor: (v: VendorOpt | null) => void;
}) {
  const [jobFind, setJobFind] = useState("");
  const set = (p: Partial<AccessDraft>) => setDraft((d) => ({ ...d, ...p }));
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const vName = (v: VendorOpt) => v.name?.trim() || v.company_name?.trim() || v.email || "Unnamed vendor";
  const shownJobs = (jobs ?? []).filter((j) => !jobFind.trim() || `${j.title ?? ""} ${j.address ?? ""}`.toLowerCase().includes(jobFind.trim().toLowerCase()));
  const box: React.CSSProperties = { height: 32, border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 8px", fontSize: F.sm, background: T.card, color: T.ink };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 items-center flex-wrap">
        {ROLES.map((r) => (
          <button key={r.k} type="button" onClick={() => set({ role: r.k })} aria-pressed={draft.role === r.k}
            disabled={r.k === "field" && !accessReady}
            title={r.k === "field" && !accessReady ? "Waiting on migration 081" : undefined}
            style={{ ...small, background: draft.role === r.k ? T.ink : T.card, color: draft.role === r.k ? T.card : T.ink, opacity: r.k === "field" && !accessReady ? 0.5 : 1 }}>{r.label}</button>
        ))}
      </div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>
        {ROLES.find((r) => r.k === draft.role)?.note}
        {draft.role === "field" && !accessReady && " — switched on once migration 081 is applied."}
      </div>
      {draft.role === "field" && (
        <>
          <label style={{ ...eyebrow, color: T.ink2 }} htmlFor="sc-access-vendor">Vendor</label>
          {vendors === null ? <div style={{ fontSize: F.xs, color: T.ink3 }}>Loading vendors…</div> : vendors.length === 0 ? (
            <div style={{ fontSize: F.xs, color: T.ink3 }}>No vendors yet. Add them on <Link href="/dashboard/vendors" style={{ color: T.chalk }}>Vendors</Link> first, then give them access.</div>
          ) : (
            <select id="sc-access-vendor" value={draft.contact_id ?? ""} style={box}
              onChange={(e) => { const v = vendors.find((x) => x.id === e.target.value) ?? null; set({ contact_id: v?.id ?? null }); onVendor(v); }}>
              <option value="">Pick the vendor they work as…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{vName(v)}{v.contact_subtype ? ` · ${v.contact_subtype.replace(/_/g, " ")}` : ""}</option>)}
            </select>
          )}
          <div style={{ fontSize: F.xs, color: T.ink3 }}>Not listed? File them as a vendor (Threads or <Link href="/dashboard/vendors" style={{ color: T.chalk }}>Vendors</Link>) first.</div>

          <div style={{ ...eyebrow, color: T.ink2, marginTop: 4 }}>Pages</div>
          <div style={{ fontSize: F.xs, color: T.ink3 }}>Their jobs&apos; areas always; tick what else they may open.</div>
          {FIELD_PAGES.map((pg) => (
            <label key={pg.k} className="flex items-start gap-2" style={{ fontSize: F.sm, cursor: "pointer" }}>
              <input type="checkbox" checked={draft.pages.includes(pg.k)} onChange={() => set({ pages: toggle(draft.pages, pg.k) })} style={{ marginTop: 3 }} />
              <span><b style={{ fontWeight: 600 }}>{pg.label}</b> <span style={{ color: T.ink3, fontSize: F.xs }}>— {pg.note}</span></span>
            </label>
          ))}

          <div style={{ ...eyebrow, color: T.ink2, marginTop: 4 }}>Jobs</div>
          <label className="flex items-center gap-2" style={{ fontSize: F.sm, cursor: "pointer" }}>
            <input type="checkbox" checked={draft.all_jobs} onChange={() => set({ all_jobs: !draft.all_jobs })} />
            Every job, including new ones
          </label>
          {!draft.all_jobs && (
            jobs === null ? <div style={{ fontSize: F.xs, color: T.ink3 }}>Loading jobs…</div> : (
              <>
                <input value={jobFind} onChange={(e) => setJobFind(e.target.value)} placeholder={`Find a job (${draft.job_ids.length} picked)`} aria-label="Find a job" style={box} />
                <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card }}>
                  {shownJobs.length === 0 && <div style={{ padding: "6px 8px", fontSize: F.xs, color: T.ink3 }}>No jobs match.</div>}
                  {shownJobs.map((j) => (
                    <label key={j.id} className="flex items-center gap-2" style={{ padding: "5px 8px", fontSize: F.sm, cursor: "pointer", borderTop: `1px solid ${T.hairSoft}` }}>
                      <input type="checkbox" checked={draft.job_ids.includes(j.id)} onChange={() => set({ job_ids: toggle(draft.job_ids, j.id) })} />
                      <span className="min-w-0" style={clip}>{j.title || "Untitled job"}{j.address ? <span style={{ color: T.ink3, fontSize: F.xs }}> · {j.address}</span> : null}</span>
                    </label>
                  ))}
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function LogoSlot({ variant, has, stamp, canEdit, busy, onPick, onRemove }: {
  variant: Variant; has: boolean; stamp: string | null; canEdit: boolean; busy: boolean; onPick: (f: File) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const lightBg = variant === "light";
  const grid = lightBg ? "rgba(89,128,166,.08)" : "rgba(140,170,200,.09)";
  const src = has ? `/api/org/logo/${variant}${stamp ? `?v=${encodeURIComponent(stamp)}` : ""}` : null;
  return (
    <div style={{ border: `1px solid ${T.hair}`, borderRadius: 4, overflow: "hidden", marginTop: 6 }}>
      {/* The preview keeps its own ground: the logo is judged on the background it is for, whatever the theme. */}
      <div style={{ height: 76, display: "flex", alignItems: "center", justifyContent: "center", background: lightBg ? "#FAF8F3" : "#202326",
        backgroundImage: `linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px)`, backgroundSize: "10px 10px" }}>
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" style={{ maxHeight: 44, maxWidth: "78%" }} />
          : <span style={{ fontSize: 12, color: lightBg ? "#8C8578" : "#A39D93" }}>{busy ? "Uploading…" : "No logo yet — the header shows scopecrete.ai"}</span>}
      </div>
      <div className="flex items-center gap-2" style={{ padding: "6px 10px", borderTop: `1px solid ${T.hair}`, background: T.card }}>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: F.sm, fontWeight: 600 }}>{lightBg ? "For light backgrounds" : "For dark backgrounds"}</div>
          <div style={{ fontSize: F.xs, color: T.ink3 }}>{lightBg ? "Dark lettering · Site Office, Blueprint, Kraft Yard" : "Light lettering · Night Shift"}</div>
        </div>
        {canEdit && (<>
          <input ref={input} type="file" accept="image/png,image/svg+xml,image/webp" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
          <button onClick={() => input.current?.click()} disabled={busy}
            style={{ ...btn, border: `1px solid ${T.hairStrong}`, background: "transparent", color: T.ink }}>
            {busy ? "…" : has ? "Replace" : "Upload"}
          </button>
          {has && !busy && <button onClick={onRemove} style={{ ...btn, padding: "0 4px", border: "none", background: "none", color: T.red }}>Remove</button>}
        </>)}
      </div>
    </div>
  );
}
