"use client";

/**
 * More — the v34 fourth tab. A menu, not a screen of numbers.
 *
 * Counts shown against each entry are real or absent. Nothing here shows a
 * total it did not fetch.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";

interface Entry { href: string; label: string; note: string; live: boolean }

const GROUPS: [string, Entry[]][] = [
  ["Work", [
    { href: "/dashboard/messages?f=customers", label: "Customers", note: "Everyone filed as a customer — on Threads", live: true },
    { href: "/dashboard/more/logs", label: "Logs", note: "Data checks, Dusty's reads, merges", live: true },
  ]],
  ["Settings", [
    { href: "/dashboard/more/lines", label: "Phone lines", note: "Your numbers, their provider, and the lead source each one means", live: true },
    { href: "/dashboard/cash", label: "Costs and rates", note: "What the engine prices from", live: true },
  ]],
  ["Not yet wired", [
    { href: "", label: "Documents", note: "Needs a documents table", live: false },
    { href: "", label: "Schedule", note: "Needs job rows to schedule", live: false },
    { href: "", label: "Dusty", note: "Send path deliberately disabled", live: false },
  ]],
];

export default function MoreScreen() {
  const [leadCount, setLeadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/pipeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.stages) return;
        const n = Object.values(d.stages as Record<string, { count: number }>)
          .reduce((s, st) => s + (st.count || 0), 0);
        setLeadCount(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {GROUPS.map(([group, entries]) => (
        <div key={group}>
          <div className="px-3 pt-3 pb-1" style={eyebrow}>{group}</div>
          {entries.map((e, i) => {
            const inner = (
              <div className="px-3 py-2.5 flex items-center gap-3"
                style={{ background: T.card, borderTop: i === 0 ? `1px solid ${T.hair}` : `1px solid ${T.hair}` }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: e.live ? T.ink : T.ink3 }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: F.xs, color: T.ink3 }}>{e.note}</div>
                </div>
                {e.live && e.label === "Pipeline" && leadCount !== null && (
                  <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>{leadCount}</span>
                )}
              </div>
            );
            return e.live
              ? <Link key={e.label} href={e.href} className="block no-underline">{inner}</Link>
              : <div key={e.label} aria-disabled="true">{inner}</div>;
          })}
        </div>
      ))}
    </div>
  );
}
