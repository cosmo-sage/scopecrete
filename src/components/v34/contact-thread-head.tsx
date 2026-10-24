"use client";

import { useDismiss } from "@/lib/v34/use-dismiss";
import { READ_FONT_VARS } from "@/components/v34/read-fonts";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Phone, Envelope, NotePencil, Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import { T, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { initials, initialsHue } from "@/lib/v34/threads";
import { formatPhone } from "@/components/v34/conversation";
import {
  READ_BGS, READ_FONTS, READ_SIZES, READ_DEFAULT, cleanReading, filterTitle, searchPlaceholder, toggleFilter,
  type CtFilter, type Reading,
} from "@/lib/v34/contact-thread";

/**
 * The contact thread's header under Spaces (Claude Design "Contact Thread", 2026-10-23,
 * /mnt/project-files/navigation/contact-thread-design/): a round badge, the name, "Customer: Acme GC",
 * then Search · Notes · Phone ▾ · Email ▾ · ⋯ as round icon buttons. Phone and Email drop down a pill
 * with Call / New email and a funnel that filters the timeline to that channel.
 */

/** Whether the Spaces navigation is on (<html data-nav="spaces">), kept in step as Settings switches it. */
function subscribeNav(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-nav"] });
  return () => mo.disconnect();
}
export function useSpacesNav(): boolean {
  return useSyncExternalStore(subscribeNav, () => document.documentElement.dataset.nav === "spaces", () => false);
}

const READ_KEY = "sc:thread-read";
const readListeners = new Set<() => void>();
let readCache: Reading | null = null;
function getReading(): Reading {
  if (readCache) return readCache;
  try { readCache = cleanReading(JSON.parse(localStorage.getItem(READ_KEY) || "null")); } catch { readCache = READ_DEFAULT; }
  return readCache;
}
/** Text size, background and font for every thread, kept on this device. */
export function useReading(): [Reading, (patch: Partial<Reading>) => void] {
  const r = useSyncExternalStore(
    (cb) => { readListeners.add(cb); return () => { readListeners.delete(cb); }; },
    getReading, () => READ_DEFAULT,
  );
  const set = (patch: Partial<Reading>) => {
    readCache = cleanReading({ ...getReading(), ...patch });
    try { localStorage.setItem(READ_KEY, JSON.stringify(readCache)); } catch { /* private window: this visit only */ }
    readListeners.forEach((f) => f());
  };
  return [r, set];
}

const round = (on = false, fill?: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  border: "none", cursor: "pointer", color: fill ? "#fff" : T.ink2,
  background: fill ?? (on ? `color-mix(in srgb, ${T.hiviz} 16%, transparent)` : "transparent"),
});

function Popover({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 z-30 flex flex-col" style={{ top: 42, background: T.card, borderRadius: 18, padding: 4, minWidth: 210, boxShadow: "0 10px 28px rgba(0,0,0,.18)" }}>
      {children}
    </div>
  );
}

const pillAction: React.CSSProperties = { fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.ink, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap" };

export interface HeadProps {
  name: string | null;
  phone: string | null;
  loading: boolean;
  cardHref: string;
  org: { href: string; label: string; kind: string } | null;
  phones: Array<{ value: string; label: string }>;
  emails: string[];
  newEmailHref: string;
  /** Opens the one email drafter under this header; without it New email is a link to the email page. */
  onNewEmail?: () => void;
  filter: CtFilter;
  onFilter: (f: CtFilter) => void;
  notesOpen: boolean;
  onNotes: () => void;
  nNotes: number;
  searching: boolean;
  onSearch: () => void;
  /** What goes under the reading settings in ⋯: Contact details, All notes, Where things stand, the rest. */
  menu: (close: () => void) => React.ReactNode;
}

export function ContactThreadHead(p: HeadProps) {
  const [open, setOpen] = useState<null | "phone" | "email" | "more">(null);
  const moreBox = useDismiss(open === "more", () => setOpen(null));
  const close = () => setOpen(null);
  const [reading, setReading] = useReading();
  const hue = initialsHue(p.name) ?? T.ink3;
  const title = p.name || formatPhone(p.phone);
  const funnel = (kind: "phone" | "email") => {
    const on = p.filter === kind;
    const c = kind === "phone" ? T.green : T.chalk;
    return (
      <button onClick={() => { p.onFilter(toggleFilter(p.filter, kind)); close(); }} aria-pressed={on}
        aria-label={on ? "Show everything" : `Only ${kind === "phone" ? "calls & texts" : "email"}`} title={on ? "Show everything" : `Only ${kind === "phone" ? "calls & texts" : "email"}`}
        style={{ ...round(false, on ? c : undefined), border: on ? "none" : `1px solid ${T.hairStrong}`, color: on ? "#fff" : T.ink2 }}>
        <Funnel size={16} weight={on ? "fill" : "regular"} />
      </button>
    );
  };
  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${on ? T.hiviz : T.hairStrong}`,
    background: on ? T.hivizDim : T.card, color: T.ink, cursor: "pointer", fontSize: 12.5, padding: "0 6px", whiteSpace: "nowrap" });
  return (
    <div className="flex-shrink-0 flex items-center gap-2.5" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "10px 12px 10px 16px" }}>
      <span aria-hidden className="shrink-0 flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 999, background: `color-mix(in srgb, ${hue} 12%, transparent)`, color: `color-mix(in srgb, ${hue} 80%, ${T.ink})`,
          fontFamily: "var(--sc-font-strong)", fontWeight: 700, fontSize: 13 }}>{p.name ? initials(p.name) : "#"}</span>
      <div className="min-w-0 flex-1 flex flex-col lg:flex-row lg:items-center lg:gap-2.5">
        <Link href={p.cardHref} title="Their contact page" className="min-w-0"
          style={{ fontFamily: "var(--sc-font-strong)", fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textDecoration: "underline", textDecorationColor: T.hair, textUnderlineOffset: 4 }}>
          <span className="text-[16px] lg:text-[18px]">{title}</span>
        </Link>
        {!p.loading && p.org && p.org.label !== p.name && (<>
          <span aria-hidden className="hidden lg:block" style={{ width: 1, height: 16, background: T.hairStrong }} />
          <span className="min-w-0 text-[12px] lg:text-[13px]" style={{ color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.org.kind}: <Link href={p.org.href} style={{ color: T.chalk, fontWeight: 600 }}>{p.org.label}</Link>
          </span>
        </>)}
      </div>
      <div className="flex items-center gap-0.5 lg:gap-1">
        <button onClick={p.onSearch} aria-pressed={p.searching} aria-label="Search this thread" title="Search" style={round(p.searching)}><MagnifyingGlass size={18} /></button>
        <button onClick={p.onNotes} aria-pressed={p.notesOpen} aria-label={`Internal notes${p.nNotes ? ` (${p.nNotes})` : ""}`} title="Internal notes"
          className="hidden lg:inline-flex" style={{ ...round(p.notesOpen), position: "relative" }}>
          <NotePencil size={18} />
          {p.nNotes > 0 && <span style={{ position: "absolute", top: 3, right: 2, fontSize: 9.5, fontWeight: 700, color: T.ink3, ...nums }}>{p.nNotes}</span>}
        </button>
        <div className="relative">
          <button onClick={() => setOpen((o) => (o === "phone" ? null : "phone"))} aria-expanded={open === "phone"} aria-label="Phone" title="Phone"
            style={round(false, p.filter === "phone" ? T.green : undefined)}><Phone size={18} weight={p.filter === "phone" ? "fill" : "regular"} /></button>
          {open === "phone" && (
            <Popover onClose={close}>
              <div className="flex items-center gap-1">
                <div className="flex-1 flex flex-col">
                  {p.phones.length ? p.phones.map((n) => (
                    <a key={n.value} href={`tel:${n.value}`} onClick={close} style={pillAction}>
                      <Phone size={14} weight="fill" color={T.green} />Call<span style={{ fontFamily: "inherit", textTransform: "none", fontWeight: 500, color: T.ink3, letterSpacing: 0, ...nums }}>{formatPhone(n.value)} {n.label}</span>
                    </a>
                  )) : <span style={{ ...pillAction, color: T.ink3 }}>No number on file</span>}
                </div>
                <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: T.hair, margin: "6px 2px" }} />
                {funnel("phone")}
              </div>
            </Popover>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setOpen((o) => (o === "email" ? null : "email"))} aria-expanded={open === "email"} aria-label="Email" title="Email"
            style={round(false, p.filter === "email" ? T.chalk : undefined)}><Envelope size={18} weight={p.filter === "email" ? "fill" : "regular"} /></button>
          {open === "email" && (
            <Popover onClose={close}>
              <div className="flex items-center gap-1">
                {p.onNewEmail
                  ? <button onClick={() => { close(); p.onNewEmail?.(); }} className="flex-1" style={{ ...pillAction, background: "none", border: "none", cursor: "pointer" }}><Envelope size={14} color={T.chalk} />New email</button>
                  : <Link href={p.newEmailHref} onClick={close} className="flex-1" style={pillAction}><Envelope size={14} color={T.chalk} />New email</Link>}
                <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: T.hair, margin: "6px 2px" }} />
                {funnel("email")}
              </div>
            </Popover>
          )}
        </div>
        <div className="relative" ref={moreBox}>
          <button onClick={() => setOpen((o) => (o === "more" ? null : "more"))} aria-expanded={open === "more"} aria-label="More" title="More" style={round(open === "more")}>
            <span style={{ fontSize: 18, lineHeight: 1, letterSpacing: 1 }}>⋯</span>
          </button>
          {open === "more" && (
            <div className="absolute right-0 z-30 flex flex-col" style={{ top: 42, width: 280, maxHeight: "70vh", overflowY: "auto", background: T.card, borderRadius: 12, border: `1px solid ${T.hair}`, boxShadow: "0 10px 28px rgba(0,0,0,.18)", padding: "8px 0" }}>
              <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Text size</span>
              <div className="flex gap-1 px-3 pt-1 pb-2" role="radiogroup" aria-label="Text size">
                {READ_SIZES.map((s) => (
                  <button key={s.key} role="radio" aria-checked={reading.size === s.key} onClick={() => setReading({ size: s.key })}
                    style={{ ...seg(reading.size === s.key), fontFamily: disp, fontWeight: 600, fontSize: Math.round(12 * s.z) }}>{s.label}</button>
                ))}
              </div>
              <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Background</span>
              <div className="grid grid-cols-3 gap-1 px-3 pt-1 pb-2" role="radiogroup" aria-label="Background">
                {READ_BGS.map((b) => (
                  <button key={b.key} role="radio" aria-checked={reading.bg === b.key} onClick={() => setReading({ bg: b.key })}
                    style={{ ...seg(reading.bg === b.key), height: 44, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "0 6px 4px",
                      fontSize: 11, background: `${b.css === "none" ? "" : `${b.css}, `}${reading.bg === b.key ? T.hivizDim : T.card}` }}>{b.label}</button>
                ))}
              </div>
              <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Font</span>
              <div className={`grid grid-cols-2 gap-1 px-3 pt-1 ${READ_FONT_VARS}`} role="radiogroup" aria-label="Font">
                {READ_FONTS.map((f) => (
                  <button key={f.key} role="radio" aria-checked={reading.font === f.key} onClick={() => setReading({ font: f.key })}
                    style={{ ...seg(reading.font === f.key), fontFamily: f.css, fontSize: 13.5 }}>{f.label}</button>
                ))}
              </div>
              <span className="px-3 pt-1.5 pb-2" style={{ fontSize: 11.5, color: T.ink3 }}>Applies to every thread on this device.</span>
              <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, paddingTop: 4 }}>{p.menu(close)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Under the header while a channel filter is on: what is shown, its numbers or address, the action, Show all. */
export function FilterBar({ filter, count, sub, action, onAll }: { filter: CtFilter; count: number; sub: string; action: React.ReactNode; onAll: () => void }) {
  if (filter === "all") return null;
  return (
    <div className="flex-shrink-0 flex items-center gap-3" style={{ background: T.slab, borderTop: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hairSoft}`, padding: "7px 16px" }}>
      <span className="min-w-0 flex-1 flex flex-col">
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, ...nums }}>{filterTitle(filter)} · {count}</span>
        {sub && <span style={{ fontSize: 11.5, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...nums }}>{sub}</span>}
      </span>
      {action}
      <button onClick={onAll} style={{ fontSize: 12.5, fontWeight: 600, color: T.chalk, cursor: "pointer", background: "none", border: "none" }}>Show all</button>
    </div>
  );
}

/** The search pill: scoped to the filter, "N matches", Done; Esc closes and clears. */
export function SearchPill({ filter, q, onQ, count, onDone }: { filter: CtFilter; q: string; onQ: (q: string) => void; count: number; onDone: () => void }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2" style={{ background: T.card, borderBottom: `1px solid ${T.hairSoft}`, padding: "8px 16px" }}>
      <label className="flex-1 min-w-0 flex items-center gap-2" style={{ height: 36, borderRadius: 999, border: `1.5px solid ${T.chalk}`, padding: "0 12px", background: T.card }}>
        <MagnifyingGlass size={16} color={T.chalk} />
        <input autoFocus value={q} onChange={(e) => onQ(e.target.value)} placeholder={searchPlaceholder(filter)} aria-label={searchPlaceholder(filter)}
          onKeyDown={(e) => { if (e.key === "Escape") { onQ(""); onDone(); } }}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 16, color: T.ink }} />
        {q && <button onClick={() => onQ("")} aria-label="Clear" style={{ color: T.ink3, background: "none", border: "none", cursor: "pointer" }}><X size={14} /></button>}
      </label>
      {q.trim() && <span style={{ fontSize: 12, color: T.ink3, whiteSpace: "nowrap", ...nums }}>{count} match{count === 1 ? "" : "es"}</span>}
      <button onClick={() => { onQ(""); onDone(); }} style={{ fontSize: 12.5, fontWeight: 600, color: T.chalk, cursor: "pointer", background: "none", border: "none" }}>Done</button>
    </div>
  );
}
