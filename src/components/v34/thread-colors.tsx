"use client";
/**
 * Thread colours (Coy, 2026-10-10): the ⚙ under the thread rail (and in the
 * phone's drawer) opens a side panel with every thread and its swatches. A
 * system thread's colour is its bucket's CSS variable, set on the page's root
 * so every tag and box follows; a thread Coy made keeps its colour in the
 * same preference. src/lib/v34/thread-colors.ts holds the rules.
 */
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { Drawer } from "@/components/v34/primitives";
import { THREAD_COLOR_CHOICES, BUCKET_VARS, cleanThreadColors, withThreadColor, type ThreadColors } from "@/lib/v34/thread-colors";

export function useThreadColors(): [ThreadColors, (key: string, color: string | null) => void] {
  const [raw, setRaw] = usePref<ThreadColors>("thread_colors", {});
  const colors = cleanThreadColors(raw);
  return [colors, (key, color) => setRaw(withThreadColor(colors, key, color))];
}

/** Puts Coy's bucket colours on the root, over the theme's. */
export function ThreadColorVars() {
  const [colors] = useThreadColors();
  const sig = JSON.stringify(colors);
  useEffect(() => {
    const root = document.documentElement.style;
    const set = JSON.parse(sig) as ThreadColors;
    for (const [k, v] of Object.entries(BUCKET_VARS)) {
      if (set[k]) root.setProperty(v, set[k]); else root.removeProperty(v);
    }
  }, [sig]);
  return null;
}

export function ThreadColorsPanel({ open, onClose, threads }: {
  open: boolean; onClose: () => void;
  threads: Array<{ key: string; label: string; color: string }>;
}) {
  const [colors, setColor] = useThreadColors();
  // Drawn on the page's body: inside the rail's sticky, scrolling nav a fixed
  // drawer is clipped to that 72px strip (Coy, 2026-10-10).
  // It only opens on a tap, so the server never draws it.
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <Drawer open={open} onClose={onClose} title="Thread colours" sub="Colours each thread and its people's boxes." left>
      <div className="px-4 py-3 flex flex-col gap-4">
        {threads.map((t) => {
          const mine = colors[t.key.toLowerCase()];
          return (
            <div key={t.key}>
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: mine ?? t.color }} />
                <span style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", flex: 1, minWidth: 0, ...clip }}>{t.label}</span>
                {mine && <button type="button" onClick={() => setColor(t.key, null)} style={{ ...eyebrow, fontSize: 10, color: T.ink3, cursor: "pointer" }}>Default</button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {THREAD_COLOR_CHOICES.map((c) => {
                  const on = (mine ?? "").toUpperCase() === c;
                  return (
                    <button key={c} type="button" onClick={() => setColor(t.key, c)} aria-label={`${t.label}: ${c}`} aria-pressed={on}
                      style={{ width: 24, height: 24, borderRadius: 4, background: c, cursor: "pointer",
                        border: on ? `2px solid ${T.ink}` : "2px solid transparent", boxShadow: on ? `inset 0 0 0 2px ${T.card}` : "none" }} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>,
    document.body,
  );
}
