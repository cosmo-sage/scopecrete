"use client";
/**
 * Pick a unit (Coy, 2026-10-03: "Need to change unit types. Sometimes it's
 * days/sqft. I need to be able to add and edit unit types from this panel and
 * inside the costbook"). Used on a budget line's sheet and a Price book card.
 *
 * Offers the units already on the Price book's items (most used first) and the
 * common ones; **+ New unit…** types one in; **Edit units…** renames a unit on
 * every item that uses it (`PATCH /api/price-book/units`).
 */
import React, { useEffect, useState } from "react";
import { T, F, eyebrow, nums } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { cleanUnit, ownUnits, unitTypeOf, UNIT_TYPES } from "@/lib/units";

type OrgUnit = { unit: string; count: number };
let cache: Promise<OrgUnit[]> | null = null;
const loadUnits = (fresh = false) => {
  if (!cache || fresh) cache = fetch("/api/price-book/units").then((r) => r.json()).then((b) => (b.units ?? []) as OrgUnit[]).catch(() => []);
  return cache;
};

const NEW = "__new__", EDIT = "__edit__";

export function UnitPicker({ value, onChange, style, ariaLabel = "Unit type", editable = false }: {
  value: string | null; onChange: (unit: string) => void; style?: React.CSSProperties; ariaLabel?: string;
  /** Offer "Edit units…" (the Price book); a budget line keeps the list to the five and Coy's own. */
  editable?: boolean;
}) {
  const [org, setOrg] = useState<OrgUnit[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => { let off = false; void loadUnits().then((u) => { if (!off) setOrg(u); }); return () => { off = true; }; }, []);
  // Coy, 2026-10-05: "SqFt, SqYd, LnFt, CuYd, Each, + (to add my own)". "Square Feet" shows as SqFt.
  const type = unitTypeOf(value);
  const own = ownUnits(org.map((u) => u.unit), type ? null : value);
  const shown = type ?? value ?? "";
  const commit = () => { const u = cleanUnit(draft); setTyping(false); setDraft(""); if (u && u !== value) onChange(u); };

  if (typing) return (
    <div className="flex gap-1" style={{ minWidth: 0 }}>
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Day, SF, Truck" maxLength={20} aria-label="New unit"
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setTyping(false); setDraft(""); } }}
        style={{ ...style, flex: 1 }} />
      <button onClick={commit} className="rounded px-2" style={{ height: 36, background: T.ink, color: T.card, fontSize: F.xs, fontWeight: 700, cursor: "pointer" }}>Use</button>
    </div>
  );
  return (
    <>
      <select value={shown} aria-label={ariaLabel} style={style}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW) setTyping(true);
          else if (v === EDIT) setEditing(true);
          else if (v && v !== shown) onChange(v);
        }}>
        {!value && <option value="">Pick a unit type</option>}
        {UNIT_TYPES.map((t) => <option key={t.unit} value={t.unit}>{t.unit}</option>)}
        {own.length > 0 && (
          <optgroup label="Your own">
            {own.map((u) => <option key={u} value={u}>{u}</option>)}
          </optgroup>
        )}
        <option value={NEW}>+ Add my own unit type…</option>
        {editable && <option value={EDIT}>Rename units…</option>}
      </select>
      {editing && <UnitEditor onClose={() => setEditing(false)} onRenamed={(from, to) => { void loadUnits(true).then(setOrg); if (from === value) onChange(to); }} />}
    </>
  );
}

/** Rename a unit everywhere in the Price book — "sqft" and "sq ft" become "SF". */
function UnitEditor({ onClose, onRenamed }: { onClose: () => void; onRenamed: (from: string, to: string) => void }) {
  const [units, setUnits] = useState<OrgUnit[] | null>(null);
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { let off = false; void loadUnits(true).then((u) => { if (!off) setUnits(u); }); return () => { off = true; }; }, []);
  const save = async () => {
    if (!edit) return;
    const to = cleanUnit(edit.to);
    if (!to) { setMsg("A unit is 1 to 20 characters."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/price-book/units", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: edit.from, to }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setMsg(`“${edit.from}” is now “${to}” on ${b.renamed} item${b.renamed === 1 ? "" : "s"}.`);
      onRenamed(edit.from, to);
      setEdit(null);
      setUnits(await loadUnits());
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Units in your Price book" sub="Rename a unit and every item that uses it follows. Budgets already made keep theirs.">
      <div className="px-4 py-3">
        {!units && <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>}
        {units && !units.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>No units on any item yet — pick or add one on an item.</div>}
        {units?.map((u) => (
          <div key={u.unit} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, fontSize: F.sm }}>
            {edit?.from === u.unit ? (
              <>
                <input autoFocus value={edit.to} maxLength={20} onChange={(e) => setEdit({ ...edit, to: e.target.value })} aria-label={`Rename ${u.unit}`}
                  onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEdit(null); }}
                  style={{ flex: 1, height: 32, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 8px", background: T.card, color: T.ink }} />
                <button onClick={() => void save()} disabled={busy} className="rounded px-2" style={{ height: 30, background: T.ink, color: T.card, fontSize: F.xs, fontWeight: 700, cursor: "pointer" }}>{busy ? "…" : "Rename"}</button>
                <button onClick={() => setEdit(null)} style={{ fontSize: F.xs, color: T.ink3, cursor: "pointer" }}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontWeight: 600 }}>{u.unit}</span>
                <span style={{ color: T.ink3, fontSize: F.xs, ...nums }}>{u.count} item{u.count === 1 ? "" : "s"}</span>
                <button onClick={() => { setEdit({ from: u.unit, to: u.unit }); setMsg(null); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Rename</button>
              </>
            )}
          </div>
        ))}
        {msg && <div className="mt-2" style={{ fontSize: F.xs, color: T.ink2 }}>{msg}</div>}
      </div>
    </Sheet>
  );
}
