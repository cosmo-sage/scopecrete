"use client";

/**
 * Settings → Vendors: the kinds of vendor and the trades under each (Coy, 2026-10-24: "a place to
 * quickly and easily modify, edit, rearrange this lists of groups and kinds … so that dusty can
 * find the correct vendor easily"). Vendor → Kind → Trade (src/lib/vendor-taxonomy.ts). Kinds are
 * org_contact_subtypes; trades are org_vendor_trades (migration 129). Edited here, saved together.
 */

import React, { useEffect, useMemo, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";
import { groupTrades, kindSlug, type Kind, type Trade } from "@/lib/vendor-taxonomy";

interface Data { kinds: Kind[]; trades: Trade[]; missing: string | null }

const box: React.CSSProperties = { height: 30, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 8px", fontSize: F.sm, background: T.card, color: T.ink, minWidth: 0 };
const iconBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 4, fontSize: 13, color: T.ink3, cursor: "pointer", flex: "0 0 auto" };

export function VendorSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    fetch("/api/vendors/taxonomy").then((r) => r.json()).then((b: Data & { error?: string }) => {
      if (off) return;
      if (b.error) { setErr(b.error); return; }
      setData(b); setKinds(b.kinds); setTrades(b.trades);
    }).catch((e) => { if (!off) setErr(String(e)); });
    return () => { off = true; };
  }, [tick]);

  const kindKey = (ks: Kind[]) => JSON.stringify(ks.map(({ slug, label }) => ({ slug, label })));
  const tradeKey = (ts: Trade[]) => JSON.stringify(ts.map(({ name, kind }) => ({ name, kind })));
  const kindsDirty = useMemo(() => !!data && kindKey(data.kinds) !== kindKey(kinds), [data, kinds]);
  const tradesDirty = useMemo(() => !!data && tradeKey(data.trades) !== tradeKey(trades), [data, trades]);
  const dirty = kindsDirty || tradesDirty;

  const save = async () => {
    setBusy(true); setErr(null); setNote(null);
    try {
      // A kind made here takes its slug from the name it ends up with; its trades follow.
      const known = new Set((data?.kinds ?? []).map((k) => k.slug));
      const slugs = new Map<string, string>();
      const out: Kind[] = [];
      for (const k of kinds) {
        const slug = known.has(k.slug) ? k.slug : kindSlug(k.label, [...known, ...out.map((x) => x.slug)]);
        slugs.set(k.slug, slug);
        out.push({ slug, label: k.label });
      }
      const body: Record<string, unknown> = {};
      if (kindsDirty) body.kinds = out;
      if (tradesDirty && !data?.missing) body.trades = trades.filter((t) => t.name.trim()).map(({ id, name, kind }) => ({ id, name, kind: kind ? slugs.get(kind) ?? kind : null }));
      const r = await fetch("/api/vendors/taxonomy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? `Couldn't save (${r.status}).`);
      setNote(tradesDirty && data?.missing ? `Kinds saved. ${data.missing}` : "Saved. The Vendors page, the drawer and Dusty use it now.");
      setTick((n) => n + 1);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const setKind = (i: number, label: string) => setKinds((ks) => ks.map((k, j) => (j === i ? { ...k, label } : k)));
  const moveKind = (i: number, d: -1 | 1) => setKinds((ks) => { const n = [...ks]; const j = i + d; if (j < 0 || j >= n.length) return ks; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const dropKind = (i: number) => {
    const k = kinds[i];
    if ((k.n ?? 0) > 0) { setErr(`${k.label} has ${k.n} vendor${k.n === 1 ? "" : "s"} — move them to another kind (Edit on their page) first.`); return; }
    setKinds((ks) => ks.filter((_, j) => j !== i));
    setTrades((ts) => ts.map((t) => (t.kind === k.slug ? { ...t, kind: null } : t)));
  };
  const addKind = () => {
    const label = `New kind ${kinds.length + 1}`;
    setKinds((ks) => [...ks, { slug: kindSlug(label, ks.map((k) => k.slug)), label, n: 0 }]);
  };

  const setTrade = (t: Trade, patch: Partial<Trade>) => setTrades((ts) => ts.map((x) => (x === t ? { ...x, ...patch } : x)));
  const moveTrade = (t: Trade, d: -1 | 1) => setTrades((ts) => {
    const same = ts.map((x, i) => [x, i] as const).filter(([x]) => (x.kind ?? null) === (t.kind ?? null));
    const at = same.findIndex(([x]) => x === t);
    const other = same[at + d];
    if (!other) return ts;
    const n = [...ts]; const i = same[at][1]; const j = other[1];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const dropTrade = (t: Trade) => {
    if ((t.n ?? 0) > 0 && !window.confirm(`${t.n} vendor${t.n === 1 ? "" : "s"} carry ${t.name}. Take it off them too?`)) return;
    setTrades((ts) => ts.filter((x) => x !== t));
  };
  const addTrade = (kind: string | null) => setTrades((ts) => [...ts, { name: "", kind, n: 0 }]);

  const groups = groupTrades(kinds, trades);
  const tradeRow = (t: Trade) => (
    <div key={t.id ?? `${t.name}-${trades.indexOf(t)}`} className="flex items-center gap-1.5" style={{ padding: "3px 0 3px 22px" }}>
      <span style={{ color: T.ink3, fontSize: 11 }}>–</span>
      <input value={t.name} onChange={(e) => setTrade(t, { name: e.target.value })} placeholder="Trade name" aria-label="Trade name" style={{ ...box, flex: 1 }} disabled={!!data?.missing} />
      <select value={t.kind ?? ""} onChange={(e) => setTrade(t, { kind: e.target.value || null })} aria-label={`Kind for ${t.name}`} style={{ ...box, width: 140 }} disabled={!!data?.missing}>
        {kinds.map((k) => <option key={k.slug} value={k.slug}>{k.label}</option>)}
        <option value="">No kind</option>
      </select>
      <span style={{ fontSize: 10, color: T.ink3, width: 54, textAlign: "right" }}>{t.n ? `${t.n} vendor${t.n === 1 ? "" : "s"}` : ""}</span>
      <button onClick={() => moveTrade(t, -1)} aria-label={`Move ${t.name} up`} style={iconBtn} disabled={!!data?.missing}>↑</button>
      <button onClick={() => moveTrade(t, 1)} aria-label={`Move ${t.name} down`} style={iconBtn} disabled={!!data?.missing}>↓</button>
      <button onClick={() => dropTrade(t)} aria-label={`Remove ${t.name}`} style={{ ...iconBtn, color: T.red }} disabled={!!data?.missing}>×</button>
    </div>
  );

  return (
    <div>
      <SettingsTitle title="Vendors"
        note="Every vendor has one kind (Subcontractor, Supplier …) and any trades under it (Flatwork, Ready-mix …). Dusty looks vendors up by these, so name them the way you'd ask for them."
        actions={<div className="flex gap-2">
          {dirty && <button onClick={() => { if (data) { setKinds(data.kinds); setTrades(data.trades); } }} className="rounded px-3" style={{ height: 32, fontSize: F.sm, border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>Discard</button>}
          <button onClick={() => void save()} disabled={!dirty || busy} className="rounded px-3"
            style={{ height: 32, fontSize: F.sm, fontWeight: 600, background: dirty ? T.hiviz : T.sunk, color: dirty ? T.onHiviz : T.ink3, cursor: dirty ? "pointer" : "default" }}>{busy ? "Saving…" : "Save"}</button>
        </div>} />
      {err && <div className="rounded px-3 py-2 mb-3" style={{ fontSize: F.sm, background: T.redDim, color: T.red }}>{err}</div>}
      {note && <div className="rounded px-3 py-2 mb-3" style={{ fontSize: F.sm, background: T.greenDim, color: T.green }}>{note}</div>}
      {data?.missing && <div className="rounded px-3 py-2 mb-3" style={{ fontSize: F.sm, background: T.sunDim, color: T.sun }}>{data.missing} Until then you can rename and reorder kinds; the trades below are the app&apos;s own list.</div>}
      {!data ? <div style={{ fontSize: F.sm, color: T.ink3 }}>{err ? "" : "Loading…"}</div> : (
        <>
          {groups.map((g, gi) => {
            const i = g.kind ? kinds.indexOf(g.kind) : -1;
            return (
              <SettingsBlock key={g.kind?.slug ?? "none"}
                title={g.kind ? (
                  <div className="flex items-center gap-1.5">
                    <input value={g.kind.label} onChange={(e) => setKind(i, e.target.value)} aria-label="Kind name" style={{ ...box, fontWeight: 600, flex: 1, maxWidth: 280 }} />
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 400 }}>{g.kind.n ? `${g.kind.n} vendor${g.kind.n === 1 ? "" : "s"}` : "no vendors"}</span>
                  </div>
                ) : "Other trades"}
                note={g.kind ? undefined : "Trades typed on a vendor that sit under no kind yet — pick one for each."}
                action={g.kind ? (
                  <div className="flex">
                    <button onClick={() => moveKind(i, -1)} disabled={gi === 0} aria-label={`Move ${g.kind.label} up`} style={iconBtn}>↑</button>
                    <button onClick={() => moveKind(i, 1)} disabled={i === kinds.length - 1} aria-label={`Move ${g.kind.label} down`} style={iconBtn}>↓</button>
                    <button onClick={() => dropKind(i)} aria-label={`Remove ${g.kind.label}`} style={{ ...iconBtn, color: T.red }}>×</button>
                  </div>
                ) : undefined}>
                {g.trades.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3, paddingLeft: 22 }}>No trades under it.</div>}
                {g.trades.map(tradeRow)}
                {!data.missing && (
                  <button onClick={() => addTrade(g.kind?.slug ?? null)} style={{ fontSize: F.xs, fontWeight: 600, color: T.chalk, cursor: "pointer", padding: "4px 0 0 22px" }}>+ Add a trade</button>
                )}
              </SettingsBlock>
            );
          })}
          <button onClick={addKind} className="rounded px-3" style={{ height: 32, fontSize: F.sm, fontWeight: 600, border: `1px dashed ${T.hairStrong}`, color: T.ink2, cursor: "pointer" }}>+ Add a kind</button>
        </>
      )}
    </div>
  );
}
