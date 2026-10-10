"use client";

/**
 * Settings → Appearance: the colour selector.
 * Saved with usePref("theme") (migration 053 user_preferences), applied to <html>
 * before first paint by the inline script in README step 3 to avoid a flash.
 */

import React, { useEffect } from "react";
import { usePref } from "@/lib/v34/prefs";
import { THEMES, THEME_ORDER, DEFAULT_THEME, applyTheme, type ThemeKey } from "@/lib/v34/themes";

export function useTheme() {
  // null until the saved choice is known, so the default never overwrites the
  // theme the head script already put on <html> (no flash of cream).
  const [key, setKey] = usePref<ThemeKey | null>("theme", null);
  useEffect(() => {
    if (!key || !THEMES[key]) return;
    applyTheme(key);
    try { localStorage.setItem("sc-theme", key); } catch { /* private mode */ }
  }, [key]);
  const current = key && THEMES[key] ? key : DEFAULT_THEME;
  return [THEMES[current], setKey as (k: ThemeKey) => void] as const;
}

export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Color" className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
      {THEME_ORDER.map((k) => {
        const t = THEMES[k];
        const on = theme.key === k;
        return (
          <button key={k} role="radio" aria-checked={on} onClick={() => setTheme(k)}
            style={{ textAlign: "left", padding: 0, borderRadius: 4, overflow: "hidden", cursor: "pointer",
                     border: `${on ? 2 : 1}px solid ${on ? "var(--sc-hiviz)" : "var(--sc-hair)"}`, background: t.slab }}>
            {/* mini preview: paper header strip, rail, card, accent */}
            <div style={{ height: 14, background: t.paper, borderBottom: `1px solid ${t.pencilLine}`,
                          backgroundImage: `linear-gradient(${t.paperGrid} 1px,transparent 1px),linear-gradient(90deg,${t.paperGrid} 1px,transparent 1px)`, backgroundSize: "5px 5px" }} />
            <div style={{ display: "flex", height: 44 }}>
              <div style={{ width: 16, background: t.rail }} />
              <div style={{ flex: 1, padding: 6, display: "flex", gap: 4, alignItems: "flex-start" }}>
                <div style={{ flex: 1, height: 26, background: t.card, border: `1px solid ${t.hair}`, borderRadius: 2 }} />
                <div style={{ width: 22, height: 10, background: t.hiviz, borderRadius: 2 }} />
                <div style={{ width: 10, height: 10, background: t.dustyTint, border: `1px solid ${t.dustyEdge}`, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ padding: "6px 8px", background: t.card, borderTop: `1px solid ${t.hair}` }}>
              <div style={{ fontFamily: t.font.strong, fontWeight: 600, fontSize: 13, color: t.ink }}>{t.label}{on ? " ✓" : ""}</div>
              <div style={{ fontSize: 11, color: t.ink3, fontFamily: t.font.body }}>{t.note}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
