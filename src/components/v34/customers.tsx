"use client";

/**
 * The Customers list (migration 055): one row per customer — a household, a
 * school, a business — not per person. Art Apartments is one row however many
 * of its people call. Filed by Coy, or by Dusty on an earned streak ("auto").
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime, strong } from "@/lib/v34/tokens";

interface Row { id: string; name: string | null; customer_type: string | null; status: string | null; address: string | null; contacts: number; jobs: number; last_at: string | null; summary: string | null; auto: boolean }
const TYPE: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };

export function Customers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let off = false;
    fetch("/api/customers").then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setRows(b.customers as Row[]); }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || [r.name, r.address, r.status, r.summary].some((x) => (x ?? "").toLowerCase().includes(t)));
  }, [rows, q]);
  return (
    <div className="mx-auto" style={{ maxWidth: 1000, padding: "12px 12px 24px" }}>
      <h1 style={{ fontFamily: strong, fontSize: F.xl, fontWeight: 700, margin: 0, color: T.ink }}>Customers</h1>
      <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 8 }}>
        A customer is the household, school or business — its people are its contacts. Filing someone as Customer in Threads puts them here; on a customer&apos;s page, + Add contact puts more of its people under it.
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a customer, address or status" aria-label="Find a customer"
        style={{ width: "100%", height: 36, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: F.sm, background: T.card, color: T.ink }} />
      {err && <div role="alert" style={{ color: T.red, fontSize: F.sm, marginTop: 8 }}>Couldn&apos;t load customers: {err}</div>}
      <div className="rounded overflow-hidden" style={{ marginTop: 10, background: T.card, border: `1px solid ${T.hair}` }}>
        {rows === null && !err && <div className="animate-pulse" style={{ height: 80, background: T.hairSoft }} />}
        {rows !== null && shown.length === 0 && <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>{q ? "Nothing matches." : "No customers yet — file someone as Customer in Threads."}</div>}
        {shown.map((r, i) => (
          <Link key={r.id} href={`/dashboard/customers/${r.id}`} className="block px-3 py-2.5" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
            <div className="flex items-baseline gap-2">
              <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, ...clip }}>{r.name ?? "Unnamed customer"}</span>
              {r.auto && <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>auto</span>}
              {r.customer_type && <span style={{ fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".08em", color: T.ink3 }}>{TYPE[r.customer_type] ?? r.customer_type}</span>}
              <span style={{ fontSize: F.xs, color: T.ink3 }}>{r.last_at ? relTime(r.last_at) : ""}</span>
            </div>
            <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
              {[r.address, `${r.contacts} contact${r.contacts === 1 ? "" : "s"}`, `${r.jobs} job${r.jobs === 1 ? "" : "s"}`, r.status].filter(Boolean).join(" · ")}
            </div>
            {r.summary && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{r.summary}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
