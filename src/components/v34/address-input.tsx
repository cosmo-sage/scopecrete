"use client";
/**
 * A street box that finishes the address as you type (Coy, 2026-10-03: "the
 * same autocomplete that tries to finish the address on google maps") — real
 * addresses from Mapbox through `/api/address/suggest`; picking one fills the
 * street, city, state and zip, correctly spelled. Typing freely still works.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import type { AddressMatch } from "@/lib/address-check";

export function AddressInput({ value, onChange, onPick, near, style }: {
  value: string; onChange: (v: string) => void; onPick: (m: AddressMatch) => void;
  near?: { lat: number; lng: number } | null; style?: React.CSSProperties;
}) {
  const [list, setList] = useState<AddressMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const listId = useId();
  const nLat = near?.lat, nLng = near?.lng;
  useEffect(() => {
    if (!typed.current || value.trim().length < 4) { setList([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      const q = new URLSearchParams({ q: value });
      if (nLat != null && nLng != null) { q.set("lat", String(nLat)); q.set("lng", String(nLng)); }
      fetch(`/api/address/suggest?${q}`, { signal: ctl.signal }).then((r) => r.json())
        .then((b) => { setList((b.suggestions ?? []) as AddressMatch[]); setActive(-1); setOpen(true); })
        .catch(() => { /* typing on */ });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [value, nLat, nLng]); // the point by value: an inline object would re-ask on every render
  const pick = (m: AddressMatch) => { typed.current = false; setOpen(false); setList([]); onPick(m); };
  return (
    <div style={{ position: "relative" }}>
      <input value={value} autoComplete="off" role="combobox" aria-controls={listId} aria-expanded={open && list.length > 0} aria-autocomplete="list"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        style={style} />
      {open && list.length > 0 && (
        <div id={listId} role="listbox" style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 2, zIndex: 20, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.12)", overflow: "hidden" }}>
          {list.map((m, i) => (
            <button key={`${m.formatted}-${i}`} role="option" aria-selected={i === active} type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              className="block w-full text-left" style={{ padding: "8px 10px", fontSize: F.sm, color: T.ink, background: i === active ? T.sunk : "transparent", cursor: "pointer", borderBottom: i < list.length - 1 ? `1px solid ${T.hairSoft}` : "none" }}>
              <span style={{ fontWeight: 600 }}>{m.line1}</span>
              <span style={{ color: T.ink3 }}> · {[m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
            </button>
          ))}
          <div style={{ padding: "3px 10px", fontSize: 10, color: T.ink3, textAlign: "right" }}>Addresses from Mapbox</div>
        </div>
      )}
    </div>
  );
}
