"use client";
/**
 * A vendor's portal (migration 126; Coy, 2026-10-23: "from the bid request page … I would like the
 * vendor to access their portal to see the other bid request documents / projects we are trying to
 * win. And they can see the ones they won / lost"). Reached from any live bid link of theirs
 * (/b/<token>/all). Open requests first — each opening its own link — then the ones they won and
 * the ones they didn't. Only their own rows and their own price; no login.
 */
import React, { useEffect, useState } from "react";
import { groupPortalBids, type PortalBid } from "@/lib/bids";
import { Emblem, Wordmark } from "@/components/site/marks";

interface Portal { gone?: boolean; own?: boolean; org_name: string | null; vendor_name?: string | null; first_name?: string | null; requests?: PortalBid[] }

const C = { ink: "#2A2A2A", ink2: "#5B5650", ink3: "#8C857C", paper: "#FBF6EC", card: "#FFFFFF", hair: "#E4DCCB", accent: "#B85A3C", green: "#2F8A5B", red: "#B5412C" };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const day = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

export function VendorPortal({ token }: { token: string }) {
  const [p, setP] = useState<Portal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/b/${encodeURIComponent(token)}/all`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (off) return;
      if (!r.ok) setErr(j?.error ?? "This page can't be opened."); else setP(j as Portal);
    }).catch(() => { if (!off) setErr("Couldn't reach your bid requests. Check your connection and try again."); });
    return () => { off = true; };
  }, [token]);

  const box: React.CSSProperties = { maxWidth: 560, margin: "60px auto", padding: "0 16px", fontSize: 15, color: C.ink, lineHeight: 1.5, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };
  if (err) return <div style={box}>{err}</div>;
  if (!p) return <div style={box}>Opening your bid requests…</div>;
  if (p.gone) return <div style={box}>This link was closed{p.org_name ? ` by ${p.org_name}` : ""}. Ask them for a new one.</div>;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const g = groupPortalBids(p.requests ?? [], today);
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.hair}`, borderRadius: 6, padding: 14 };
  const h: React.CSSProperties = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: C.ink3, margin: "6px 0 8px" };
  const who = p.first_name?.trim() || p.vendor_name?.trim();

  const row = (b: PortalBid & { label: string }, tone: string) => {
    const inner = (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15 }}>{b.job ?? "A job"}{b.current ? <span style={{ fontWeight: 400, fontSize: 12, color: C.ink3 }}> · the one you opened</span> : null}</div>
          {b.total !== null && b.answered_at && <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{money(Number(b.total))}</span>}
        </div>
        <div style={{ fontSize: 13, color: C.ink2 }}>
          {[b.address, b.sent_at ? `sent ${day(b.sent_at)}` : null, b.price_by ? `price by ${day(b.price_by)}` : null, b.pour_date ? `pour ${day(b.pour_date)}` : null].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize: 13, color: tone, fontWeight: 600 }}>{b.label}{b.answered_at ? ` · you priced it ${day(b.answered_at)}` : ""}</div>
      </>
    );
    return b.token
      ? <a key={b.token} href={`/b/${b.token}`} style={{ ...card, display: "flex", flexDirection: "column", gap: 3, textDecoration: "none", color: C.ink }}>{inner}<span style={{ fontSize: 13, color: C.accent }}>Open it ›</span></a>
      : <div key={`${b.job}-${b.sent_at}`} style={{ ...card, display: "flex", flexDirection: "column", gap: 3, opacity: 0.85 }}>{inner}</div>;
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: 10 }}>
        {p.own && <div style={{ ...card, background: "#FFF6D6", fontSize: 13 }}>This is what the vendor sees from their bid link. Only their own requests and prices are on it.</div>}
        <div>
          <div style={{ fontSize: 13, color: C.ink3 }}>Bid requests from {p.org_name ?? "your contractor"}</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 24, fontWeight: 700 }}>{who ? `${who}'s bid requests` : "Your bid requests"}</h1>
          <div style={{ fontSize: 14, color: C.ink2, marginTop: 4 }}>The jobs {p.org_name ?? "they"} sent you to price, the ones you won, and the ones that went another way. Save this page — no login needed.</div>
        </div>

        <h2 style={h}>Open · {g.open.length}</h2>
        {g.open.length ? g.open.map((b) => row(b, b.answered_at ? C.green : C.accent)) : <div style={{ fontSize: 14, color: C.ink3 }}>Nothing open right now.</div>}
        {g.won.length > 0 && <><h2 style={h}>Won · {g.won.length}</h2>{g.won.map((b) => row(b, C.green))}</>}
        {g.lost.length > 0 && <><h2 style={h}>Not won · {g.lost.length}</h2>{g.lost.map((b) => row(b, C.ink3))}</>}

        <a href="https://scopecrete.ai" target="_blank" rel="noopener"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 0 4px", textDecoration: "none", color: C.ink3 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>Sent with <Emblem size={22} spin={false} /> <Wordmark size={16} /></span>
          <span style={{ fontSize: 13, color: C.accent, textDecoration: "underline" }}>Click here to find out more</span>
        </a>
      </div>
    </div>
  );
}
