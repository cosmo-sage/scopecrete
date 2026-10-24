"use client";
/**
 * Weeks of the month, this month and the next three (Coy, 2026-10-24: "a calendar with the weeks
 * in the month listed and the next 3 months showing"). Used by Coy's composer (the weeks he wants
 * the work done in) and by the vendor's link (the weeks they could do it). A week is a key
 * "YYYY-MM-wN" — see src/lib/bid-weeks.ts. Past weeks can't be picked.
 */
import React, { useMemo } from "react";
import { calendarMonths, centralToday, toggleWeek } from "@/lib/bid-weeks";

export interface WeekPalette { ink: string; ink3: string; hair: string; card: string; accent: string; onAccent: string; mark: string }

export function WeekPicker({ value, onChange, wanted, readOnly, pal }: {
  value: string[];
  onChange?: (v: string[]) => void;
  /** Weeks the other side marked (Coy's wanted weeks on the vendor's link): a dot on each. */
  wanted?: string[];
  readOnly?: boolean;
  pal: WeekPalette;
}) {
  const months = useMemo(() => calendarMonths(centralToday()), []);
  const want = new Set(wanted ?? []);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
      {months.map((m) => (
        <div key={m.key} style={{ border: `1px solid ${pal.hair}`, borderRadius: 6, padding: 8, background: pal.card }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: pal.ink, marginBottom: 6 }}>{m.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {m.weeks.map((w) => {
              const on = value.includes(w.key);
              const dis = readOnly || w.past;
              return (
                <button key={w.key} type="button" disabled={dis} aria-pressed={on}
                  onClick={() => onChange?.(toggleWeek(value, w.key))}
                  style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 34, padding: "0 8px", borderRadius: 4, fontSize: 13, textAlign: "left",
                    border: `1px solid ${on ? pal.accent : pal.hair}`, background: on ? pal.accent : "transparent", color: on ? pal.onAccent : w.past ? pal.ink3 : pal.ink,
                    opacity: w.past ? 0.45 : 1, cursor: dis ? "default" : "pointer" }}>
                  <span style={{ fontWeight: 600 }}>Wk {w.n}</span>
                  <span style={{ flex: 1, opacity: 0.8 }}>{w.from}–{w.to}</span>
                  {want.has(w.key) && <span title="Wanted" aria-label="wanted" style={{ width: 8, height: 8, borderRadius: 4, background: on ? pal.onAccent : pal.mark, flex: "none" }} />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
