"use client";
/**
 * A contact's own page, as a phone's contacts app draws one (Coy, 2026-10-06:
 * "just a simple contact page with all the contact information and no threads
 * or nothing else and that's where we'll change contact information"). The
 * coloured initials, the name and who they are, Call · Text · Email, then
 * every number, email and the address. Edit changes the name, names a number,
 * adds a number or an email, and sets the address — through the same routes
 * as before (/api/contacts/[id]/name, /phones, /emails, /address).
 */
import React, { useState } from "react";
import Link from "next/link";
import { Phone, ChatText, Envelope, MapPin, PencilSimple, Plus } from "@phosphor-icons/react";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { initials, initialsHue } from "@/lib/v34/threads";
import { formatPhone } from "@/components/v34/conversation";
import { AddressInput } from "@/components/v34/address-input";
import type { Person } from "@/components/v34/person-view";

const BUCKET: Record<string, string> = { customer: "Customer", vendor: "Vendor", personal: "Personal", spam: "Spam" };

export function ContactCard({ person, back, textHref, customerHref, onReload, onJoin }: {
  person: Person;
  back: { href: string; label: string };
  /** Where Text goes: their thread, where a text is sent through Quo. */
  textHref: string;
  customerHref: string | null;
  onReload: () => void;
  /** "Or join another thread of theirs…" — the Same person as… merge. */
  onJoin: (otherId: string | null) => void;
}) {
  const c = person.contact;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<null | "phone">(null);
  const phones = c.phone_list?.length ? c.phone_list : c.phones.map((p, i) => ({ phone: p, label: null, is_primary: i === 0 }));
  const emails = c.email_list?.length ? c.email_list : c.email ? [{ email: c.email, label: null, is_primary: true }] : [];
  const main = phones[0]?.phone ?? null;
  const hue = c.name ? initialsHue(c.name) : null;
  const who = [c.bucket ? BUCKET[c.bucket] : "Unsorted", c.subtype_label, c.company].filter(Boolean).join(" · ");

  const action = (on: boolean): React.CSSProperties => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64,
    color: T.ink, textDecoration: "none", opacity: on ? 1 : 0.45, pointerEvents: on ? "auto" : "none", fontSize: 12.5 });
  const disc: React.CSSProperties = { width: 48, height: 48, borderRadius: 48, display: "flex", alignItems: "center", justifyContent: "center",
    background: hue ? `color-mix(in srgb, ${hue} 16%, ${T.card})` : T.slab, color: hue ? `color-mix(in srgb, ${hue} 80%, ${T.ink})` : T.ink2 };

  return (
    <div className="w-full" style={{ maxWidth: 560, margin: "0 auto", padding: "10px 16px 40px" }}>
      <div className="flex items-center gap-2">
        <Link href={back.href} style={{ ...eyebrow, color: T.chalk }}>‹ {back.label}</Link>
        <span className="flex-1" />
        <button onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="inline-flex items-center gap-1.5 rounded"
          style={{ height: 30, padding: "0 12px", border: `1px solid ${editing ? T.ink : T.hairStrong}`, background: editing ? T.ink : T.card, color: editing ? T.card : T.ink2,
            fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
          {editing ? "Done" : <><PencilSimple size={13} /> Edit</>}
        </button>
      </div>

      <div className="flex flex-col items-center text-center" style={{ marginTop: 14 }}>
        <span aria-hidden="true" className="flex items-center justify-center"
          style={{ width: 104, height: 104, borderRadius: 104, background: hue ? `color-mix(in srgb, ${hue} 22%, ${T.card})` : T.slab,
            color: hue ? `color-mix(in srgb, ${hue} 78%, ${T.ink})` : T.ink3, border: c.name ? "none" : `1px dashed ${T.hairStrong}`,
            fontFamily: "var(--sc-font-strong)", fontWeight: 600, fontSize: 38 }}>
          {c.name ? initials(c.name) : "#"}
        </span>
        {editing
          ? <NameField contactId={c.id} name={c.name} onSaved={onReload} />
          : <div style={{ fontFamily: "var(--sc-font-strong)", fontSize: 26, fontWeight: 600, color: T.ink, marginTop: 12, lineHeight: 1.15 }}>{c.name ?? formatPhone(main)}</div>}
        <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>
          {who}
          {customerHref && <> · <Link href={customerHref} style={{ color: T.chalk }}>Customer page ›</Link></>}
        </div>
      </div>

      <div className="flex justify-center gap-6" style={{ marginTop: 18 }}>
        <a href={main ? `tel:${main}` : undefined} style={action(!!main)} aria-label="Call"><span style={disc}><Phone size={20} weight="fill" /></span>Call</a>
        <Link href={textHref} style={action(!!main)} aria-label="Text"><span style={disc}><ChatText size={20} weight="fill" /></span>Text</Link>
        <a href={emails[0] ? `mailto:${emails[0].email}` : undefined} style={action(emails.length > 0)} aria-label="Email"><span style={disc}><Envelope size={20} weight="fill" /></span>Email</a>
      </div>

      <div className="rounded-xl" style={{ marginTop: 20, background: T.card, border: `1px solid ${T.hair}`, padding: "6px 0" }}>
        <div style={{ ...eyebrow, color: T.ink3, padding: "8px 16px 4px" }}>Contact info</div>
        {phones.map((p) => (
          <PhoneRow key={p.phone} contactId={c.id} phone={p.phone} label={p.label} main={p.phone === main} editing={editing} textHref={textHref} onSaved={onReload} />
        ))}
        {emails.map((e) => (
          <Row key={e.email} icon={<Envelope size={20} color={T.ink3} />} href={`mailto:${e.email}`} primary={e.email} secondary={e.label ?? "Email"} />
        ))}
        {(c.address || editing) && (editing
          ? <AddressField contactId={c.id} address={c.address} onSaved={onReload} />
          : <Row icon={<MapPin size={20} color={T.ink3} />} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address ?? "")}`}
              primary={c.address ?? ""} secondary={c.address_source === "coy" ? "Address" : "Address · check it"} />)}
        {!editing && phones.length === 0 && emails.length === 0 && !c.address && (
          <div style={{ padding: "10px 16px", fontSize: F.sm, color: T.ink3 }}>Nothing on file yet. Tap Edit to add a number, an email or an address.</div>
        )}
        {editing && (
          <div style={{ borderTop: `1px solid ${T.hairSoft}`, marginTop: 4, padding: "8px 16px" }}>
            <button onClick={() => setAdding("phone")} className="inline-flex items-center gap-1.5" style={{ ...eyebrow, color: T.chalk, cursor: "pointer", padding: "6px 0" }}>
              <Plus size={13} /> Add a number
            </button>
            <EmailAdd contactId={c.id} onSaved={onReload} />
          </div>
        )}
      </div>

      {adding === "phone" && (
        <AddNumberDialog contactId={c.id} name={c.name} onClose={() => setAdding(null)}
          onAdded={() => { setAdding(null); onReload(); }}
          onJoin={(id) => { setAdding(null); onJoin(id); }} />
      )}
    </div>
  );
}

function Row({ icon, href, primary, secondary, right }: { icon: React.ReactNode; href?: string; primary: string; secondary: string; right?: React.ReactNode }) {
  const body = (
    <span className="flex-1 min-w-0">
      <span className="block" style={{ fontSize: 15.5, color: T.ink, ...nums, overflowWrap: "anywhere" }}>{primary}</span>
      <span className="block" style={{ fontSize: 12.5, color: T.ink3 }}>{secondary}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-4" style={{ padding: "10px 16px" }}>
      <span className="shrink-0" style={{ width: 22, display: "flex", justifyContent: "center" }}>{icon}</span>
      {href ? <a href={href} className="flex-1 min-w-0 no-underline" style={{ color: "inherit" }} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{body}</a> : body}
      {right}
    </div>
  );
}

function PhoneRow({ contactId, phone, label, main, editing, textHref, onSaved }: {
  contactId: string; phone: string; label: string | null; main: boolean; editing: boolean; textHref: string; onSaved: () => void;
}) {
  const [draft, setDraft] = useState(label ?? "");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if ((draft.trim() || null) === (label ?? null)) return;
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/phones`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, label: draft }) });
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save it."); return; }
    setErr(null); onSaved();
  };
  const name = label?.trim() || (main ? "Mobile" : "Phone");
  if (editing) {
    return (
      <div className="flex items-center gap-4" style={{ padding: "8px 16px" }}>
        <span className="shrink-0" style={{ width: 22, display: "flex", justifyContent: "center" }}><Phone size={20} color={T.ink3} /></span>
        <span className="flex-1 min-w-0">
          <span className="block" style={{ fontSize: 15.5, color: T.ink, ...nums }}>{formatPhone(phone)}</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            maxLength={30} placeholder={main ? "Mobile" : "Office, Work…"} aria-label={`What ${formatPhone(phone)} is`}
            className="rounded px-2 mt-1" style={{ height: 30, width: "100%", maxWidth: 220, border: `1px solid ${T.hair}`, fontSize: F.sm, background: T.card, color: T.ink }} />
          {err && <span className="block" style={{ fontSize: F.xs, color: T.red }}>{err}</span>}
        </span>
      </div>
    );
  }
  return (
    <Row icon={<Phone size={20} color={T.ink3} />} href={`tel:${phone}`} primary={formatPhone(phone)} secondary={name}
      right={<Link href={textHref} aria-label={`Text ${formatPhone(phone)}`} className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, color: T.ink2 }}><ChatText size={20} /></Link>} />
  );
}

function NameField({ contactId, name, onSaved }: { contactId: string; name: string | null; onSaved: () => void }) {
  const [draft, setDraft] = useState(name ?? "");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const v = draft.trim();
    if (!v || v === name) return;
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save it."); return; }
    setErr(null); onSaved();
  };
  return (
    <div style={{ marginTop: 12, width: "100%", maxWidth: 320 }}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        maxLength={80} placeholder="Their name" aria-label="Name" className="rounded px-3 text-center"
        style={{ height: 40, width: "100%", border: `1px solid ${T.ink}`, fontSize: 18, fontFamily: "var(--sc-font-strong)", background: T.card, color: T.ink }} />
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function EmailAdd({ contactId, onSaved }: { contactId: string; onSaved: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    if (!v.trim() || busy) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: v }) });
    setBusy(false);
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add it."); return; }
    setV(""); onSaved();
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div className="flex items-center gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} inputMode="email" type="email"
          placeholder="Add an email" aria-label="Add an email" className="flex-1 min-w-0 rounded px-2"
          style={{ height: 32, border: `1px solid ${T.hair}`, fontSize: F.sm, background: T.card, color: T.ink }} />
        <button onClick={() => void add()} disabled={!v.trim() || busy} className="rounded px-3"
          style={{ height: 32, background: T.ink, color: T.card, fontSize: F.sm, fontWeight: 600, cursor: "pointer", opacity: !v.trim() || busy ? 0.5 : 1 }}>{busy ? "…" : "Add"}</button>
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function AddressField({ contactId, address, onSaved }: { contactId: string; address: string | null; onSaved: () => void }) {
  const [line1, setLine1] = useState("");
  const [rest, setRest] = useState<{ city: string; state: string; zip: string }>({ city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (clear = false) => {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/address`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clear ? { address_line1: "" } : { address_line1: line1, ...rest }) });
    setBusy(false);
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save it."); return; }
    setLine1(""); setRest({ city: "", state: "", zip: "" }); onSaved();
  };
  const field: React.CSSProperties = { height: 32, border: `1px solid ${T.hair}`, borderRadius: 6, padding: "0 8px", fontSize: F.sm, background: T.card, color: T.ink, minWidth: 0 };
  return (
    <div className="flex gap-4" style={{ padding: "10px 16px" }}>
      <span className="shrink-0" style={{ width: 22, display: "flex", justifyContent: "center", paddingTop: 6 }}><MapPin size={20} color={T.ink3} /></span>
      <div className="flex-1 min-w-0">
        {address && <div className="flex items-baseline gap-2" style={{ fontSize: 13.5, color: T.ink2, marginBottom: 6 }}>
          <span className="flex-1 min-w-0">{address}</span>
          <button onClick={() => void save(true)} disabled={busy} style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Remove</button>
        </div>}
        <AddressInput value={line1} onChange={setLine1} onPick={(m) => { setLine1(m.line1); setRest({ city: m.city ?? "", state: m.state ?? "", zip: m.zip ?? "" }); }}
          style={{ ...field, width: "100%" }} />
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 64px 84px" }}>
          <input value={rest.city} onChange={(e) => setRest({ ...rest, city: e.target.value })} placeholder="City" aria-label="City" style={field} />
          <input value={rest.state} onChange={(e) => setRest({ ...rest, state: e.target.value })} placeholder="ST" aria-label="State" style={field} />
          <input value={rest.zip} onChange={(e) => setRest({ ...rest, zip: e.target.value })} placeholder="Zip" aria-label="Zip" inputMode="numeric" style={field} />
        </div>
        <div className="flex items-center gap-2 mt-2">
          {err && <span style={{ fontSize: F.xs, color: T.red }}>{err}</span>}
          <span className="flex-1" />
          <button onClick={() => void save()} disabled={!line1.trim() || busy} className="rounded px-3"
            style={{ height: 32, background: T.ink, color: T.card, fontSize: F.sm, fontWeight: 600, cursor: "pointer", opacity: !line1.trim() || busy ? 0.5 : 1 }}>
            {busy ? "Saving…" : address ? "Change address" : "Save address"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Add a number (Coy, 2026-10-04; on the contact page since 2026-10-06): type a
 * number of theirs and what it is (Office, Work, Cell…) and it becomes its own
 * channel on them; or, when that number is already a thread, join the two —
 * the same "Same person as…" merge.
 */
export function AddNumberDialog({ contactId, name, onClose, onAdded, onJoin }: {
  contactId: string; name: string | null; onClose: () => void; onAdded: (phone: string) => void; onJoin: (otherId: string | null) => void;
}) {
  const [num, setNum] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; other: { id: string; name: string | null } | null } | null>(null);
  const e164 = (() => { const d = num.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : null; })();
  const save = async () => {
    if (!e164) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/phones`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: e164, label, add: true }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) onAdded(e164); else setErr({ text: b?.error ?? `HTTP ${r.status}`, other: b?.other ?? null });
  };
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, borderRadius: 6, padding: "0 10px", fontSize: F.sm, background: T.card, color: T.ink, width: "100%" };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add a number">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(0,0,0,.4)", border: "none" }} />
      <div className="relative rounded-lg w-full" style={{ maxWidth: 400, background: T.card, color: T.ink, padding: 16, boxShadow: "0 12px 36px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: F.md, fontWeight: 600 }}>Add a number for {name ?? "them"}</div>
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1fr 130px" }}>
          <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="tel" placeholder="(225) 555-0100" aria-label="Number" style={field} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="Office, Work…" aria-label="What it is" style={field} />
        </div>
        {err && (
          <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>
            {err.text}
            {err.other && <> <button onClick={() => onJoin(err.other!.id)} style={{ color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Join their thread to this one ›</button></>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => onJoin(null)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", textAlign: "left" }}>Or join another<br />thread of theirs…</button>
          <span className="flex-1" />
          <button onClick={onClose} className="rounded px-3" style={{ height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, fontSize: F.sm, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => void save()} disabled={!e164 || busy} className="rounded px-3"
            style={{ height: 34, background: T.ink, color: T.card, fontSize: F.sm, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: !e164 || busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save number"}</button>
        </div>
      </div>
    </div>
  );
}
