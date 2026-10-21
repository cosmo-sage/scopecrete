"use client";

/**
 * Arrange the rail (Coy, 2026-10-18: "I need a way to remove and rearrange the Rail items").
 * Every Space on the rail in its order, ↑ ↓ to move one, × to take it off: a pinned customer
 * or vendor is unpinned, a job or collection is only hidden from the rail (the job and its
 * thread are untouched) and listed under "Off the rail" with Put back. Kept on the account
 * (`spaces_rail`, `spaces_pins`). A collection can also be deleted (retired). Dragging a tile on a desktop's rail does the same moves.
 * ↻ has Dusty draw a Space's icon again and ◇ puts the plain shape back (migration 117, space-icon.tsx).
 */

import React, { useEffect, useState } from "react";
import { SpaceIcon, drawIcon, setShapeIcon, useSpaceIcons } from "@/components/v34/spaces/space-icon";

export interface RailTileInfo {
  key: string; name: string; sub: string;
  shape: "job" | "contact" | "vendor" | "collection"; color: string; initials: string;
  pinned: boolean;
}

export function ArrangeRail({ shown, hidden, onMove, onRemove, onShow, onReset, onClose, onDelete }: {
  shown: RailTileInfo[]; hidden: RailTileInfo[];
  /** A collection (a thread Coy made) deleted for good — retired, its people untouched. */
  onDelete?: (t: RailTileInfo) => void;
  onMove: (key: string, to: number) => void; onRemove: (t: RailTileInfo) => void;
  onShow: (key: string) => void; onReset: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // Each Space's icon (migration 117): Dusty draws it again, or it goes back to the shape.
  const icons = useSpaceIcons();
  const [iconErr, setIconErr] = useState<Record<string, string>>({});
  const redraw = async (key: string) => {
    const err = await drawIcon(key);
    setIconErr((e) => { const n = { ...e }; if (err) n[key] = err; else delete n[key]; return n; });
  };
  const iconButtons = (t: RailTileInfo) => {
    if (icons.supported !== true) return null;
    const row = icons.icons.get(t.key);
    const busy = icons.drawing.has(t.key);
    return (
      <>
        <button type="button" className="sc-shelf-btn" disabled={busy} onClick={() => { void redraw(t.key); }}
          aria-label={`Dusty draws a new icon for ${t.name}`} title={busy ? "Dusty is drawing…" : "Draw the icon again"}>{busy ? "…" : "↻"}</button>
        {row?.source !== "shape" && (
          <button type="button" className="sc-shelf-btn" onClick={() => { void setShapeIcon(t.key); }}
            aria-label={`Use the plain shape for ${t.name}`} title="Use the plain shape instead">◇</button>
        )}
      </>
    );
  };

  const row = (t: RailTileInfo, i: number | null) => (
    <li key={t.key} className="sc-arrange-row">
      <SpaceIcon spaceKey={t.key} kind={t.shape} color={t.color} initials={t.initials} size={32} />
      <span className="sc-arrange-name">
        <span className="sc-arrange-n">{t.name}</span>
        <span className="sc-arrange-s">{iconErr[t.key] ? <span style={{ color: "var(--sc-red)" }}>{iconErr[t.key]}</span> : t.sub}</span>
      </span>
      {iconButtons(t)}
      {onDelete && t.key.startsWith("col:") && (
        <button type="button" className="sc-space-more" style={{ color: "var(--sc-red)" }}
          onClick={() => { if (window.confirm(`Delete the Work Space "${t.name}"? The people and their threads stay.`)) onDelete(t); }}>Delete</button>
      )}
      {i === null ? (
        <button type="button" className="sc-space-more" onClick={() => onShow(t.key)}>Put back</button>
      ) : (
        <>
          <button type="button" className="sc-shelf-btn" disabled={i === 0} onClick={() => onMove(t.key, i - 1)} aria-label={`Move ${t.name} up`} title="Up">↑</button>
          <button type="button" className="sc-shelf-btn" disabled={i === shown.length - 1} onClick={() => onMove(t.key, i + 1)} aria-label={`Move ${t.name} down`} title="Down">↓</button>
          <button type="button" className="sc-shelf-btn" onClick={() => onRemove(t)}
            aria-label={`Take ${t.name} off the rail`} title={t.pinned ? "Unpin from the rail" : "Take off the rail (the job or thread stays)"}>×</button>
        </>
      )}
    </li>
  );

  return (
    <div className="sc-newspace-scrim" onClick={onClose}>
      <div className="sc-newspace" role="dialog" aria-modal="true" aria-label="Arrange the rail" onClick={(e) => e.stopPropagation()}>
        <div className="sc-newspace-head">
          <span>Arrange the rail</span>
          <button type="button" className="sc-shelf-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {shown.length === 0
          ? <p className="sc-newspace-blurb">Nothing on the rail but Home. + adds a Work Space.</p>
          : <ul className="sc-arrange-list">{shown.map((t, i) => row(t, i))}</ul>}
        {hidden.length > 0 && (
          <>
            <div className="sc-arrange-label">Off the rail · {hidden.length}</div>
            <ul className="sc-arrange-list">{hidden.map((t) => row(t, null))}</ul>
          </>
        )}
        <div className="sc-newspace-foot">
          <button type="button" className="sc-space-more" onClick={onReset}>Default order</button>
          <button type="button" className="sc-newspace-go" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
