"use client";

/**
 * Settings → AI: Dusty's thought line, on a phone and on a desktop apart
 * (Coy, 2026-10-05: "if I want to declutter my visual space I can make it
 * disappear entirely" — "off on mobile and on on desktop"). The phone's
 * follows the desktop's until it is set itself. The dashboard layout reads the
 * same prefs (one store, src/lib/v34/prefs.ts) and app/layout.tsx sets
 * <html data-activity-phone> before first paint from the browser's copy.
 */

import React from "react";
import { T, F } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { SettingsBlock, SettingsTitle, Toggle } from "@/components/v34/settings/parts";

export function AiSettings() {
  const [showLine, setShowLine] = usePref<boolean>("activity_line", true);
  const [showLinePhone, setShowLinePhone] = usePref<boolean | null>("activity_line_phone", null);
  const deskLineOn = showLine !== false;
  const phoneLineOn = (showLinePhone ?? showLine) !== false;
  const rows: Array<[string, boolean, (v: boolean) => void]> = [
    ["On a phone", phoneLineOn, (v) => setShowLinePhone(v)],
    ["On a desktop", deskLineOn, (v) => {
      // The phone keeps what it showed: it followed the desktop's switch until now.
      if (showLinePhone === null) setShowLinePhone(deskLineOn);
      setShowLine(v);
    }],
  ];
  return (
    <div>
      <SettingsTitle title="AI" note="How Dusty shows up around the app." />
      <SettingsBlock title="Show Dusty's thought line"
        note="The line beside the logo (under it on a phone): what he's reading, reminders due, people who came back. A phone and a desktop are set apart.">
        {rows.map(([label, on, set]) => (
          <div key={label} className="flex items-center gap-3" style={{ padding: "4px 0" }}>
            <div className="flex-1 min-w-0" style={{ fontSize: F.sm, color: T.ink2 }}>{label}</div>
            <Toggle on={on} label={`Show Dusty's thought line ${label.toLowerCase()}`} onChange={set} />
          </div>
        ))}
      </SettingsBlock>
    </div>
  );
}
