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
import { BOOK_LABEL, BOOK_PRESETS, ICON_ROLES, iconVar, presetOf, type MenuColors } from "@/lib/v34/menu-colors";

export function Toolbox({ open, onClose, keys, active, badge }: {
  open: boolean; onClose: () => void; keys: string[]; active: string;
  badge?: Record<string, boolean>;
}) {
  if (!open) return null;
  return (
    <>
      {/* Over an open thread (z 45) too — it's a menu (Coy, 2026-10-09); the scrim stops at the footer so its tabs still work. */}
      <button aria-label="Close the Toolbox" onClick={onClose} className="fixed left-0 right-0 top-0 lg:hidden"
        style={{ bottom: "var(--sc-foot)", zIndex: 46, background: "rgba(10,14,18,.18)", border: "none" }} />
      <nav aria-label="Toolbox" className="fixed left-0 right-0 lg:hidden sc-tool-up"
        style={{ bottom: "var(--sc-foot)", zIndex: 47, background: T.card, borderTop: `1px solid ${T.hair}`,
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

export function MenuEditor({ menus, onChange, colors, onColors }: { menus: Menus; onChange: (m: Menus) => void; colors?: MenuColors; onColors?: (c: MenuColors) => void }) {
  const preset = colors ? presetOf(colors) : null;
  const setColor = (k: string, role: string) => {
    if (!colors || !onColors) return;
    const next = { ...colors };
    if (role === "ink") delete next[k]; else next[k] = role as MenuColors[string];
    onColors(next);
  };
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
        {colors && " Each icon on the desktop menu can take a colour; the colours follow the theme."}
      </div>
      {colors && onColors && (
        <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 8 }}>
          <span style={{ ...eyebrow, fontSize: 10, color: T.ink3, marginRight: 2 }}>Icon colours</span>
          {Object.keys(BOOK_PRESETS).map((n) => (
            <button key={n} type="button" onClick={() => onColors({ ...BOOK_PRESETS[n] })} aria-pressed={preset === n}
              style={{ height: 26, padding: "0 10px", borderRadius: 999, fontSize: F.xs, cursor: "pointer",
                border: `1px solid ${preset === n ? T.ink : T.hair}`, background: preset === n ? T.ink : T.card, color: preset === n ? T.card : T.ink2 }}>
              {n}
            </button>
          ))}
        </div>
      )}
      {menus.rail.map((k, i) => {
        const p = PAGE.get(k);
        const isDusty = k === "dusty";
        return (
          <div key={k} className="py-1" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 22, display: "flex", justifyContent: "center" }}>
              {isDusty ? <DustyAvatar size={20} hidden /> : <NavIcon k={k} on color={colors?.[k] ? iconVar(colors[k]) : undefined} />}
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
          {colors && onColors && !isDusty && (
            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={`${p?.label} icon colour`} style={{ padding: "4px 0 2px 30px" }}>
              {ICON_ROLES.map((r) => {
                const on = (colors[k] ?? "ink") === r;
                return (
                  <button key={r} type="button" className="sc-book-swatch" aria-pressed={on} onClick={() => setColor(k, r)}
                    title={BOOK_LABEL[r]} aria-label={BOOK_LABEL[r]}
                    style={{ width: 20, height: 20, background: iconVar(r) }} />
                );
              })}
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
