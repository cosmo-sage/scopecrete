"use client";

/**
 * Settings → Appearance: the color scheme (ThemePicker, saved on the account,
 * src/lib/v34/themes.ts). Some schemes change the typeface too. And the new
 * Spaces navigation, to try (Claude Design "Dusty Home", Coy 2026-10-17).
 */

import React from "react";
import { ThemePicker } from "@/components/v34/theme-picker";
import { SettingsBlock, SettingsTitle, Toggle } from "@/components/v34/settings/parts";
import { usePref } from "@/lib/v34/prefs";
import { T, F } from "@/lib/v34/tokens";

export function AppearanceSettings() {
  const [newNav, setNewNav] = usePref<boolean>("new_nav", false);
  return (
    <div>
      <SettingsTitle title="Appearance" note="How the app looks on this account, on every device." />
      <SettingsBlock title="Color scheme" note="Nine color schemes, one dark — some change the typeface too.">
        <ThemePicker />
      </SettingsBlock>
      <SettingsBlock title="New navigation" note="Being built: Dusty as Home, every open job a Space on the left rail with its pages and its threads. Switch it off to go back to today's menu.">
        <div className="flex items-center gap-3" style={{ padding: "4px 0" }}>
          <div className="flex-1 min-w-0" style={{ fontSize: F.sm, color: T.ink2 }}>Use the new navigation</div>
          <Toggle on={newNav === true} label="Use the new navigation" onChange={setNewNav} />
        </div>
      </SettingsBlock>
    </div>
  );
}
