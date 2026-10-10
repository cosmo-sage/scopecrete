"use client";

/**
 * Settings → Menus: the order of the desktop rail and the Toolbox, the three
 * phone footer pages, and each icon's color (MenuEditor, src/components/v34/toolbox.tsx).
 * The same prefs the dashboard layout reads (`menus`, `menu_colors`).
 */

import React from "react";
import { T, eyebrow } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { useMe } from "@/lib/v34/me-ctx";
import { MenuEditor } from "@/components/v34/toolbox";
import { DEFAULT_MENUS, cleanMenus, type Menus } from "@/lib/v34/pages";
import { cleanMenuColors, type MenuColors } from "@/lib/v34/menu-colors";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";

export function MenusSettings() {
  const { me } = useMe();
  const [savedMenus, setSavedMenus] = usePref<Menus>("menus", DEFAULT_MENUS);
  const [savedColors, setSavedColors] = usePref<MenuColors | null>("menu_colors", null);
  const menus = cleanMenus(savedMenus, { admin: !!me?.admin });
  return (
    <div>
      <SettingsTitle title="Menus" note="The order of your pages, which ones sit in the phone footer, and the icons' colors." />
      <SettingsBlock title="Pages and icons"
        action={<button onClick={() => { setSavedMenus(DEFAULT_MENUS); setSavedColors(null); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Back to the default</button>}>
        <MenuEditor menus={menus} onChange={(m) => setSavedMenus(m)} colors={cleanMenuColors(savedColors)} onColors={setSavedColors} />
      </SettingsBlock>
    </div>
  );
}
