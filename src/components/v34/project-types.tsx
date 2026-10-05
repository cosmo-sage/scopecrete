"use client";
/**
 * Project types and their templates (migration 060) — in Price book →
 * Defaults (Coy, 2026-10-01: defaults live there, per type).
 *
 * Each type: its O.H. and margin (a new job's budget of that type copies
 * them, else the org's defaults above), what its proposals show (item prices,
 * qty · unit, the tax line, a cover photo), its draw schedule, and which
 * warranty and contract load. Templates: the warranty and contract text a
 * proposal starts from, edited here or saved from a proposal.
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { NumField } from "@/components/v34/money-settings";
import type { Clause, DocTemplate, Draw } from "@/lib/proposal";

interface PType {
  id: string; key: string; label: string; overhead_pct: number | null; margin_pct: number | null;
  show_item_prices: boolean; show_qty: boolean; show_tax_line: boolean; draws: Draw[];
  warranty_template_id: string | null; terms_template_id: string | null; cover: "photo" | "none"; sort_order: number;
}
const BUILT_IN = ["residential", "commercial", "public"];

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
const input: React.CSSProperties = { border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm, padding: "4px 8px" };
const btn: React.CSSProperties = { border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 10px", cursor: "pointer" };

export function ProjectTypes() {
  const [types, setTypes] = useState<PType[] | null>(null);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    call("/api/project-types", "GET").then((b) => { if (!off) { setTypes(b.types); setTemplates(b.templates); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const patch = useCallback(async (t: PType, body: Partial<PType>) => {
    setTypes((xs) => xs && xs.map((x) => (x.id === t.id ? { ...x, ...body } : x)));
    try { await call(`/api/project-types/${t.id}`, "PATCH", body); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); reload(); }
  }, [reload]);

  if (!types) return <div className="px-3 py-3" style={{ fontSize: F.sm, color: err ? T.red : T.ink3 }}>{err ?? "Loading project types…"}</div>;
  return (
    <div style={{ color: T.ink, borderTop: `1px solid ${T.hairSoft}` }}>
      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <div className="flex items-center gap-2">
          <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Project types</div>
          <span className="flex-1" />
          <button style={btn} onClick={() => {
            const label = window.prompt("Name the new type — Industrial, HOA, Church…");
            if (label?.trim()) void call("/api/project-types", "POST", { label }).then(reload).catch((e) => setErr(String(e?.message ?? e)));
          }}>+ Type</button>
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, margin: "2px 0 8px" }}>
          A new budget for a job of this type copies its O.H. and margin (blank = the defaults above). Its proposals start with what is shown, the draws, and the warranty and contract below.
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red, marginBottom: 6 }}>{err}</div>}
        <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
          {types.map((t) => (
            <TypeCard key={t.id} t={t} templates={templates} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} patch={(b) => void patch(t, b)}
              onDelete={BUILT_IN.includes(t.key) ? null : () => { if (window.confirm(`Remove the ${t.label} type?`)) void call(`/api/project-types/${t.id}`, "DELETE").then(reload).catch((e) => setErr(String(e?.message ?? e))); }} />
          ))}
        </div>
      </div>
      <Templates templates={templates} types={types} onChanged={reload} />
    </div>
  );
}

function TypeCard({ t, templates, open, onOpen, patch, onDelete }: {
  t: PType; templates: DocTemplate[]; open: boolean; onOpen: () => void; patch: (b: Partial<PType>) => void; onDelete: (() => void) | null;
}) {
  const [draws, setDraws] = useState<Draw[]>(t.draws);
  const sum = draws.reduce((a, d) => a + (Number(d.pct) || 0), 0);
  const fits = (k: "warranty" | "terms") => templates.filter((x) => x.kind === k && (!x.project_types.length || x.project_types.includes(t.key)));
  const w = templates.find((x) => x.id === t.warranty_template_id), c = templates.find((x) => x.id === t.terms_template_id);
  return (
    <div className="rounded" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      <button onClick={onOpen} className="w-full flex items-center gap-2 text-left" style={{ padding: "8px 10px", cursor: "pointer" }} aria-expanded={open}>
        <b style={{ fontSize: F.sm }}>{t.label}</b>
        <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>
          O.H. {t.overhead_pct ?? "default"}{t.overhead_pct !== null ? "%" : ""} · margin {t.margin_pct ?? "default"}{t.margin_pct !== null ? "%" : ""} · {t.draws.map((d) => d.pct).join(" / ") || "no draws"}
        </span>
        <span className="flex-1" />
        <span style={{ color: T.ink3 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 10px 10px", borderTop: `1px solid ${T.hairSoft}` }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" style={{ maxWidth: 480 }}>
            <NumField label="O.H." unit="%" value={t.overhead_pct} note="this type" onSave={async (v) => patch({ overhead_pct: v })} />
            <NumField label="Margin" unit="%" value={t.margin_pct} note="this type" onSave={async (v) => patch({ margin_pct: v })} />
          </div>
          <div style={eyebrow} className="mt-3">The proposal shows</div>
          <div className="flex flex-wrap gap-3 mt-1" style={{ fontSize: F.sm }}>
            {([["show_item_prices", "Item prices"], ["show_qty", "Qty · unit"], ["show_tax_line", "Tax as its own line"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={t[k]} onChange={(e) => patch({ [k]: e.target.checked })} />{l}</label>
            ))}
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.cover === "photo"} onChange={(e) => patch({ cover: e.target.checked ? "photo" : "none" })} />Cover photo</label>
          </div>
          <div style={eyebrow} className="mt-3">Draws</div>
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            {draws.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input aria-label={`Draw ${i + 1} percent`} inputMode="decimal" value={d.pct ?? ""} onChange={(e) => setDraws(draws.map((x, j) => (j === i ? { ...x, pct: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                  style={{ ...input, width: 54, textAlign: "right" }} />
                <span style={{ color: T.ink3 }}>%</span>
                <input aria-label={`Draw ${i + 1} when`} value={d.when} onChange={(e) => setDraws(draws.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} className="flex-1" style={{ ...input, minWidth: 0 }} />
                <button aria-label={`Remove draw ${i + 1}`} onClick={() => setDraws(draws.filter((_, j) => j !== i))} style={{ color: T.ink3, width: 22 }}>×</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <button style={btn} onClick={() => setDraws([...draws, { pct: Math.max(0, 100 - sum), when: "" }])}>+ Draw</button>
            <button style={{ ...btn, opacity: sum === 100 ? 1 : 0.5 }} disabled={sum !== 100} onClick={() => patch({ draws: draws.map((d) => ({ pct: Number(d.pct) || 0, when: d.when })) })}>Save draws</button>
            <span style={{ fontSize: F.xs, color: sum === 100 ? T.green : T.red, ...nums }}>{sum}% {sum === 100 ? "✓" : "— draws add up to 100%"}</span>
          </div>
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ fontSize: F.xs, color: T.ink2 }}>Warranty
              <select value={t.warranty_template_id ?? ""} onChange={(e) => patch({ warranty_template_id: e.target.value || null })} className="w-full mt-0.5" style={{ ...input, height: 30 }}>
                <option value="">None</option>
                {[...fits("warranty"), ...(w && !fits("warranty").includes(w) ? [w] : [])].map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: F.xs, color: T.ink2 }}>Contract
              <select value={t.terms_template_id ?? ""} onChange={(e) => patch({ terms_template_id: e.target.value || null })} className="w-full mt-0.5" style={{ ...input, height: 30 }}>
                <option value="">None</option>
                {[...fits("terms"), ...(c && !fits("terms").includes(c) ? [c] : [])].map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          </div>
          {onDelete && <button onClick={onDelete} className="mt-3" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Remove this type</button>}
        </div>
      )}
    </div>
  );
}

function Templates({ templates, types, onChanged }: { templates: DocTemplate[]; types: PType[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const add = (kind: "warranty" | "terms") => {
    const name = window.prompt(`Name the new ${kind === "warranty" ? "warranty" : "contract"} template`);
    if (!name?.trim()) return;
    void call("/api/doc-templates", "POST", { kind, name, title: kind === "warranty" ? "Warranty" : name, ...(kind === "warranty" ? { body: "" } : { clauses: [] }) })
      .then((b) => { setOpen(b.template.id); onChanged(); }).catch((e) => setErr(String(e?.message ?? e)));
  };
  return (
    <div className="px-3 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
      <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Warranty &amp; contract templates</div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, margin: "2px 0 8px" }}>
        A proposal loads its type&apos;s templates; edits on a proposal stay there unless you Save as template. &ldquo;{"{org}"}&rdquo; is your organisation&apos;s name. <b>Starter</b> text came with ScopeCrete — check it with your attorney before you rely on it.
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginBottom: 6 }}>{err}</div>}
      {(["warranty", "terms"] as const).map((kind) => (
        <div key={kind} style={{ maxWidth: 720, marginBottom: 10 }}>
          <div className="flex items-center"><span style={eyebrow}>{kind === "warranty" ? "Warranties" : "Contracts"}</span><span className="flex-1" /><button style={btn} onClick={() => add(kind)}>+ {kind === "warranty" ? "Warranty" : "Contract"}</button></div>
          {templates.filter((t) => t.kind === kind).map((t) => (
            <TemplateRow key={t.id} t={t} types={types} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} onChanged={onChanged} onErr={setErr} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TemplateRow({ t, types, open, onOpen, onChanged, onErr }: { t: DocTemplate; types: PType[]; open: boolean; onOpen: () => void; onChanged: () => void; onErr: (e: string | null) => void }) {
  const [title, setTitle] = useState(t.title ?? "");
  const [body, setBody] = useState(t.body ?? "");
  const [clauses, setClauses] = useState<Clause[]>(t.clauses ?? []);
  const [pts, setPts] = useState<string[]>(t.project_types);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await call(`/api/doc-templates/${t.id}`, "PATCH", { title, project_types: pts, ...(t.kind === "warranty" ? { body } : { clauses }) }); onErr(null); onChanged(); }
    catch (e) { onErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  return (
    <div className="rounded mt-1.5" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      <button onClick={onOpen} className="w-full flex items-center gap-2 text-left" style={{ padding: "6px 10px", cursor: "pointer" }} aria-expanded={open}>
        <span style={{ fontSize: F.sm, fontWeight: 600 }}>{t.name}</span>
        {t.starter && <span style={{ fontSize: 10.5, color: "#6B4E12", background: "#F7EBC9", borderRadius: 3, padding: "0 5px" }}>starter</span>}
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{t.project_types.map((k) => types.find((x) => x.key === k)?.label ?? k).join(", ") || "any type"}</span>
        <span className="flex-1" /><span style={{ color: T.ink3 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 10px 10px", borderTop: `1px solid ${T.hairSoft}` }}>
          <div className="flex flex-wrap gap-3 mt-1" style={{ fontSize: F.xs }}>
            {types.map((x) => (
              <label key={x.key} className="flex items-center gap-1"><input type="checkbox" checked={pts.includes(x.key)} onChange={(e) => setPts(e.target.checked ? [...pts, x.key] : pts.filter((k) => k !== x.key))} />{x.label}</label>
            ))}
          </div>
          <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-2" style={{ ...input, fontWeight: 600 }} />
          {t.kind === "warranty" ? (
            <textarea aria-label="Warranty text" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="w-full mt-1.5" style={{ ...input, lineHeight: 1.45 }} />
          ) : (
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {clauses.map((c, i) => (
                <div key={i} className="flex gap-1.5 items-start">
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <input aria-label={`Clause ${i + 1} heading`} value={c.h} onChange={(e) => setClauses(clauses.map((x, j) => (j === i ? { ...x, h: e.target.value } : x)))} className="w-full" style={{ ...input, fontWeight: 600 }} />
                    <textarea aria-label={`Clause ${i + 1}`} value={c.b} rows={2} onChange={(e) => setClauses(clauses.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} className="w-full mt-0.5" style={input} />
                  </div>
                  <button aria-label={`Remove clause ${i + 1}`} onClick={() => setClauses(clauses.filter((_, j) => j !== i))} style={{ color: T.ink3, width: 22 }}>×</button>
                </div>
              ))}
              <div><button style={btn} onClick={() => setClauses([...clauses, { h: "", b: "" }])}>+ Clause</button></div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button style={{ ...btn, background: T.hiviz, color: T.onHiviz, borderColor: T.hiviz }} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
            <span className="flex-1" />
            <button style={{ ...eyebrow, color: T.red, cursor: "pointer" }} onClick={() => {
              if (window.confirm(`Delete the template "${t.name}"? Proposals made final keep their own copy; drafts using it lose that section's text.`)) void call(`/api/doc-templates/${t.id}`, "DELETE").then(onChanged).catch((e) => onErr(String(e?.message ?? e)));
            }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
