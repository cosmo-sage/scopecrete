"use client";

/**
 * Logs → Price book (Coy, 2026-10-07): every import, with Undo — the line that
 * used to sit under the Price book's title — and every price change the
 * database recorded, newest first. `/api/price-book/changes`.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, nums, clip } from "@/lib/v34/tokens";

interface Imp {
  id: string; kind: string; file_name: string | null; created_count: number; updated_count: number;
  unchanged_count: number; skipped_count: number; created_at: string; undone_at: string | null;
}
interface Price { id: string; item_id: string; item: string | null; unit: string | null; unit_cost: number | null; price_source: string | null; at: string; from: string | null; vendor: string | null }

const SOURCE: Record<string, string> = { typed: "typed", quote: "a quote", receipt: "a receipt", invoice: "an invoice", import: "an import" };
const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PriceBookLog() {
  const [data, setData] = useState<{ imports: Imp[]; prices: Price[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/price-book/changes")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => setData(b)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const undo = async (i: Imp) => {
    if (!window.confirm(`Undo the import of ${i.file_name ?? "that file"}? Cards it added are taken out of the catalog; prices it changed go back, unless you've changed them since.`)) return;
    try {
      const r = await fetch(`/api/price-book/import/${i.id}/undo`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setNote(`Undone: ${b.retired} card${b.retired === 1 ? "" : "s"} taken out, ${b.restored} price${b.restored === 1 ? "" : "s"} put back${b.kept ? `, ${b.kept} kept because you changed them since` : ""}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { load(); }
  };

  const section = (title: string, children: React.ReactNode) => (
    <section className="mx-3 mt-3 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      <div className="px-3 py-2" style={{ ...eyebrow, color: T.ink, borderBottom: `1px solid ${T.hairSoft}` }}>{title}</div>
      {children}
    </section>
  );

  return (
    <div className="mx-auto" style={{ maxWidth: 900, paddingBottom: 24 }}>
      {err && <div className="px-4 py-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
      {note && <div className="mx-3 mt-3 rounded px-3 py-2 flex items-center gap-2" style={{ fontSize: F.sm, background: T.greenDim, color: T.ink }}>
        <span className="flex-1">{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer" }}>×</button></div>}
      {!data && !err && <div className="p-3"><div className="rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} /></div>}
      {data && section("Imports",
        data.imports.length === 0
          ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing imported yet.</div>
          : data.imports.map((i, n) => (
            <div key={i.id} className="flex items-center gap-2 flex-wrap px-3 py-2" style={{ borderTop: n ? `1px solid ${T.hairSoft}` : "none", fontSize: F.sm }}>
              <span style={{ fontWeight: 600, color: T.ink, flex: 1, minWidth: 160, ...clip }}>{i.file_name ?? i.kind}</span>
              <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>
                {when(i.created_at)} · {i.created_count} new · {i.updated_count} changed{i.skipped_count ? ` · ${i.skipped_count} skipped` : ""}
              </span>
              {i.undone_at ? <span style={{ ...eyebrow, color: T.ink3 }}>Undone</span>
                : <button onClick={() => void undo(i)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Undo</button>}
            </div>
          )))}
      {data && section("Price changes",
        data.prices.length === 0
          ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>No prices recorded yet.</div>
          : data.prices.map((p, n) => (
            <Link key={p.id} href="/dashboard/price-book" className="flex items-baseline gap-2 px-3 py-1.5 no-underline"
              style={{ borderTop: n ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
              <span style={{ fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>
                {p.item ?? "An item"}{p.vendor ? <span style={{ color: T.ink3 }}> · {p.vendor}</span> : null}
              </span>
              <span style={{ fontSize: F.sm, fontWeight: 600, ...nums }}>{money(p.unit_cost)}{p.unit ? <span style={{ fontWeight: 400, color: T.ink3 }}>/{p.unit}</span> : null}</span>
              <span style={{ fontSize: F.xs, color: T.ink3, width: 230, textAlign: "right", ...clip }} className="hidden sm:inline">
                {p.from ? `from ${p.from}` : p.price_source ? `from ${SOURCE[p.price_source] ?? p.price_source}` : ""} · {when(p.at)}
              </span>
            </Link>
          )))}
    </div>
  );
}
