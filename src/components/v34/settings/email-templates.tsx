"use client";

/**
 * Email templates, under Settings → Templates (Coy, 2026-10-24: "Where do I find my email Templates
 * to edit?"). The ones the email editor's Templates ▾ offers: pick one to change its name, its line,
 * its subject and its words, delete it, or + New. {first} {job} {date} fill in when it is used.
 * Saved on the account (`email_templates`); an owner's become the company's starting set.
 */

import React, { useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { SettingsBlock } from "@/components/v34/settings/parts";
import { usePref } from "@/lib/v34/prefs";
import { MAX_EMAIL_TEMPLATES, TEMPLATES, emailTemplatesOf, type MailTemplate } from "@/lib/email-client";

const input: React.CSSProperties = { width: "100%", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "6px 9px", background: T.card, color: T.ink, fontSize: F.sm };
const lbl: React.CSSProperties = { fontSize: 11, color: T.ink3, fontWeight: 600 };
const btn = (primary = false): React.CSSProperties => ({ height: 32, padding: "0 12px", borderRadius: 4, fontSize: F.xs, fontWeight: 600, border: `1px solid ${primary ? T.ink : T.hairStrong}`, background: primary ? T.ink : T.card, color: primary ? T.card : T.ink });

export function EmailTemplatesBlock() {
  const [saved, setSaved] = usePref<unknown>("email_templates", null);
  const list = emailTemplatesOf(saved);
  const [d, setD] = useState<MailTemplate | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const isNew = !!d && !list.some((t) => t.k === d.k);

  const save = () => {
    if (!d) return;
    if (!d.label.trim() || !d.body.trim()) { setMsg("A template needs a name and words."); return; }
    setSaved(isNew ? [...list, d] : list.map((t) => (t.k === d.k ? d : t)));
    setMsg("Saved. The email editor's Templates ▾ has it now.");
  };
  const remove = () => {
    if (!d || isNew) { setD(null); return; }
    if (!window.confirm(`Delete the template "${d.label}"?`)) return;
    setSaved(list.filter((t) => t.k !== d.k)); setD(null); setMsg(null);
  };
  const edit = (p: Partial<MailTemplate>) => { setD((x) => (x ? { ...x, ...p } : x)); setMsg(null); };

  return (
    <SettingsBlock id="email" title="Email templates"
      note={<>What the email editor&apos;s Templates ▾ offers. <b>{"{first}"}</b> is their first name, <b>{"{job}"}</b> the job and <b>{"{date}"}</b> a date. To make one from an email you are writing, use Templates ▾ → Save this email as a template.</>}
      action={list.length < MAX_EMAIL_TEMPLATES ? <button onClick={() => { setD({ k: `own-${Date.now().toString(36)}`, label: "", sub: "", subject: "", body: "Hi {first},\n\n" }); setMsg(null); }} style={{ fontSize: F.xs, color: T.chalk, fontWeight: 600 }}>+ New</button> : undefined}>
      <div className="flex gap-3 flex-wrap items-start">
        <div style={{ flex: "1 1 200px", maxWidth: 280 }}>
          {list.map((t) => (
            <button key={t.k} onClick={() => { setD({ ...t }); setMsg(null); }} className="w-full text-left rounded"
              style={{ display: "block", padding: "6px 8px", fontSize: F.sm, color: T.ink, background: d?.k === t.k ? T.slab : "transparent", fontWeight: d?.k === t.k ? 700 : 500 }}>
              {t.label}
            </button>
          ))}
          {saved != null && (
            <button onClick={() => { if (window.confirm("Put back the four starter templates? Your own are removed.")) { setSaved(null); setD(null); } }} style={{ fontSize: 11, color: T.ink3, padding: "6px 8px" }}>
              Put the starters back ({TEMPLATES.length})
            </button>
          )}
        </div>
        <div style={{ flex: "3 1 320px", minWidth: 0 }}>
          {!d ? <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>Pick a template to change it, or + New.</div> : (
            <div className="flex flex-col gap-2.5">
              <label className="block"><span style={lbl}>Name</span>
                <input value={d.label} maxLength={60} onChange={(e) => edit({ label: e.target.value })} style={{ ...input, marginTop: 3 }} /></label>
              <label className="block"><span style={lbl}>Line under it in the menu (optional)</span>
                <input value={d.sub} maxLength={100} onChange={(e) => edit({ sub: e.target.value })} style={{ ...input, marginTop: 3 }} /></label>
              <label className="block"><span style={lbl}>Subject</span>
                <input value={d.subject} maxLength={200} onChange={(e) => edit({ subject: e.target.value })} style={{ ...input, marginTop: 3 }} /></label>
              <label className="block"><span style={lbl}>Words</span>
                <textarea value={d.body} maxLength={2000} rows={9} onChange={(e) => edit({ body: e.target.value })} style={{ ...input, marginTop: 3, lineHeight: 1.5, resize: "vertical" }} /></label>
              {msg && <div style={{ fontSize: F.xs, color: msg.startsWith("Saved") ? T.green : T.red }}>{msg}</div>}
              <div className="flex gap-2 items-center">
                <button onClick={save} style={btn(true)}>Save</button>
                <button onClick={() => { setD(null); setMsg(null); }} style={btn()}>Close</button>
                <span className="flex-1" />
                <button onClick={remove} style={{ ...btn(), color: T.red }}>{isNew ? "Discard" : "Delete"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsBlock>
  );
}
