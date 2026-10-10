"use client";

/**
 * Settings → Appearance: the color scheme (ThemePicker, saved on the account,
 * src/lib/v34/themes.ts). Some schemes change the typeface too.
 */

import React from "react";
import { ThemePicker } from "@/components/v34/theme-picker";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";

export function AppearanceSettings() {
  return (
    <div>
      <SettingsTitle title="Appearance" note="How the app looks on this account, on every device." />
      <SettingsBlock title="Color scheme" note="Nine color schemes, one dark — some change the typeface too.">
        <ThemePicker />
      </SettingsBlock>
    </div>
  );
}
