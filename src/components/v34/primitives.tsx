"use client";

/**
 * v34 primitives, ported verbatim in behaviour and appearance.
 *
 * Nothing here holds data. Avatar in particular takes whatever label the caller
 * has already decided on — it never reaches for a name of its own. 176 of 197
 * contacts have no name (measured 2026-09-27), and for those the phone number
 * IS the display name.
 */

import React, { useEffect } from "react";
import { T, F, disp, body, eyebrow, nums, clip, STATUS, StatusStyle } from "@/lib/v34/tokens";

/* ------------------------------------------------------------ Badge/Avatar */

export const Badge = ({ s, map = STATUS }: { s: string; map?: Record<string, StatusStyle> }) => {
  const v = map[s] || Object.values(map)[0];
  return (
    <span style={{
      background: v.bg, color: v.fg, fontFamily: disp, fontSize: F.micro, fontWeight: 600,
      letterSpacing: ".1em", textTransform: "uppercase", padding: "3px 6px", borderRadius: 3,
      whiteSpace: "nowrap",
    }}>{v.label}</span>
  );
};

const AVATAR_COLORS = ["#1B5FD9", "#6B4BD6", "#0F8A4F", "#C24A00", "#8A6100", "#0E7C86"];

export const Avatar = ({ label, kind, dim, size = 34 }: {
  label: string; kind?: string | null; dim?: boolean; size?: number;
}) => {
  // A number-only label has no meaningful initial. v34 would have rendered "("
  // from "(225) …"; a neutral glyph is honest, an invented letter is not.
  const trimmed = (label || "").trim();
  const firstAlpha = trimmed.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  const ch = firstAlpha || "#";
  const idx = (trimmed.charCodeAt(0) || 63) % AVATAR_COLORS.length;
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size, height: size, background: dim ? T.hair : AVATAR_COLORS[idx],
        color: dim ? T.ink3 : T.card, fontFamily: disp, fontSize: size * 0.44, fontWeight: 700,
      }}>
      {kind === "vendor" ? "▣" : kind === "sub" ? "⚒" : ch}
    </span>
  );
};

/* -------------------------------------------------------------- form parts */

export const Toggle = ({ on, onChange, label }: {
  on: boolean; onChange: (v: boolean) => void; label?: string;
}) => (
  <button onClick={() => onChange(!on)} aria-pressed={on} className="flex items-center gap-2" style={{ minHeight: 40 }}>
    <span className="relative rounded-full shrink-0" style={{ width: 34, height: 20, background: on ? T.chalk : "#C6CCD3", transition: "background .15s" }}>
      <span className="absolute rounded-full bg-white" style={{ width: 16, height: 16, top: 2, left: 2, transform: on ? "translateX(14px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </span>
    {label && <span style={{ fontSize: F.sm, color: on ? T.ink : T.ink2, whiteSpace: "nowrap" }}>{label}</span>}
  </button>
);

export const Segmented = ({ options, value, onChange, small }: {
  options: [string, string][]; value: string; onChange: (k: string) => void; small?: boolean;
}) => (
  <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, height: small ? 30 : 36 }}>
    {options.map(([k, l]) => (
      <button key={k} onClick={() => onChange(k)} className="flex-1 px-2"
        style={{ background: value === k ? T.ink : T.card, color: value === k ? T.card : T.ink2, fontFamily: disp, fontSize: small ? F.sm : F.md, textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>
        {l}
      </button>
    ))}
  </div>
);

export const NumField = ({ label, value, onChange, suffix }: {
  label: string; value: number | ""; onChange: (v: number | "") => void; suffix?: string;
}) => (
  <label className="block" style={{ minWidth: 0 }}>
    <span style={eyebrow}>{label}</span>
    <div className="flex items-center rounded mt-0.5" style={{ border: `1px solid ${T.hair}`, background: T.card, height: 40 }}>
      <input type="number" inputMode="decimal" value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2"
        style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      {suffix && <span className="pr-2 shrink-0" style={{ fontSize: F.xs, color: T.ink3 }}>{suffix}</span>}
    </div>
  </label>
);

export const TextField = ({ label, value, onChange, placeholder, type = "text", inputMode, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "search" | "url" | "none";
  multiline?: boolean;
}) => (
  <label className="block" style={{ minWidth: 0 }}>
    <span style={eyebrow}>{label}</span>
    {multiline ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full rounded mt-0.5 px-2 py-1.5 outline-none"
        style={{ border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, fontFamily: body, resize: "none", lineHeight: 1.45 }} />
    ) : (
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded mt-0.5 px-2 outline-none"
        style={{ border: `1px solid ${T.hair}`, background: T.card, height: 40, fontSize: F.sm, fontFamily: body, minWidth: 0 }} />
    )}
  </label>
);

export const DimRow = ({ axis, ft, inches, onFt, onIn }: {
  axis: string; ft: number | ""; inches: number | "";
  onFt: (v: number | "") => void; onIn: (v: number | "") => void;
}) => (
  <div className="flex items-center gap-1.5">
    <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: T.ink3, width: 14 }}>{axis}</span>
    <div className="flex items-center rounded flex-1" style={{ border: `1px solid ${T.hair}`, background: T.card, height: 38, minWidth: 0 }}>
      <input type="number" inputMode="decimal" value={ft} onChange={(e) => onFt(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      <span className="pr-1.5 shrink-0" style={{ fontSize: F.micro, color: T.ink3, letterSpacing: ".08em" }}>FT</span>
    </div>
    <div className="flex items-center rounded" style={{ border: `1px solid ${T.hair}`, background: T.card, height: 38, width: 72 }}>
      <input type="number" inputMode="decimal" value={inches} onChange={(e) => onIn(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      <span className="pr-1.5 shrink-0" style={{ fontSize: F.micro, color: T.ink3, letterSpacing: ".08em" }}>IN</span>
    </div>
  </div>
);

/* ----------------------------------------------------------------- NavIcon */

export const NavIcon = ({ k, on, color }: { k: string; on: boolean; color?: string }) => {
  // Drawn in currentColor so a theme (CSS variables) or the rail can colour it.
  const c = "currentColor";
  const box = { width: 19, height: 19, viewBox: "0 0 19 19", style: { color: color ?? (on ? T.ink : T.ink3) } };
  const p = { fill: "none", stroke: c, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "threads") return <svg {...box}><path {...p} d="M2.6 4.4h13.8v8.4H8.9l-4 3v-3H2.6z" /></svg>;
  if (k === "scope") return (
    <svg {...box}>
      <rect {...p} x="2.4" y="5.4" width="14.2" height="8.2" rx="1" />
      <path {...p} d="M2.4 3.1h14.2M3.6 2.1v2M15.4 2.1v2" />
    </svg>
  );
  if (k === "scopebuilder") return (
    <svg {...box}>
      <path {...p} d="M2.6 15.8l3.2-1 9.4-9.4a1.6 1.6 0 0 0-2.2-2.2L3.6 12.6z" />
      <path {...p} d="M11.6 4.6l2.2 2.2M10.4 15.8h6" />
    </svg>
  );
  if (k === "customers") return (
    <svg {...box}>
      <circle {...p} cx="9.5" cy="6.4" r="3" />
      <path {...p} d="M3.6 16.2c.6-3.2 3-5 5.9-5s5.3 1.8 5.9 5" />
    </svg>
  );
  if (k === "contacts") return (
    <svg {...box}>
      <rect {...p} x="3.6" y="2.4" width="11.8" height="14.2" rx="1" />
      <circle {...p} cx="9.5" cy="7.6" r="2" />
      <path {...p} d="M6.3 13.2c.5-1.7 1.7-2.6 3.2-2.6s2.7.9 3.2 2.6M2.2 5.4h2.6M2.2 9.5h2.6M2.2 13.6h2.6" />
    </svg>
  );
  if (k === "pricebook") return (
    <svg {...box}>
      <path {...p} d="M4 2.6h9.6a1 1 0 0 1 1 1v12.8H5a1 1 0 0 1-1-1z" />
      <path {...p} d="M4 14.4a1 1 0 0 1 1-1h9.6M7 6h5M7 8.8h3.4" />
    </svg>
  );
  if (k === "dashboard") return (
    <svg {...box}>
      <path {...p} d="M2.6 13.6a6.9 6.9 0 0 1 13.8 0" />
      <path {...p} d="M9.5 13.6l3.3-4.2M2.6 16.2h13.8" />
    </svg>
  );
  if (k === "toolbox") return (
    <svg {...box}>
      <rect {...p} x="2.2" y="7" width="14.6" height="8.6" rx="1" />
      <path {...p} d="M6.8 7V4.6h5.4V7M2.2 10.6h14.6M8.2 10.6v1.6h2.6v-1.6" />
    </svg>
  );
  if (k === "files" || k === "documents") return (
    <svg {...box}>
      <path {...p} d="M4.4 2.4h6.8l3.4 3.4v10.8H4.4z" />
      <path {...p} d="M11 2.4v3.6h3.6M6.8 9.4h5.4M6.8 12.2h5.4" />
    </svg>
  );
  if (k === "logs") return (
    <svg {...box}>
      <path {...p} d="M6.6 4.6h9.2M6.6 9.5h9.2M6.6 14.4h9.2" />
      <circle cx="3.6" cy="4.6" r="1" fill={c} /><circle cx="3.6" cy="9.5" r="1" fill={c} /><circle cx="3.6" cy="14.4" r="1" fill={c} />
    </svg>
  );
  if (k === "map") return (
    <svg {...box}>
      <path {...p} d="M2.4 4.6l4.4-1.8 5.4 2.2 4.4-1.8v11.6l-4.4 1.8-5.4-2.2-4.4 1.8z" />
      <path {...p} d="M6.8 2.8v11.6M12.2 5v11.6" />
    </svg>
  );
  if (k === "roadmap") return (
    <svg {...box}>
      <path {...p} d="M3 16.4V2.6M3 3.4h9.4l-1.8 2.8 1.8 2.8H3" />
      <path {...p} d="M8.2 13.2l2.4-2.4 2.4 2.4M10.6 10.8v5.6" />
    </svg>
  );
  if (k === "vendors") return (
    <svg {...box}>
      <path {...p} d="M1.8 5.6h9.4v7.6H1.8zM11.2 8h3.2l2.6 2.6v2.6h-5.8" />
      <circle {...p} cx="5" cy="14.4" r="1.5" /><circle {...p} cx="13.8" cy="14.4" r="1.5" />
    </svg>
  );
  if (k === "cash") return <svg {...box}><rect {...p} x="2.4" y="5.1" width="14.2" height="8.8" rx="1.2" /><circle {...p} cx="9.5" cy="9.5" r="2.3" /></svg>;
  if (k === "more") return (
    <svg {...box}>
      {[4.6, 9.5, 14.4].map((x) => <circle key={x} cx={x} cy="9.5" r="1.35" fill={c} />)}
    </svg>
  );
  return null;
};

/* ------------------------------------------------------------------ Drawer */

export function Drawer({ open, onClose, title, sub, right, children, hideClose, full, below, wide, left }: {
  open: boolean; onClose: () => void; title: string; sub?: string;
  right?: React.ReactNode; children: React.ReactNode;
  hideClose?: boolean; full?: boolean; below?: boolean; wide?: boolean;
  /** Comes in from the left, where its ☰ is (Coy, 2026-10-09: folders). */
  left?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    /* Three shapes, one component. full: fills the width under the header.
       below: still a side drawer, but it starts under the header assembly
       so the stream and the burger are never covered. Default: covers all.
       wide: covers all like the default (over the phone footer too), but as
       wide as the work needs — a table to check before saving. */
    // sc-drawer: on a desktop with Dusty docked it opens in the page beside
    // him, between the rail and his column — never under him (Coy, 2026-10-01).
    <div className={`fixed left-0 right-0 bottom-0 sc-drawer ${full ? "z-30" : "z-50"}`}
      style={{ top: full || below ? "var(--sc-head)" : 0, background: full ? "transparent" : "rgba(18,22,26,.44)" }}
      onClick={full ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}
        className={`absolute top-0 bottom-0 flex flex-col ${full ? "left-0 right-0" : left ? "left-0 sc-drawer-in-left" : "right-0 sc-drawer-in-right"}`}
        style={{ width: full ? "auto" : wide ? "min(1180px, 100%)" : "min(408px, 90%)", background: T.card,
                 boxShadow: full ? "none" : left ? "14px 0 40px rgba(10,14,18,.22)" : "-14px 0 40px rgba(10,14,18,.22)" }}>

        <div className="sticky top-0 z-10 shrink-0 px-4 flex items-center gap-3"
          style={{ minHeight: 54, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* A long title is set smaller on a phone so it fits its line (Coy, 2026-10-07: "Build a new draft budget"). */}
            <div className={title.length > 18 ? "sc-drawer-title-long" : undefined} style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, ...clip }}>{title}</div>
            {sub && <div style={{ ...eyebrow, marginTop: 1, ...clip }}>{sub}</div>}
          </div>
          {right}
          {hideClose ? (
            <span className="shrink-0" style={{ width: 32, height: 32 }} aria-hidden="true" />
          ) : (
            <button onClick={onClose} aria-label="Close"
              className="shrink-0 rounded-lg flex items-center justify-center"
              style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card }}>
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <path d="M1 1 L12 12 M12 1 L1 12" stroke="currentColor" style={{ color: T.ink }} strokeWidth="1.8" strokeLinecap="square" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Kept as `Sheet` so the panels that already used it don't change. */
export function Sheet({ open, onClose, title, sub, children, below }: {
  open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode; below?: boolean;
}) {
  return <Drawer open={open} onClose={onClose} title={title} sub={sub} below={below}>{children}</Drawer>;
}

/* -------------------------------------------------------------- EmptyState */

/**
 * The honest empty state. Rule 8: a screen either shows real data or says
 * plainly that it has none. This holds the layout so the flow stays walkable
 * without a single fabricated number.
 */
export function EmptyState({ title, detail, tone = "quiet" }: {
  title: string; detail?: string; tone?: "quiet" | "warn";
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div style={{
        width: 34, height: 34, borderRadius: 17,
        border: `1.5px solid ${tone === "warn" ? T.hiviz : T.hair}`,
      }} />
      <p className="mt-3" style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, color: T.ink }}>{title}</p>
      {detail && (
        <p className="mt-1" style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5, maxWidth: 300 }}>{detail}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ SlideDrawer */

/**
 * A panel that slides over the page from the left, phone only (Claude Design,
 * phone_drawers handoff, 2026-10-03). It lives inside the page body: the parent
 * must be `position: relative; overflow: hidden`. Scrim and Esc close it; a
 * drag left on the panel closes it, a drag right from the left 16px opens it;
 * the optional pull tab sticks out of the right edge so a closed drawer can be
 * grabbed. Reduced motion: no slide.
 */
export function SlideDrawer({ open, onOpen, onClose, width, label, tab, children }: {
  open: boolean; onOpen?: () => void; onClose: () => void; width: number; label: string; tab?: boolean; children: React.ReactNode;
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; t: number; dx: number } | null>(null);
  const [dx, setDx] = React.useState(0);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  const ease = "transform .28s cubic-bezier(.2,.8,.2,1)";
  const start = (e: React.TouchEvent) => { drag.current = { x: e.touches[0].clientX, t: Date.now(), dx: 0 }; };
  const move = (e: React.TouchEvent) => {
    if (!drag.current) return;
    const d = e.touches[0].clientX - drag.current.x;
    drag.current.dx = d;
    if (open) setDx(Math.min(0, d)); else setDx(Math.max(0, Math.min(width, d)));
  };
  const end = () => {
    const g = drag.current; drag.current = null; setDx(0);
    if (!g) return;
    const v = Math.abs(g.dx) / Math.max(1, Date.now() - g.t);
    if (open && (g.dx < -width * 0.3 || (g.dx < 0 && v > 0.4))) onClose();
    if (!open && (g.dx > width * 0.3 || (g.dx > 0 && v > 0.4))) onOpen?.();
  };
  const x = open ? dx : -width + dx;
  return (
    <>
      {!open && onOpen && <div aria-hidden="true" onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 16, zIndex: 6 }} />}
      <div aria-hidden="true" onClick={onClose} className="sc-slide-scrim"
        style={{ position: "absolute", inset: 0, zIndex: 7, background: "rgba(20,20,20,.36)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .28s" }} />
      <div ref={panel} role="dialog" aria-label={label} aria-hidden={!open} tabIndex={-1} onTouchStart={start} onTouchMove={move} onTouchEnd={end} className="sc-slide-panel"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width, zIndex: 8, background: T.card, borderRight: `1px solid ${T.hair}`,
          boxShadow: open ? "8px 0 24px rgba(0,0,0,.14)" : "none", transform: `translateX(${x}px)`, transition: dx ? "none" : ease, outline: "none" }}>
        <div style={{ height: "100%", overflowY: "auto", visibility: open || dx ? "visible" : "hidden" }}>{children}</div>
        {tab && (
          <button type="button" onClick={open ? onClose : onOpen} aria-label={open ? `Close ${label}` : `Open ${label}`}
            style={{ position: "absolute", right: -28, top: "42%", width: 28, height: 72, background: T.card, border: `1px solid ${T.hair}`, borderLeft: "none",
              borderRadius: "0 6px 6px 0", boxShadow: "6px 0 12px rgba(0,0,0,.08)", color: T.ink2, fontSize: 16, cursor: "pointer" }}>{open ? "‹" : "›"}</button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------- page header: ☰ and 🔍 */

/** The ☰ that opens a page's side panel, on the left of its title row — the
 *  same button everywhere (Coy, 2026-10-06: "use the same left slide panel
 *  hamburger menu button … consistent on the left … in line with the page
 *  header"). Phone only unless `always`. */
export function MenuButton({ onClick, label, always }: { onClick: () => void; label: string; always?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`${always ? "flex" : "lg:hidden flex"} sc-menu-btn shrink-0 items-center justify-center rounded`}
      style={{ width: 40, height: 40, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer" }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
    </button>
  );
}

/** The search icon in a page's title row; it opens SearchBubble under the row
 *  (Coy, 2026-10-06: "the same search icon and search bubble consistently
 *  across every page where search is present"). Threads' list set the look. */
export function SearchToggle({ open, onToggle, label = "Search" }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-label={label} aria-pressed={open} title={label}
      className="shrink-0 flex items-center justify-center rounded"
      style={{ width: 26, height: 26, border: `1px solid ${open ? T.hiviz : T.hairStrong}`, background: open ? T.hivizDim : T.card, cursor: "pointer" }}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke={open ? T.hiviz : T.ink2} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
    </button>
  );
}

/** The search bubble: a full-width pill with × to clear; Esc clears and closes. */
export function SearchBubble({ value, onChange, onClose, placeholder, autoFocus = true }: {
  value: string; onChange: (v: string) => void; onClose?: () => void; placeholder: string; autoFocus?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full" style={{ height: 34, border: `1px solid ${T.hairStrong}`, padding: "0 6px 0 12px", background: T.slab, width: "100%" }}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke={T.ink3} strokeWidth="1.8" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { onChange(""); onClose?.(); } }}
        placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: F.sm }} />
      {value && <button type="button" onClick={() => onChange("")} aria-label="Clear" className="rounded-full" style={{ width: 24, height: 24, color: T.ink2, cursor: "pointer" }}>×</button>}
    </label>
  );
}

/* ------------------------------------------------- the page's subheader */

/** Every main-menu page opens with the same band under the dashboard header
 *  (Coy, 2026-10-06: "the logs page has a defined sub header. Each of the
 *  different pages on the main menu need a consistent subheader"): a white
 *  band the full width of the page, the title (with ☰ before it on a phone
 *  and a count after it), the page's buttons on the right, one line saying
 *  what the page is for, then the page's own search or filter rows. It stays
 *  at the top while the page scrolls under it (.sc-subhead). `width` lines it
 *  up with the page's centred content. */
// The org's name, set once by the dashboard layout, for the page headers.
export const OrgNameContext = React.createContext<string | null>(null);

// The page's one-line description behind an ⓘ beside its title (Coy,
// 2026-10-06: "this line … can be an 'i' icon next to jobs").
export function InfoTip({ text, label = "About this page" }: { text: React.ReactNode; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex" style={{ verticalAlign: "middle" }}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}
        title={typeof text === "string" ? text : undefined}
        className="inline-flex items-center justify-center rounded-full"
        style={{ width: 16, height: 16, border: `1px solid ${T.ink3}`, color: T.ink3, fontFamily: body, fontSize: 10, fontWeight: 700, lineHeight: 1, background: "transparent", cursor: "pointer", fontStyle: "italic" }}>
        i
      </button>
      {open && (
        <span role="note" className="absolute z-30 rounded"
          style={{ top: "calc(100% + 6px)", left: -8, width: 260, maxWidth: "80vw", padding: "8px 10px", background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 6px 18px rgba(0,0,0,.12)", color: T.ink2, fontFamily: body, fontSize: 12, fontWeight: 400, lineHeight: 1.4, textTransform: "none", letterSpacing: 0 }}>
          {text}
        </span>
      )}
    </span>
  );
}

export function PageHeader({ title, count, sub, menu, actions, children, width }: {
  title: React.ReactNode; count?: React.ReactNode; sub?: React.ReactNode; menu?: React.ReactNode;
  actions?: React.ReactNode; children?: React.ReactNode; width?: number;
}) {
  // Its height, for anything else on the page that sticks below it (Files'
  // folder column): --sc-subhead.
  const ref = React.useRef<HTMLDivElement>(null);
  const org = React.useContext(OrgNameContext);
  useEffect(() => {
    const el = ref.current, root = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => root.style.setProperty("--sc-subhead", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--sc-subhead"); };
  }, []);
  // The org's name on top, a little bigger; the page's name small under it,
  // its description behind ⓘ (Coy, 2026-10-06).
  return (
    <div ref={ref} className="sc-subhead">
      <div className="mx-auto" style={{ maxWidth: width }}>
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {menu}
          <div className="sc-subhead-names" style={{ minWidth: 0, flexShrink: 1 }}>
            {org && <div className="sc-subhead-org" style={{ fontFamily: disp, fontWeight: 600, lineHeight: 1.1, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org}</div>}
            {org && <span className="sc-subhead-sep" aria-hidden="true">|</span>}
            <h1 className="sc-subhead-title flex items-center gap-1.5" style={{ fontFamily: disp, fontWeight: 600, margin: 0, lineHeight: 1.15, color: org ? T.ink2 : T.ink, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
              <span>{title}</span>
              {count != null && count !== "" && <span className="sc-subhead-count" style={{ ...nums, fontWeight: 500, color: T.ink3, letterSpacing: 0 }}>{count}</span>}
              {sub && <InfoTip text={sub} />}
            </h1>
          </div>
          <span style={{ flex: 1 }} />
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
