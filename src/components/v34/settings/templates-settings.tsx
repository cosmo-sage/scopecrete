"use client";

/**
 * Settings → Templates (Coy, 2026-10-11: "a page in the app settings that shows my template contracts
 * where I can edit, rename, and delete them in a workspace with Dusty"). The warranty and contract
 * templates a proposal loads (migration 060's doc_templates, /api/doc-templates): pick one to edit
 * its name, the project types it's offered for, its title and its words (a warranty) or clauses (a
 * contract); Save, Delete, + New. Dusty's emblem asks him to rewrite it, and "Use this" under his
 * boxed answer puts the words in the editor (nothing is saved until Save). Proposals already made
 * keep their own copy.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, disp } from "@/lib/v34/tokens";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";
import { EmailTemplatesBlock } from "@/components/v34/settings/email-templates";
import { DustyEmblem } from "@/components/v34/dusty-avatar";
import { setDustyUse } from "@/lib/v34/dusty-live";
import { USE_ASK } from "@/lib/dusty/use-block";
import { parseClauses, plainText, type Clause, type DocTemplate } from "@/lib/proposal";

type Kind = "warranty" | "terms";
interface PType { key: string; label: string }
interface Draft { id: string | null; kind: Kind; name: string; title: string; body: string; clauses: Clause[]; project_types: string[] }

const KIND_LABEL: Record<Kind, string> = { warranty: "Warranty", terms: "Contract" };

async function call<R = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<R> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as R;
}

const toDraft = (t: DocTemplate): Draft => ({
  id: t.id, kind: t.kind, name: t.name, title: t.title ?? "", body: t.body ?? "", clauses: (t.clauses ?? []).map((c) => ({ ...c })), project_types: [...(t.project_types ?? [])],
});
const blank = (kind: Kind): Draft => ({ id: null, kind, name: "", title: kind === "warranty" ? "Warranty" : "Terms and conditions", body: "", clauses: kind === "terms" ? [{ h: "", b: "" }] : [], project_types: [] });

export function TemplatesSettings() {
  const [list, setList] = useState<DocTemplate[] | null>(null);
  const [types, setTypes] = useState<PType[]>([]);
  const [d, setD] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const t = await call<{ templates: DocTemplate[] }>("/api/doc-templates");
    setList(t.templates);
    return t.templates;
  }, []);
  useEffect(() => {
    let off = false;
    Promise.all([call<{ templates: DocTemplate[] }>("/api/doc-templates"), call<{ types?: PType[] }>("/api/project-types").catch(() => ({ types: [] as PType[] }))])
      .then(([t, pt]) => { if (off) return; setList(t.templates); setTypes((pt.types ?? []).map((x) => ({ key: x.key, label: x.label }))); })
      .catch((e) => { if (!off) setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); });
    return () => { off = true; };
  }, []);
  useEffect(() => () => setDustyUse(null), []);

  const edit = (patch: Partial<Draft>) => { setD((x) => (x ? { ...x, ...patch } : x)); setDirty(true); setMsg(null); };
  const open = (next: Draft) => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    setD(next); setDirty(false); setMsg(null);
  };

  const save = async () => {
    if (!d) return;
    if (!d.name.trim()) { setMsg({ ok: false, text: "Name the template." }); return; }
    const body: Record<string, unknown> = { name: d.name, title: d.title, project_types: d.project_types };
    if (d.kind === "warranty") body.body = d.body; else body.clauses = d.clauses.filter((c) => c.h.trim() || c.b.trim());
    try {
      setBusy("Saving…");
      const r = d.id ? await call<{ template: DocTemplate }>(`/api/doc-templates/${d.id}`, "PATCH", body)
        : await call<{ template: DocTemplate }>("/api/doc-templates", "POST", { ...body, kind: d.kind });
      await load(); setD(toDraft(r.template)); setDirty(false); setMsg({ ok: true, text: "Saved. New proposals that load it get these words." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!d?.id || !window.confirm(`Delete "${d.name}"? Proposals already made keep their own copy of its words.`)) return;
    try { setBusy("Deleting…"); await call(`/api/doc-templates/${d.id}`, "DELETE"); await load(); setD(null); setDirty(false); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };

  // Dusty rewrites what is in the editor; "Use this" puts his boxed words back in it, unsaved.
  const askDusty = () => {
    if (!d) return;
    const ask = d.kind === "warranty"
      ? `Help me with my warranty template "${d.name || "new"}". Rewrite it in plain English for my customers. Keep what it covers and excludes; don't add promises.\n\n${d.title}\n${d.body}`
      : `Help me with my contract template "${d.name || "new"}". Tighten these terms for my concrete jobs. Answer as a numbered list, each item "**Heading:** text".\n\n${d.clauses.map((c, i) => `${i + 1}. ${c.h}: ${c.b}`).join("\n")}`;
    setDustyUse({
      label: d.kind === "warranty" ? "in the warranty template" : "as the contract's clauses",
      apply: (text) => {
        if (d.kind === "warranty") { edit({ body: plainText(text) }); return true; }
        const c = parseClauses(text); if (!c.length) return false;
        edit({ clauses: c }); return true;
      },
    });
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `${ask}\n\n${USE_ASK}`, send: true } })), 250);
  };

  const groups = useMemo(() => (["terms", "warranty"] as Kind[]).map((k) => ({ k, items: (list ?? []).filter((t) => t.kind === k) })), [list]);
  const input: React.CSSProperties = { width: "100%", border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, padding: "6px 8px" };
  const lbl: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink3 };
  const btn = (primary?: boolean, danger?: boolean): React.CSSProperties => ({ height: 30, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase",
    background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : danger ? T.red : T.ink, border: primary ? "none" : `1px solid ${T.hairStrong}`, cursor: "pointer" });

  return (
    <div>
      <SettingsTitle title="Templates" note="Your contracts and warranties, and your email templates. A proposal loads a contract or warranty by its project type; proposals already made keep their own copy." />
      <div className="flex gap-3 flex-wrap items-start">
        <div style={{ flex: "1 1 220px", maxWidth: 300 }}>
          {groups.map(({ k, items }) => (
            <SettingsBlock key={k} title={k === "terms" ? "Contracts" : "Warranties"}
              action={<button onClick={() => open(blank(k))} style={{ fontSize: F.xs, color: T.chalk, fontWeight: 600 }}>+ New</button>}>
              {list === null && <div style={{ fontSize: F.xs, color: T.ink3 }}>Loading…</div>}
              {list && !items.length && <div style={{ fontSize: F.xs, color: T.ink3 }}>None yet.</div>}
              {items.map((t) => (
                <button key={t.id} onClick={() => open(toDraft(t))} className="w-full text-left rounded"
                  style={{ display: "block", padding: "6px 8px", fontSize: F.sm, color: T.ink, background: d?.id === t.id ? T.slab : "transparent", fontWeight: d?.id === t.id ? 700 : 500 }}>
                  {t.name}{t.starter && <span style={{ fontSize: 11, color: T.ink3, fontWeight: 400 }}> · starter</span>}
                </button>
              ))}
            </SettingsBlock>
          ))}
        </div>
        <div style={{ flex: "3 1 380px", minWidth: 0 }}>
          {!d ? (
            <SettingsBlock title="Pick a template" note="Or + New to write one. Dusty can rewrite any of them with you." />
          ) : (
            <SettingsBlock title={d.id ? `${KIND_LABEL[d.kind]} · ${d.name || "unnamed"}` : `New ${KIND_LABEL[d.kind].toLowerCase()}`}
              action={(
                <button type="button" onClick={askDusty} title="Work on it with Dusty" aria-label="Work on it with Dusty" className="inline-flex items-center gap-1.5" style={{ fontSize: F.xs, color: T.ink2 }}>
                  <DustyEmblem size={22} still hidden /> Ask Dusty
                </button>
              )}>
              <div className="flex flex-col gap-3">
                <label className="block"><span style={lbl}>Name</span>
                  <input value={d.name} maxLength={80} onChange={(e) => edit({ name: e.target.value })} style={{ ...input, marginTop: 3 }} /></label>
                {types.length > 0 && (
                  <div><span style={lbl}>Offered for</span>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {types.map((t) => {
                        const on = d.project_types.includes(t.key);
                        return (
                          <button key={t.key} onClick={() => edit({ project_types: on ? d.project_types.filter((x) => x !== t.key) : [...d.project_types, t.key] })}
                            style={{ height: 26, padding: "0 10px", borderRadius: 13, fontSize: F.xs, border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2 }}>{t.label}</button>
                        );
                      })}
                      <span style={{ fontSize: 11, color: T.ink3, alignSelf: "center" }}>{d.project_types.length ? "" : "none ticked: every type"}</span>
                    </div>
                  </div>
                )}
                <label className="block"><span style={lbl}>Title on the proposal</span>
                  <input value={d.title} maxLength={160} onChange={(e) => edit({ title: e.target.value })} style={{ ...input, marginTop: 3 }} /></label>
                {d.kind === "warranty" ? (
                  <label className="block"><span style={lbl}>Words</span>
                    <textarea value={d.body} onChange={(e) => edit({ body: e.target.value })} rows={14} style={{ ...input, marginTop: 3, lineHeight: 1.5, resize: "vertical" }} /></label>
                ) : (
                  <div><span style={lbl}>Clauses</span>
                    <div className="flex flex-col gap-2 mt-1">
                      {d.clauses.map((c, i) => (
                        <div key={i} className="rounded" style={{ border: `1px solid ${T.hairSoft}`, padding: 8 }}>
                          <div className="flex gap-2 items-center">
                            <span style={{ fontSize: F.xs, color: T.ink3, width: 18 }}>{i + 1}.</span>
                            <input value={c.h} placeholder="Heading" maxLength={120} onChange={(e) => edit({ clauses: d.clauses.map((x, j) => (j === i ? { ...x, h: e.target.value } : x)) })} style={{ ...input, fontWeight: 600 }} />
                            <button onClick={() => edit({ clauses: d.clauses.filter((_, j) => j !== i) })} aria-label="Remove this clause" style={{ color: T.ink3, fontSize: 16, padding: "0 4px" }}>×</button>
                          </div>
                          <textarea value={c.b} onChange={(e) => edit({ clauses: d.clauses.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)) })} rows={3}
                            style={{ ...input, marginTop: 6, lineHeight: 1.45, resize: "vertical" }} />
                        </div>
                      ))}
                      <button onClick={() => edit({ clauses: [...d.clauses, { h: "", b: "" }] })} className="self-start" style={{ fontSize: F.xs, color: T.chalk, fontWeight: 600 }}>+ Add a clause</button>
                    </div>
                  </div>
                )}
                {msg && <div style={{ fontSize: F.xs, color: msg.ok ? T.green : T.red }}>{msg.text}</div>}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => void save()} disabled={!!busy} style={btn(true)}>{busy ?? "Save"}</button>
                  {dirty && <button onClick={() => { const t = list?.find((x) => x.id === d.id); setD(t ? toDraft(t) : null); setDirty(false); setMsg(null); }} style={btn()}>Discard</button>}
                  <span className="flex-1" />
                  {d.id && <button onClick={() => void remove()} disabled={!!busy} style={btn(false, true)}>Delete</button>}
                </div>
              </div>
            </SettingsBlock>
          )}
        </div>
      </div>
      <EmailTemplatesBlock />
    </div>
  );
}
