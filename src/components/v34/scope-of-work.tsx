"use client";
/**
 * A section's scope of work as bullets (Coy, 2026-10-10) — the same list on the budget's section card and
 * under the area on the draft proposal, saved to the section (src/lib/scope-of-work.ts). Enter starts the
 * next bullet, Backspace on an empty one removes it; it saves when a bullet is left.
 */
import { useEffect, useRef, useState } from "react";
import { sowLines, sowText, SOW_MAX_LINES, SOW_MAX_LINE } from "@/lib/scope-of-work";

export function ScopeBullets({ value, onSave, readOnly = false, color, muted, border, fontSize = 13, placeholder = "What's included — one line each" }: {
  value: string | null;
  onSave?: (text: string | null) => void;
  readOnly?: boolean;
  color: string; muted: string; border: string;
  fontSize?: number;
  placeholder?: string;
}) {
  const [lines, setLines] = useState<string[]>(() => sowLines(value));
  const saved = useRef(sowText(sowLines(value)));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusAt = useRef<number | null>(null);

  // A save elsewhere (the other page, a reload) comes back as a new value.
  useEffect(() => {
    const t = sowText(sowLines(value));
    if (t !== saved.current) { saved.current = t; setLines(sowLines(value)); }
  }, [value]);
  useEffect(() => {
    if (focusAt.current !== null) { refs.current[focusAt.current]?.focus(); focusAt.current = null; }
  });

  const commit = (next: string[]) => {
    const t = sowText(next);
    if (t === saved.current) return;
    saved.current = t;
    onSave?.(t);
  };
  const bullet = <span aria-hidden="true" style={{ color: muted, lineHeight: 1.5, flex: "0 0 auto" }}>•</span>;

  if (readOnly) {
    if (!lines.length) return null;
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "grid", gap: 2 }}>
        {lines.map((l, i) => <li key={i} className="flex gap-2" style={{ fontSize, color, lineHeight: 1.5 }}>{bullet}<span>{l}</span></li>)}
      </ul>
    );
  }

  const shown = lines.length ? lines : [""];
  return (
    <div style={{ display: "grid", gap: 1 }}>
      {shown.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          {bullet}
          <input ref={(el) => { refs.current[i] = el; }} value={l} maxLength={SOW_MAX_LINE} aria-label={`Scope line ${i + 1}`}
            placeholder={i === 0 && !lines.length ? placeholder : ""}
            onChange={(e) => { const next = [...shown]; next[i] = e.target.value; setLines(next); }}
            onBlur={() => commit(lines)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (shown.length >= SOW_MAX_LINES) return;
                const el = e.currentTarget, at = el.selectionStart ?? l.length;
                const next = [...shown];
                next.splice(i, 1, l.slice(0, at), l.slice(at));
                setLines(next); focusAt.current = i + 1;
              } else if (e.key === "Backspace" && l === "" && shown.length > 1) {
                e.preventDefault();
                const next = shown.filter((_, j) => j !== i);
                setLines(next); commit(next); focusAt.current = Math.max(0, i - 1);
              }
            }}
            className="flex-1 outline-none bg-transparent"
            style={{ minWidth: 0, fontSize, color, lineHeight: 1.5, padding: "1px 2px", borderBottom: `1px dashed ${border}` }} />
        </div>
      ))}
      {lines.length > 0 && lines.length < SOW_MAX_LINES && (
        <button type="button" onClick={() => { setLines([...lines, ""]); focusAt.current = lines.length; }}
          className="sc-no-print text-left" style={{ fontSize: fontSize - 1.5, color: muted, cursor: "pointer", padding: "2px 0 0 14px" }}>
          + Add a line
        </button>
      )}
    </div>
  );
}
