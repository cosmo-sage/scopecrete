"use client";

/**
 * Settings → Menus: the order of the desktop rail and the Toolbox, the three
 * phone footer pages, and each icon's color (MenuEditor, src/components/v34/toolbox.tsx).
 * The same prefs the dashboard layout reads (`menus`, `menu_colors`), so the rail
 * changes as they are picked.
 *
 * MenuPanel is the same editor sliding out of the desktop rail (Coy, 2026-10-10:
 * "a menu settings panel that slides out from the main menu").
 */

import React, { useEffect } from "react";
import { T, eyebrow, disp } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { useMe } from "@/lib/v34/me-ctx";
import { MenuEditor } from "@/components/v34/toolbox";
import { DEFAULT_MENUS, cleanMenus, type Menus } from "@/lib/v34/pages";
import { cleanMenuColors, type MenuColors } from "@/lib/v34/menu-colors";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";

function useMenuPrefs() {
  const { me } = useMe();
  const [savedMenus, setSavedMenus] = usePref<Menus>("menus", DEFAULT_MENUS);
  const [savedColors, setSavedColors] = usePref<MenuColors | null>("menu_colors", null);
  return {
    menus: cleanMenus(savedMenus, { admin: !!me?.admin }),
    setMenus: setSavedMenus,
    colors: cleanMenuColors(savedColors),
    setColors: setSavedColors,
    reset: () => { setSavedMenus(DEFAULT_MENUS); setSavedColors(null); },
  };
}

const resetBtn = { ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties;

export function MenusSettings() {
  const m = useMenuPrefs();
  return (
    <div>
      <SettingsTitle title="Menus" note="The order of your pages, which ones sit in the phone footer, and the icons' colors." />
      <SettingsBlock title="Pages and icons"
        action={<button onClick={m.reset} style={resetBtn}>Back to the default</button>}>
        <MenuEditor menus={m.menus} onChange={m.setMenus} colors={m.colors} onColors={m.setColors} />
      </SettingsBlock>
    </div>
  );
}

/** The editor in a panel that slides out of the desktop rail, beside it. */
export function MenuPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMenuPrefs();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <>
      {open && <div className="sc-menu-panel-scrim hidden lg:block" onClick={onClose} aria-hidden="true" />}
      <aside role="dialog" aria-label="Menu settings" aria-hidden={!open} inert={!open}
        className="sc-menu-panel hidden lg:flex flex-col" data-open={open ? "" : undefined}>
        <div className="flex items-center gap-2" style={{ padding: "12px 14px", borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: disp, fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: ".04em", textTransform: "uppercase" }}>Menu settings</div>
            <div style={{ fontSize: 12, color: T.ink3 }}>▲▼ to reorder · a swatch colors an icon</div>
          </div>
          <button onClick={m.reset} style={resetBtn}>Default</button>
          <button onClick={onClose} aria-label="Close menu settings"
            style={{ width: 30, height: 30, border: 0, background: "transparent", color: T.ink2, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 24px" }}>
          <MenuEditor menus={m.menus} onChange={m.setMenus} colors={m.colors} onColors={m.setColors} />
        </div>
      </aside>
    </>
  );
}
