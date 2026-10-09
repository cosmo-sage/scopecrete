"use client";

/**
 * The Dashboard (Coy, 2026-09-30) — where the app lands. "Customizable and
 * will evolve over time": a grid of tiles, each one real rows from
 * /api/dashboard/home, each a door to the page behind it. A tile with
 * nothing behind it shows "—" and says why; it never shows a 0 or a $ that
 * was not counted. **Edit** shows, hides and orders tiles; the choice is
 * saved to Coy's account (usePref "home", migration 053).
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { PageHeader } from "@/components/v34/primitives";

interface Tile { value: string | null; detail: string; href: string; tone?: "good" | "bad" }

export const TILES: Array<{ k: string; label: string }> = [
  { k: "calls", label: "Calls today" },
  { k: "leads", label: "New leads" },
  { k: "bids", label: "Bids due" },
  { k: "wip", label: "Won & in progress" },
  { k: "next", label: "Coming up" },
  { k: "quoted", label: "Quoted" },
  { k: "runway", label: "Work runway" },
  { k: "cash", label: "Cash this month" },
  { k: "profit", label: "Profit this month" },
];
const KNOWN = new Set(TILES.map((t) => t.k));
const LABEL = new Map(TILES.map((t) => [t.k, t.label]));
interface HomePrefs { order: string[]; hidden: string[] }
const DEFAULT: HomePrefs = { order: TILES.map((t) => t.k), hidden: [] };

/** Keep saved choices honest when tiles are added or retired. */
function clean(p: HomePrefs): HomePrefs {
  const order = (Array.isArray(p?.order) ? p.order : []).filter((k) => KNOWN.has(k));
  for (const t of TILES) if (!order.includes(t.k)) order.push(t.k);
  return { order: [...new Set(order)], hidden: (Array.isArray(p?.hidden) ? p.hidden : []).filter((k) => KNOWN.has(k)) };
}

export function Home() {
  const [raw, setRaw] = usePref<HomePrefs>("home", DEFAULT);
  const prefs = clean(raw);
  const [tiles, setTiles] = useState<Record<string, Tile> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    let off = false;
    fetch("/api/dashboard/home")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setTiles(b.tiles as Record<string, Tile>); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);

  const move = (k: string, d: -1 | 1) => {
    const o = [...prefs.order];
    const i = o.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setRaw({ ...prefs, order: o });
  };
  const toggle = (k: string) => setRaw({ ...prefs, hidden: prefs.hidden.includes(k) ? prefs.hidden.filter((x) => x !== k) : [...prefs.hidden, k] });
  const shown = edit ? prefs.order : prefs.order.filter((k) => !prefs.hidden.includes(k));
  const btn: React.CSSProperties = { width: 26, height: 26, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, cursor: "pointer", fontSize: 12, lineHeight: 1 };

  return (
    <>
    <PageHeader title="Dashboard" width={1076} sub="How the business stands today — calls, leads, jobs and cash at a glance."
      actions={<button onClick={() => setEdit((e) => !e)} aria-pressed={edit}
          style={{ ...eyebrow, color: edit ? T.card : T.chalk, background: edit ? T.chalk : "transparent", border: `1px solid ${T.chalk}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
          {edit ? "Done" : "Edit"}
        </button>} />
    <div className="mx-auto" style={{ maxWidth: 1100, padding: "0 12px 24px" }}>
      {edit && <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 8 }}>Tick the tiles to show and order them with ▲ ▼. Saved to your account.</div>}
      {error && <div role="alert" style={{ fontSize: F.sm, color: T.red, marginBottom: 8 }}>Couldn&apos;t load the dashboard: {error}</div>}
      {!edit && shown.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>Every tile is hidden. Tap Edit to show some.</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        {shown.map((k, i) => {
          const t = tiles?.[k];
          const hidden = prefs.hidden.includes(k);
          const inner = (
            <div className="rounded h-full" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "10px 12px", opacity: edit && hidden ? 0.45 : 1, minHeight: 96 }}>
              <div className="flex items-center gap-1">
                <span style={{ ...eyebrow, flex: 1 }}>{LABEL.get(k)}</span>
                {edit && (
                  <>
                    <input type="checkbox" checked={!hidden} onChange={() => toggle(k)} aria-label={`Show ${LABEL.get(k)}`} style={{ width: 15, height: 15, accentColor: T.chalk }} />
                    <button onClick={() => move(k, -1)} disabled={i === 0} aria-label={`Move ${LABEL.get(k)} earlier`} style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}>▲</button>
                    <button onClick={() => move(k, 1)} disabled={i === shown.length - 1} aria-label={`Move ${LABEL.get(k)} later`} style={{ ...btn, opacity: i === shown.length - 1 ? 0.35 : 1 }}>▼</button>
                  </>
                )}
              </div>
              {!tiles && !error
                ? <div className="rounded animate-pulse" style={{ height: 30, marginTop: 8, background: T.hairSoft }} />
                : <div style={{ fontFamily: disp, fontSize: F.xxl, fontWeight: 700, lineHeight: 1.1, marginTop: 4, ...nums,
                    color: t?.value == null ? T.ink3 : t.tone === "bad" ? T.red : t.tone === "good" ? T.green : T.ink }}>
                    {t?.value ?? "—"}
                  </div>}
              {t && <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.35, marginTop: 2 }}>{t.detail}</div>}
            </div>
          );
          return edit || !t ? <div key={k}>{inner}</div>
            : <Link key={k} href={t.href} className="no-underline" style={{ color: T.ink }}>{inner}</Link>;
        })}
      </div>
    </div>
    </>
  );
}
