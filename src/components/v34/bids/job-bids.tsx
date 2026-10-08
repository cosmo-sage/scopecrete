"use client";

/**
 * A job's bids (migration 091; Vendors v2 · V3, the what-first door): every
 * bid request sent on this job, each vendor's answer side by side, and Get
 * bids — the composer with this job filled in and vendors suggested, subs and
 * best responders first. On the job's Summary.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, nums, clip, money } from "@/lib/v34/tokens";
import { call } from "@/components/v34/cost-cards";
import { BidComposer } from "@/components/v34/bids/bid-composer";
import { hoursLabel, type PriceLine, type ShownScope } from "@/lib/bids";

interface Rec {
  id: string; contact_id: string; name: string; url: string; sent_at: string | null; opened_at: string | null; view_count: number;
  answered_at: string | null; price_total: number | null; price_lines: PriceLine[] | null; answer_note: string | null; revoked_at: string | null;
}
interface Req { id: string; price_mode: string; price_by: string | null; scopes: ShownScope[]; created_at: string; recipients: Rec[] }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const lineSum = (ls: PriceLine[] | null) => (ls ?? []).reduce((t, l) => t + (l.qty ?? 1) * l.price, 0);

export function JobBids({ jobId, card }: { jobId: string; card: React.CSSProperties }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    call(`/api/bid-requests?job=${jobId}`, "GET").then((b) => { if (!off) { setReqs(b.requests as Req[]); setMissing(b.missing ?? null); } }).catch(() => { if (!off) setReqs([]); });
    return () => { off = true; };
  }, [jobId, tick]);

  return (
    <section aria-label="Bids" className="px-3 py-2.5" style={card}>
      <div className="flex items-baseline gap-2">
        <span style={eyebrow}>Bids from subs &amp; suppliers</span>
        <span className="flex-1" />
        <button onClick={() => setComposing(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Get bids →</button>
      </div>
      {missing && <div style={{ fontSize: F.xs, color: T.sun, marginTop: 4 }}>{missing}</div>}
      {note && <div className="rounded px-2 py-1 mt-2 flex gap-2" style={{ fontSize: F.xs, background: T.greenDim }}><span style={{ flex: 1 }}>{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {reqs === null ? <div className="rounded animate-pulse mt-2" style={{ height: 32, background: T.hairSoft }} />
        : reqs.length === 0 ? (
          <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
            None sent. Get bids picks the areas they price (quantities, never your costs) and sends each sub their own link.
          </div>
        ) : reqs.map((r) => (
          <div key={r.id} className="mt-2 pt-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
            <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
              {day(r.created_at)} · {r.scopes.map((s) => s.title).join(" · ")}{r.price_by ? ` · price by ${day(`${r.price_by}T12:00:00`)}` : ""}
            </div>
            {[...r.recipients].sort((a, b) => Number(!!b.answered_at) - Number(!!a.answered_at) || (a.price_total ?? Infinity) - (b.price_total ?? Infinity)).map((x) => {
              const total = x.price_total !== null ? Number(x.price_total) : x.price_lines ? lineSum(x.price_lines) : null;
              const st = x.revoked_at ? "link off" : x.answered_at ? `answered${x.sent_at ? ` in ${hoursLabel((Date.parse(x.answered_at) - Date.parse(x.sent_at)) / 3_600_000)}` : ""}`
                : x.sent_at ? (x.opened_at ? "opened · no price yet" : "sent · not opened") : "not sent";
              return (
                <div key={x.id} className="flex items-center gap-2 py-1">
                  <Link href={`/dashboard/vendors/${x.contact_id}`} style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0, ...clip }}>{x.name}</Link>
                  <span style={{ fontSize: F.xs, color: x.answered_at ? T.green : T.ink3, whiteSpace: "nowrap" }}>{st}</span>
                  <span style={{ ...nums, fontSize: F.sm, fontWeight: 600, width: 96, textAlign: "right", color: total !== null ? T.ink : T.ink3 }}>{total !== null && x.answered_at ? money(total) : "—"}</span>
                </div>
              );
            })}
          </div>
        ))}
      {composing && <BidComposer open jobId={jobId} from="Started from the job" onClose={() => setComposing(false)} onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />}
    </section>
  );
}
