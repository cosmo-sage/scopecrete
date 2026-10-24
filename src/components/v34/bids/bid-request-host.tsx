"use client";

/**
 * One bid request composer for the whole dashboard, opened by `sc:bid-request` (Coy, 2026-10-24: "request
 * bid requests from cost items in the budget page. Or have dusty do it for me. or do it from the expanded
 * Cost Item panel"). The budget's cost item panel and a group's Request bids send their line ids; Dusty's
 * bid_request step sends sections, cost types, Price book items and vendors. Nothing is sent from here:
 * the composer opens with those ticked, and Coy picks who and taps Send, as from the job's Get bids.
 */

import React, { useEffect, useState } from "react";
import { BidComposer } from "@/components/v34/bids/bid-composer";
import type { BidSeed } from "@/lib/bids";

export interface BidRequestDetail { job: string; seed?: BidSeed | null; vendors?: string[]; from?: string }

/** Opens the composer on a job with these cost items picked. */
export function requestBids(detail: BidRequestDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<BidRequestDetail>("sc:bid-request", { detail }));
}

export function BidRequestHost({ enabled }: { enabled: boolean }) {
  const [req, setReq] = useState<(BidRequestDetail & { n: number }) | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent<BidRequestDetail>).detail;
      if (!d?.job) return;
      setMsg(null);
      setReq({ ...d, n: Date.now() });
    };
    window.addEventListener("sc:bid-request", on);
    return () => window.removeEventListener("sc:bid-request", on);
  }, [enabled]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <>
      {req && <BidComposer key={req.n} open jobId={req.job} seed={req.seed ?? null} vendorIds={req.vendors} from={req.from ?? "Started from the budget"}
        onClose={() => setReq(null)} onDone={(m) => { setMsg(m); window.dispatchEvent(new Event("sc:bids-changed")); }} />}
      {msg && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2" style={{ bottom: "calc(var(--sc-foot, 0px) + 16px)", zIndex: 90, background: "#1F2A24", color: "#fff", padding: "8px 14px", borderRadius: 4, fontSize: 13, maxWidth: "90vw" }}>
          {msg}
        </div>
      )}
    </>
  );
}
