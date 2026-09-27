"use client";

/**
 * Customers — v34's CustomersScreen (list) and CustomerScreen (one person).
 * Same arrangement as Threads: the list lives in the layout so opening a
 * person does not unmount it; below lg one pane shows at a time.
 *
 * Three tabs, not v34's two. v34 offered Customers and Vendors & subs, which
 * has no way to tell the truth about the ~190 contacts nobody has classified:
 * they would all sit under Customers because that is the column default.
 * Unclassified is its own tab and, today, nearly everyone is in it.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime, formatPhone } from "@/lib/v34/tokens";
import { Avatar, EmptyState } from "@/components/v34/primitives";

interface Person {
  contact_id: string; name: string | null; phone: string | null; address: string | null;
  relation: "customer" | "vendor" | "sub" | "unclassified";
  texts: number; calls: number; last_at: string | null; jobs: number;
}

const TABS: [string, string][] = [["unclassified", "Unclassified"], ["customer", "Customers"], ["vendor", "Vendors & subs"]];

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const open = /^\/dashboard\/customers\/[^/]+/.test(pathname);
  const current = open ? pathname.split("/")[3] : null;

  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("unclassified");
  const [q, setQ] = useState("");

  // Refetched on navigation so a relation confirmed on the person page moves
  // them to the right tab when you come back.
  useEffect(() => {
    let off = false;
    fetch("/api/customers")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setPeople(Array.isArray(b.people) ? b.people : []); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [pathname]);

  const count = (k: string) => (people ?? []).filter((p) => (k === "vendor" ? p.relation === "vendor" || p.relation === "sub" : p.relation === k)).length;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return (people ?? []).filter((p) => (tab === "vendor" ? p.relation === "vendor" || p.relation === "sub" : p.relation === tab))
      .filter((p) => !term || (p.name ?? "").toLowerCase().includes(term) || (p.address ?? "").toLowerCase().includes(term)
        || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)));
  }, [people, tab, q]);

  return (
    <div className="lg:flex lg:items-stretch lg:h-[calc(100dvh-54px)]">
      <div className={`${open ? "hidden lg:block" : "block"} w-full lg:w-[380px] xl:w-[420px] lg:shrink-0 lg:overflow-y-auto`}
        style={{ borderRight: `1px solid ${T.hair}`, background: T.slab }}>
        <div className="px-2.5 pt-2.5">
          <div style={eyebrow}>Customers</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number or street"
            className="w-full px-2.5 rounded outline-none mt-1"
            style={{ border: `1px solid ${T.hair}`, background: T.card, height: 36, fontSize: F.sm }} />
        </div>
        <div className="flex gap-1 px-2.5 pt-2 pb-1.5 flex-wrap">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="px-2.5 rounded"
              style={{ height: 30, border: `1px solid ${tab === k ? T.ink : T.hair}`, background: tab === k ? T.ink : T.card,
                       color: tab === k ? "#fff" : T.ink2, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", ...nums }}>
              {l}{people ? ` ${count(k)}` : ""}
            </button>
          ))}
        </div>
        {tab === "unclassified" && people && (
          <div className="px-2.5 pb-1.5" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>
            Nobody has said what these are yet. Open one to mark it a customer, vendor or sub.
          </div>
        )}

        {error ? <EmptyState tone="warn" title="Couldn't load people" detail={error} />
          : people === null ? (
            <div className="p-2.5 space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />)}</div>
          ) : shown.length === 0 ? (
            <EmptyState title={q ? "No match" : tab === "unclassified" ? "Everyone is classified" : "Nobody confirmed here yet"}
              detail={q ? undefined : tab === "unclassified" ? undefined : "A person lands here once you confirm what they are. Nothing is filed here by default."} />
          ) : (
            <div className="mx-2.5 mb-3 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
              {shown.map((p, i) => {
                const label = p.name ?? formatPhone(p.phone);
                const when = relTime(p.last_at);
                return (
                  <Link key={p.contact_id} href={`/dashboard/customers/${p.contact_id}`}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 no-underline"
                    style={{ background: current === p.contact_id ? T.hivizDim : T.card, borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
                    <Avatar label={label} kind={p.relation === "unclassified" ? "unsorted" : p.relation} dim={!p.name} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{label}</div>
                      <div style={{ fontSize: F.xs, color: T.ink3, ...clip, ...nums }}>
                        {p.jobs ? `${p.jobs} job${p.jobs > 1 ? "s" : ""}` : "No jobs"} · {p.texts} texts · {p.calls} calls
                        {p.address ? ` · ${p.address}` : ""}
                      </div>
                    </div>
                    {when && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>}
                  </Link>
                );
              })}
            </div>
          )}
      </div>

      <div className={`${open ? "block" : "hidden lg:block"} lg:flex-1 lg:min-w-0 lg:overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
