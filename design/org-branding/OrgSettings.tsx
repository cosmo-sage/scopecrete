"use client";

/**
 * Settings → Organisation (owners only). Sits between "Signed in as" and
 * "Phone lines" in the Settings sheet (layout.tsx).
 *   - Name: one field + Save. PATCH /api/org { name } → orgs.name.
 *   - Logo: two slots — for light backgrounds (dark lettering) and for dark
 *     backgrounds (light lettering). Upload / Replace / Remove each.
 */

import React, { useRef, useState } from "react";

interface Org { id: string; name: string; logo_light_url: string | null; logo_dark_url: string | null }

const lbl: React.CSSProperties = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase" };

export function OrgSettings({ org, canEdit, onChange }: { org: Org; canEdit: boolean; onChange: (o: Org) => void }) {
  const [draft, setDraft] = useState(org.name);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const dirty = draft.trim() !== "" && draft.trim() !== org.name;

  async function saveName() {
    if (!dirty) return;
    setState("saving"); setErr(null);
    const r = await fetch("/api/org", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.trim() }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setState("error"); setErr(b?.error ?? `HTTP ${r.status}`); return; }
    onChange(b.org); setState("saved"); setTimeout(() => setState("idle"), 2400);
  }

  async function upload(which: "light" | "dark", file: File) {
    const fd = new FormData(); fd.append("file", file); fd.append("variant", which);
    const r = await fetch("/api/org/logo", { method: "POST", body: fd });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(b?.error ?? `HTTP ${r.status}`); return; }
    onChange(b.org);
  }
  async function remove(which: "light" | "dark") {
    const r = await fetch(`/api/org/logo?variant=${which}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (r.ok) onChange(b.org);
  }

  const help = state === "saved" ? "Renamed everywhere — header, quotes, invoices, email signatures and Dusty."
    : dirty ? "Saving renames the organisation everywhere it appears."
    : "Shown on quotes, invoices, email signatures, and to your team.";

  return (
    <section className="py-3" style={{ borderBottom: "1px solid var(--sc-hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ flex: 1, fontFamily: "'Lexend', sans-serif", fontWeight: 600, fontSize: 16 }}>Organisation</span>
        {!canEdit && <span style={{ ...lbl, fontSize: 11, color: "var(--sc-ink3)" }}>Owners only</span>}
      </div>

      <label style={{ ...lbl, display: "block", marginTop: 12, color: "var(--sc-ink2)" }}>Name</label>
      <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
        <input value={draft} disabled={!canEdit} onChange={(e) => { setDraft(e.target.value); setState("idle"); }}
          onKeyDown={(e) => { if (e.key === "Enter") void saveName(); }} maxLength={120}
          style={{ flex: 1, minWidth: 0, height: 38, padding: "0 12px", borderRadius: 4, fontSize: 14.5,
                   border: `1px solid ${dirty ? "var(--sc-hiviz-soft)" : "var(--sc-hair-strong)"}`, background: "var(--sc-card)", color: "var(--sc-ink)" }} />
        <button onClick={() => void saveName()} disabled={!dirty || state === "saving"}
          style={{ ...lbl, fontSize: 13, height: 38, padding: "0 14px", border: "none", borderRadius: 4,
                   background: dirty ? "var(--sc-hiviz)" : "var(--sc-hair-strong)", color: "var(--sc-on-hiviz)" }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save"}
        </button>
      </div>
      <div style={{ fontSize: 11.5, marginTop: 5, color: state === "saved" ? "var(--sc-green)" : state === "error" ? "var(--sc-red)" : "var(--sc-ink3)" }}>{err ?? help}</div>

      <div style={{ ...lbl, marginTop: 14, color: "var(--sc-ink2)" }}>Logo</div>
      {(["light", "dark"] as const).map((v) => (
        <LogoSlot key={v} variant={v} url={v === "light" ? org.logo_light_url : org.logo_dark_url} canEdit={canEdit}
          onPick={(f) => void upload(v, f)} onRemove={() => void remove(v)} />
      ))}
      <div style={{ fontSize: 11.5, color: "var(--sc-ink3)", marginTop: 6 }}>
        Transparent PNG or SVG, at least 600px wide. Shown 28px tall in the header with &ldquo;powered by scopecrete.ai&rdquo; beside it.
      </div>
    </section>
  );
}

function LogoSlot({ variant, url, canEdit, onPick, onRemove }: { variant: "light" | "dark"; url: string | null; canEdit: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const light = variant === "light";
  const grid = light ? "rgba(89,128,166,.08)" : "rgba(140,170,200,.09)";
  return (
    <div style={{ border: "1px solid var(--sc-hair)", borderRadius: 4, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: 84, display: "flex", alignItems: "center", justifyContent: "center", background: light ? "#FAF8F3" : "#202326",
                    backgroundImage: `linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px)`, backgroundSize: "10px 10px" }}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" style={{ maxHeight: 46, maxWidth: "78%" }} />
          : <span style={{ fontSize: 12, color: light ? "#8C8578" : "#A39D93" }}>No logo yet — the header shows scopecrete.ai</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderTop: "1px solid var(--sc-hair)", background: "var(--sc-card)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{light ? "For light backgrounds" : "For dark backgrounds"}</div>
          <div style={{ fontSize: 11, color: "var(--sc-ink3)" }}>{light ? "Dark lettering · Site Office, Blueprint, Kraft Yard" : "Light lettering · Night Shift"}</div>
        </div>
        {canEdit && (<>
          <input ref={input} type="file" accept="image/png,image/svg+xml,image/webp" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
          <button onClick={() => input.current?.click()} style={{ ...lbl, height: 28, padding: "0 10px", border: "1px solid var(--sc-hair-strong)", borderRadius: 3, background: "transparent", color: "var(--sc-ink)" }}>
            {url ? "Replace" : "Upload"}
          </button>
          {url && <button onClick={onRemove} style={{ ...lbl, border: "none", background: "none", color: "var(--sc-red)" }}>Remove</button>}
        </>)}
      </div>
    </div>
  );
}
