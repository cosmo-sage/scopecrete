"use client";

/**
 * The Toolbox (Coy, 2026-09-30) — the phone footer's last slot. It opens a
 * drawer that rises from just above the footer: the pages that are not in the
 * footer, as icons on the footer's own five columns, so each one lines up with
 * a footer icon. Not a list, not a page over everything; a tap outside, the
 * Toolbox again, or picking a page closes it. The page opens between the
 * header and the footer, so Dusty stays one tap away.
 *
 * MenuEditor — Settings → Menus: the order of the desktop rail, and which three
 * pages sit in the phone footer beside Dusty (the rest are in the Toolbox).
 * Saved to Coy's account (migration 053), so both devices follow.
 */

import React from "react";
import Link from "next/link";
import { T, F, eyebrow } from "@/lib/v34/tokens";
import { NavIcon } from "@/components/v34/primitives";
import { PAGE, type Menus } from "@/lib/v34/pages";
import { DustyAvatar } from "@/components/v34/dusty-avatar";

export function Toolbox({ open, onClose, keys, active, badge }: {
  open: boolean; onClose: () => void; keys: string[]; active: string;
  badge?: Record<string, boolean>;
}) {
  if (!open) return null;
  return (
    <>
      <button aria-label="Close the Toolbox" onClick={onClose} className="fixed inset-0 lg:hidden"
        style={{ zIndex: 34, background: "rgba(10,14,18,.18)", border: "none" }} />
      <nav aria-label="Toolbox" className="fixed left-0 right-0 lg:hidden sc-tool-up"
        style={{ bottom: "var(--sc-foot)", zIndex: 35, background: T.card, borderTop: `1px solid ${T.hair}`,
                 boxShadow: "0 -8px 24px rgba(10,14,18,.12)", padding: "6px 0 4px" }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", rowGap: 2 }}>
          {keys.map((k) => {
            const p = PAGE.get(k);
            if (!p) return null;
            const on = active === k;
            return (
              <Link key={k} href={p.href} onClick={onClose} aria-current={on ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 no-underline" style={{ height: 58, position: "relative" }}>
                <span style={{ position: "relative", display: "flex" }}>
                  <NavIcon k={k} on={on} />
                  {badge?.[k] && <span aria-label="needs a look" className="absolute rounded-full" style={{ top: -2, right: -4, width: 7, height: 7, background: T.red }} />}
                </span>
                <span style={{ ...eyebrow, fontSize: 9, color: on ? T.ink : T.ink3 }}>{p.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function MenuEditor({ menus, onChange }: { menus: Menus; onChange: (m: Menus) => void }) {
  const move = (k: string, d: -1 | 1) => {
    const r = [...menus.rail];
    const i = r.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]];
    onChange({ ...menus, rail: r });
  };
  const toggleFooter = (k: string) => {
    const has = menus.footer.includes(k);
    if (has) { if (menus.footer.length <= 1) return; onChange({ ...menus, footer: menus.footer.filter((x) => x !== k) }); return; }
    if (menus.footer.length >= 3) return;
    onChange({ ...menus, footer: [...menus.footer, k] });
  };
  const btn: React.CSSProperties = { width: 26, height: 26, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, cursor: "pointer", fontSize: 12, lineHeight: 1 };
  return (
    <div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginBottom: 6 }}>
        The order here is the desktop rail and the Toolbox. Tick up to three pages for the phone footer — Dusty sits in its middle and the Toolbox holds the rest.
      </div>
      {menus.rail.map((k, i) => {
        const p = PAGE.get(k);
        const isDusty = k === "dusty";
        return (
          <div key={k} className="flex items-center gap-2 py-1" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
            <span style={{ width: 22, display: "flex", justifyContent: "center" }}>
              {isDusty ? <DustyAvatar size={20} hidden /> : <NavIcon k={k} on />}
            </span>
            <span style={{ flex: 1, fontSize: F.sm }}>{isDusty ? "Dusty" : p?.label}</span>
            {!isDusty && (
              <label className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink2 }}>
                <input type="checkbox" checked={menus.footer.includes(k)} onChange={() => toggleFooter(k)}
                  disabled={!menus.footer.includes(k) && menus.footer.length >= 3}
                  aria-label={`${p?.label} in the phone footer`} style={{ width: 15, height: 15, accentColor: T.chalk }} />
                footer
              </label>
            )}
            <button onClick={() => move(k, -1)} disabled={i === 0} aria-label={`Move ${isDusty ? "Dusty" : p?.label} up`} style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}>▲</button>
            <button onClick={() => move(k, 1)} disabled={i === menus.rail.length - 1} aria-label={`Move ${isDusty ? "Dusty" : p?.label} down`} style={{ ...btn, opacity: i === menus.rail.length - 1 ? 0.35 : 1 }}>▼</button>
          </div>
        );
      })}
    </div>
  );
}
