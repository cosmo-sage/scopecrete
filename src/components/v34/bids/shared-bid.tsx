"use client";
/**
 * The bid request as a vendor opens it from their link (migration 091): who
 * it's from, the job, the scopes with quantities (what the org supplies is
 * marked — they price labor), the address, the dates, photos, plans and the
 * aerial — and a form for their price: one number, a price per line, or their
 * usual rates filled in. No login. Never a cost of the org's.
 */
import React, { useEffect, useMemo, useState } from "react";
import { answerTotal, type ShownScope } from "@/lib/bids";

interface Bid {
  gone?: boolean; own?: boolean; org_name: string | null; job_title?: string | null; first_name?: string | null;
  price_mode?: "lump" | "per_item" | "their_rates"; price_by?: string | null; pour_date?: string | null;
  scopes?: ShownScope[]; note?: string | null; address?: string | null; access?: string | null;
  files?: Array<{ id: string; name: string; kind: string; url: string }>; rates?: Record<string, number>;
  answer?: { at: string; total: number | null; lines: Array<{ key: string; price: number }> | null; note: string | null } | null;
}

const C = { ink: "#2A2A2A", ink2: "#5B5650", ink3: "#8C857C", paper: "#FBF6EC", card: "#FFFFFF", hair: "#E4DCCB", accent: "#B85A3C", green: "#2F8A5B", red: "#B5412C" };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const day = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
const qtyLabel = (q: number | null, u: string | null) => q === null ? (u ?? "") : `${q.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${u ?? ""}`.trim();
const num = (s: string) => { const v = Number(s.replace(/[$,\s]/g, "")); return s.trim() && Number.isFinite(v) && v >= 0 ? v : null; };

export function SharedBid({ token }: { token: string }) {
  const [b, setB] = useState<Bid | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let off = false;
    fetch(`/api/b/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (off) return;
      if (!r.ok) { setErr(j?.error ?? "This link can't be opened."); return; }
      setB(j as Bid);
      const rates = (j as Bid).rates ?? {};
      setPrices(Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, String(v)])));
    }).catch(() => { if (!off) setErr("Couldn't reach the bid request. Check your connection and try again."); });
    return () => { off = true; };
  }, [token]);

  const lines = useMemo(() => (b?.scopes ?? []).flatMap((s) => s.lines), [b]);
  const perItem = b?.price_mode !== "lump";
  const priced = useMemo(() => Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, num(v)])), [prices]);
  const sum = perItem ? answerTotal(lines, priced) : null;

  const box: React.CSSProperties = { maxWidth: 560, margin: "60px auto", padding: "0 16px", fontSize: 15, color: C.ink, lineHeight: 1.5, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };
  if (err) return <div style={box}>{err}</div>;
  if (!b) return <div style={box}>Opening the bid request…</div>;
  if (b.gone) return <div style={box}>This bid request was closed{b.org_name ? ` by ${b.org_name}` : ""}. Call them if you still want to price it.</div>;

  const submit = async () => {
    setBusy(true); setErr(null);
    const body = perItem
      ? { total: sum, lines: lines.filter((l) => !l.supplied && priced[l.key] !== null && priced[l.key] !== undefined).map((l) => ({ key: l.key, name: l.name, unit: l.unit, qty: l.qty, price: priced[l.key] })), note }
      : { total: num(total), note };
    try {
      const r = await fetch(`/api/b/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setSent(body.total !== null && body.total !== undefined ? money(body.total as number) : "your prices");
      setChanging(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const answered = sent ?? (b.answer && !changing ? (b.answer.total !== null ? money(b.answer.total) : "your prices") : null);
  const photos = (b.files ?? []).filter((f) => f.kind === "photo");
  const docs = (b.files ?? []).filter((f) => f.kind !== "photo");
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.hair}`, borderRadius: 6, padding: 14 };
  const h: React.CSSProperties = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: C.ink3, margin: "0 0 8px" };
  const input: React.CSSProperties = { height: 40, border: `1px solid ${C.hair}`, borderRadius: 4, padding: "0 10px", fontSize: 16, width: "100%", background: "#fff", color: C.ink };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
        {b.own && <div style={{ ...card, background: "#FFF6D6", fontSize: 13 }}>This is what the vendor sees. Opening it yourself isn&apos;t counted, and you can&apos;t answer it.</div>}
        <div>
          <div style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>Bid request{b.org_name ? ` · ${b.org_name}` : ""}</div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 26, lineHeight: 1.15 }}>{b.job_title ?? "A job for you"}</h1>
          <div style={{ fontSize: 14, color: C.ink2 }}>
            {[b.first_name ? `For ${b.first_name}` : null, b.address, b.pour_date ? `pour ${day(b.pour_date)}` : null, b.price_by ? `price by ${day(b.price_by)}` : null].filter(Boolean).join(" · ")}
          </div>
          {b.access && <div style={{ fontSize: 13, color: C.ink2, marginTop: 4 }}>Access: {b.access}</div>}
          {b.note && <div style={{ fontSize: 14, marginTop: 8 }}>{b.note}</div>}
        </div>

        <section style={card}>
          <h2 style={h}>What to price</h2>
          {(b.scopes ?? []).map((s) => (
            <div key={s.key} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>{s.title}{s.size ? <span style={{ fontWeight: 400, color: C.ink3 }}> · {s.size}</span> : null}</div>
              {s.lines.map((l) => (
                <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.hair}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: l.supplied ? C.green : C.ink3 }}>{[qtyLabel(l.qty, l.unit) || null, l.supplied ? `${b.org_name ?? "We"} supplies — don't price it` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  {perItem && !l.supplied && !answered && (
                    <label style={{ display: "flex", alignItems: "center", gap: 4, width: 150 }}>
                      <span style={{ fontSize: 13, color: C.ink3 }}>$</span>
                      <input inputMode="decimal" value={prices[l.key] ?? ""} onChange={(e) => setPrices({ ...prices, [l.key]: e.target.value })} aria-label={`Price per ${l.unit ?? "item"} for ${l.name}`} style={{ ...input, height: 36 }} />
                      <span style={{ fontSize: 12, color: C.ink3, whiteSpace: "nowrap" }}>/{l.unit ?? "ea"}</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>

        {(photos.length > 0 || docs.length > 0) && (
          <section style={card}>
            <h2 style={h}>Photos, plans and the aerial</h2>
            {photos.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, marginBottom: docs.length ? 10 : 0 }}>
                {photos.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4, display: "block" }} /></a>)}
              </div>
            )}
            {docs.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: C.accent, fontSize: 14, borderTop: `1px solid ${C.hair}` }}>
                {f.kind === "aerial" ? "Aerial — " : "Plan — "}{f.name}
              </a>
            ))}
          </section>
        )}

        <section style={card}>
          <h2 style={h}>Your price</h2>
          {answered ? (
            <div style={{ fontSize: 15 }}>
              <div style={{ color: C.green, fontWeight: 600 }}>Sent — {answered}.</div>
              <div style={{ color: C.ink2, fontSize: 14 }}>{b.org_name ?? "They"} will see it. Thanks.</div>
              {!b.own && <button onClick={() => setChanging(true)} style={{ marginTop: 8, color: C.accent, fontSize: 14, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Change my price</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {perItem ? (
                <div style={{ fontSize: 14, color: C.ink2 }}>
                  {b.price_mode === "their_rates" && Object.keys(b.rates ?? {}).length ? "Your rates from last time are filled in — change any. " : "Put a price per unit on each line above. "}
                  Total: <b style={{ color: C.ink }}>{sum === null ? "—" : money(sum)}</b>
                </div>
              ) : (
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 13, color: C.ink2 }}>One number for everything above, labor{lines.some((l) => l.supplied) ? " — not what they supply" : ""}</span>
                  <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$" aria-label="Your total" style={{ ...input, marginTop: 4 }} />
                </label>
              )}
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: C.ink2 }}>Anything to add (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} aria-label="Note" style={{ ...input, height: "auto", padding: 10, marginTop: 4 }} />
              </label>
              {err && <div style={{ color: C.red, fontSize: 14 }}>{err}</div>}
              <button onClick={() => void submit()} disabled={busy || b.own || (perItem ? sum === null : num(total) === null)}
                style={{ height: 46, borderRadius: 4, border: "none", background: C.accent, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer",
                  opacity: busy || b.own || (perItem ? sum === null : num(total) === null) ? 0.5 : 1 }}>{busy ? "Sending…" : "Send my price"}</button>
            </div>
          )}
        </section>
        <div style={{ fontSize: 11, color: C.ink3, textAlign: "center" }}>Sent with ScopeCrete · scopecrete.ai</div>
      </div>
    </div>
  );
}
