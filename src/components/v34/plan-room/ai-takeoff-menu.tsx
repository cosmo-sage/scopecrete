"use client";
/**
 * AI Takeoff on Takeoffs' toolbar (Coy, 2026-10-15: "Consolidate these find zones/find joints
 * buttons into 1 drop down button that says AI Takeoff"). One button with the emblem; its list
 * holds what Dusty can measure — Find zones, Find joints. A tool that is open shows ✓, and picking
 * it again closes it.
 */
import React, { useEffect, useRef, useState } from "react";
import { T, F, disp } from "@/lib/v34/tokens";
import { Emblem } from "@/components/site/marks";

export type AiItem = { key: string; label: string; hint: string; run: () => void; busy: boolean; active: boolean; ready: boolean };

export function AiTakeoffMenu({ items }: { items: AiItem[] }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const box = useRef<HTMLDivElement>(null);
  const busy = items.some((i) => i.busy);
  const on = items.some((i) => i.active);

  useEffect(() => {
    if (!open) return;
    const shut = () => setOpen(false);
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", shut);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); window.removeEventListener("resize", shut); window.removeEventListener("scroll", shut, true); };
  }, [open]);

  return (
    <div ref={box} style={{ position: "relative", flex: "0 0 auto" }}>
      <button onClick={(e) => {
        // The toolbar scrolls sideways, which would clip a list hung inside it, so it is placed on the screen.
        const r = e.currentTarget.getBoundingClientRect();
        setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
        setOpen((o) => !o);
      }} aria-haspopup="menu" aria-expanded={open} title="AI Takeoff: Dusty measures the sheet for you to check"
        className="flex items-center gap-1.5"
        style={{ height: 30, padding: "0 8px", border: `1px solid ${on ? T.ink : T.hairStrong}`, borderRadius: 3, background: on ? T.dustyTint : T.card, color: T.ink, cursor: "pointer", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
        <Emblem size={16} spin={busy} state={busy ? "thinking" : "idle"} />
        <span className="hidden md:inline">AI Takeoff</span>
        <span aria-hidden="true" style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div role="menu" style={{ position: "fixed", top: at.top, left: at.left, zIndex: 60, width: 260, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,.18)", padding: 4 }}>
          {items.map((i) => (
            <button key={i.key} role="menuitemcheckbox" aria-checked={i.active} disabled={!i.ready || (i.busy && !i.active)}
              onClick={() => { setOpen(false); i.run(); }}
              style={{ display: "flex", gap: 8, width: "100%", textAlign: "left", alignItems: "flex-start", padding: "7px 8px", border: "none", borderRadius: 4, background: i.active ? T.dustyTint : "transparent", color: T.ink, cursor: i.ready ? "pointer" : "default", opacity: i.ready ? 1 : 0.5 }}>
              <span style={{ width: 12, flex: "0 0 auto", fontWeight: 700 }}>{i.active ? "✓" : ""}</span>
              <span style={{ display: "grid", gap: 2 }}>
                <b style={{ fontSize: F.sm }}>{i.label}{i.busy ? " …" : ""}</b>
                <span style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.3 }}>{i.active ? "Open · pick again to close it" : i.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
