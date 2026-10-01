"use client";

/**
 * Settings → You and Organisation (Claude Design handoff design/org-branding/;
 * Coy on Vercel, 2026-09-30: "it should show User: Coy Sacco · Email ·
 * Organization", and rename the org and upload its logo).
 *
 *   - You: your name (✎ — PATCH /api/me), your email, the org and your role.
 *   - Organisation (owners edit; everyone else read-only, "Owners only"):
 *       Name → PATCH /api/org (sc_rename_org — the name lives once, orgs.name).
 *       Logo → two slots, light backgrounds (dark lettering) and dark
 *         backgrounds (light lettering, Night Shift). PNG / WebP are shrunk to
 *         1200px here, then sent straight to storage; an SVG is cleaned on
 *         the server (/api/org/logo/done).
 *       People → every member with name, email and role (sc_org_people).
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, strong } from "@/lib/v34/tokens";
import { sendBytes } from "@/components/v34/files-panel";

export interface OrgInfo { id: string; name: string; logo_light: boolean; logo_dark: boolean; logo_stamp: string | null }
interface Person { user_id: string; name: string | null; email: string | null; role: string | null; you: boolean }
type Variant = "light" | "dark";

const btn: React.CSSProperties = { ...eyebrow, fontSize: 12, height: 30, padding: "0 10px", borderRadius: 3, cursor: "pointer" };

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

export function YouSection({ name, email, orgName, role, onSaved }: {
  name: string | null; email: string | null; orgName: string | null; role: string | null; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const v = draft.trim();
    if (!v) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    setEditing(false); onSaved();
  }
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
        {row("User", editing ? (
          <span className="flex gap-1.5">
            <input value={draft} autoFocus maxLength={80} onChange={(e) => setDraft(e.target.value)} placeholder="Your name"
              onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
              className="flex-1 min-w-0" style={{ height: 30, padding: "0 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm }} />
            <button onClick={() => void save()} disabled={busy || !draft.trim()} style={{ ...btn, border: "none", background: T.hiviz, color: T.onHiviz }}>{busy ? "…" : "Save"}</button>
          </span>
        ) : (
          <span className="flex items-baseline gap-2">
            {name ? <span style={{ fontFamily: strong, fontWeight: 600, fontSize: F.md, ...clip }}>{name}</span>
              : <span style={{ color: T.ink3 }}>No name yet</span>}
            <button onClick={() => { setDraft(name ?? ""); setEditing(true); }} aria-label="Edit your name" style={{ color: T.chalk, fontSize: F.sm, cursor: "pointer" }}>{name ? "✎" : "Add your name"}</button>
          </span>
        ))}
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        {row("Email", <span style={{ color: T.ink2, ...clip, display: "block" }}>{email ?? "—"}</span>)}
        {row("Organization", <span style={{ color: T.ink2 }}>{orgName ?? "—"}{role ? <span style={{ color: T.ink3 }}> · {role}</span> : null}</span>)}
      </div>
    </section>
  );
}

export function OrgSection({ onChanged }: { onChanged: () => void }) {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
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
      setOrg(b.org); setDraft(b.org.name); setCanEdit(!!b.can_edit); setPeople(b.people ?? []);
    }).catch(() => { if (!off) setLoadErr("Couldn't load the organisation."); });
    return () => { off = true; };
  }, []);

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

      <People people={people} canEdit={canEdit} onRemoved={(id) => setPeople((a) => a.filter((p) => p.user_id !== id))} />
    </section>
  );
}

/**
 * People and invites (migration 062; Coy, 2026-10-01: "add other users to my
 * Org … and send invites to the dashboard"). An owner invites an email as
 * owner, member or field crew; the link is shown once, to copy, text or mail
 * from his own account — ScopeCrete sends nothing. Pending invites can be
 * withdrawn; a member can be removed (never yourself, never the last owner).
 */
interface Invite { id: string; email: string; role: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
function People({ people, canEdit, onRemoved }: { people: Person[]; canEdit: boolean; onRemoved: (userId: string) => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!canEdit) return;
    let off = false;
    fetch("/api/org/invites").then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off && b?.invites) setInvites(b.invites); }).catch(() => {});
    return () => { off = true; };
  }, [canEdit, tick]);
  const pending = invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date());

  async function invite() {
    setBusy(true); setErr(null); setMade(null); setCopied(false);
    const r = await fetch("/api/org/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    setMade({ email: b.invite.email, link: b.link }); setEmail(""); setTick((n) => n + 1);
  }
  async function revoke(id: string) {
    const r = await fetch(`/api/org/invites/${id}`, { method: "DELETE" });
    if (r.ok) setTick((n) => n + 1); else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't withdraw it.");
  }
  async function remove(p: Person) {
    if (!window.confirm(`Take ${p.name ?? p.email} out of the organisation? Their account stays; they stop seeing it.`)) return;
    const r = await fetch(`/api/org/members/${p.user_id}`, { method: "DELETE" });
    if (r.ok) onRemoved(p.user_id); else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't remove them.");
  }
  async function copy() { try { await navigator.clipboard.writeText(made!.link); setCopied(true); } catch { /* blocked */ } }
  const mail = made ? `mailto:${made.email}?subject=${encodeURIComponent("Join me on ScopeCrete")}&body=${encodeURIComponent(`Here's your invite to our ScopeCrete dashboard:\n\n${made.link}\n\nSign in with this email address (${made.email}). The link works once and expires in 14 days.`)}` : "";
  const sms = made ? `sms:?&body=${encodeURIComponent(`Your ScopeCrete invite (sign in as ${made.email}): ${made.link}`)}` : "";
  const small: React.CSSProperties = { ...btn, fontSize: 12, height: 30, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center" };

  return (
    <>
      <div className="flex items-center" style={{ marginTop: 12 }}>
        <span className="flex-1" style={{ ...eyebrow, color: T.ink2 }}>People</span>
        {canEdit && !open && <button onClick={() => { setOpen(true); setMade(null); }} style={small}>+ Invite</button>}
      </div>
      <div className="mt-1" style={{ border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card }}>
        {people.length === 0 && <div style={{ padding: "8px 10px", fontSize: F.sm, color: T.ink3 }}>No one listed.</div>}
        {people.map((p, i) => (
          <div key={p.user_id} className="flex items-center gap-2" style={{ padding: "7px 10px", borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{p.name ?? <span style={{ color: T.ink3, fontWeight: 400 }}>No name yet</span>}{p.you && <span style={{ color: T.ink3, fontWeight: 400 }}> · you</span>}</div>
              <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{p.email ?? "—"}</div>
            </div>
            {p.role && <span style={{ ...eyebrow, fontFamily: disp, color: T.ink2 }}>{p.role}</span>}
            {canEdit && !p.you && <button onClick={() => void remove(p)} aria-label={`Remove ${p.name ?? p.email}`} title="Remove from the organisation" style={{ color: T.ink3, cursor: "pointer", padding: "0 4px" }}>×</button>}
          </div>
        ))}
        {pending.map((v) => (
          <div key={v.id} className="flex items-center gap-2" style={{ padding: "7px 10px", borderTop: `1px solid ${T.hairSoft}`, background: T.slab }}>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: F.sm, ...clip }}>{v.email}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>Invited · waiting · expires {new Date(v.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
            </div>
            <span style={{ ...eyebrow, fontFamily: disp, color: T.ink3 }}>{v.role}</span>
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
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com" aria-label="Their email" autoFocus
                style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", fontSize: F.sm, background: T.card, color: T.ink }} />
              <div className="flex gap-1.5 items-center flex-wrap">
                {([["member", "Member"], ["field", "Field crew"], ["owner", "Owner"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setRole(k)} aria-pressed={role === k}
                    style={{ ...small, background: role === k ? T.ink : T.card, color: role === k ? T.card : T.ink }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>
                {role === "owner" ? "Owners can also rename the organisation, change the logo and invite or remove people." : "For now every member sees the whole dashboard; only owners manage the organisation."}
              </div>
              <div className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => { setOpen(false); setErr(null); }} style={small}>Cancel</button>
                <button type="submit" disabled={busy || !email.trim()} style={{ ...small, background: T.hiviz, color: T.onHiviz, border: "none" }}>{busy ? "Making…" : "Make invite link"}</button>
              </div>
            </form>
          )}
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </>
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
