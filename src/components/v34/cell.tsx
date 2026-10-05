"use client";

/**
 * A number cell for the spreadsheet screens (the job budget, the Price book):
 * shows the value, edits in place, saves on blur or Enter, Escape puts it back.
 * Blank saves as blank — never as 0 (DECISIONS §3: nothing assumed).
 */

import React, { useState } from "react";
import { T, F, nums } from "@/lib/v34/tokens";

export function Cell({ value, onSave, label, money: isMoney, placeholder, warn, suffix, width }: {
  value: number | null; onSave: (v: number | null) => void; label: string; money?: boolean; placeholder?: string;
  warn?: boolean; suffix?: string; width?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const shown = draft ?? (value === null ? "" : isMoney ? value.toFixed(2) : String(Math.round(value * 100) / 100));
  const commit = () => {
    setFocus(false);
    if (draft === null) return;
    const v = draft.trim() === "" ? null : Number(draft.replace(/[$,%\s]/g, ""));
    setDraft(null);
    if (v !== null && !Number.isFinite(v)) return;
    if (v !== value) onSave(v);
  };
  return (
    <input value={shown} placeholder={placeholder} aria-label={label} inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onFocus={() => setFocus(true)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null); }}
      className="rounded text-right outline-none"
      style={{ width: width ?? (suffix ? 52 : 76), height: 26, padding: "0 5px", fontSize: F.sm, ...nums,
        border: `1px solid ${focus ? T.chalk : warn ? T.hiviz : "transparent"}`, background: focus ? T.card : warn ? T.hivizDim : "transparent" }} />
  );
}
