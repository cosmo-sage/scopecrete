"use client";
/**
 * The Scope Builder page (Coy, 2026-10-09) — a first cut, before Claude Design
 * works it up. Every scope with how far it has got (Files → Takeoffs → Budget →
 * Proposal → Sent), split Residential · Commercial & government, each row
 * opening the job on the step it needs next. New scope is Dusty's quick select; the filters sit behind ☰.
 * The Jobs board stays the sales stages; this is the scope's own flow.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { MenuButton, PageHeader, SearchBubble, SearchToggle, SlideDrawer } from "@/components/v34/primitives";
import { SCOPE_STEPS, stepHref, type Market, type ScopeFacts, type ScopeProgress, type ScopeStep } from "@/lib/scope-builder";

interface Scope {
  id: string; title: string; customer: string | null; address: string | null; city: string | null;
  job_type: string | null; market: Market; status: string; created_at: string; updated_at: string;
  facts: ScopeFacts; progress: ScopeProgress; total: number | null;
}
type MarketPick = "all" | Market;

const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? "today" : d < 2 ? "yesterday" : d < 30 ? `${Math.floor(d)}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
};

function Steps({ p, jobId }: { p: ScopeProgress; jobId: string }) {
  return (
    <div className="flex items-center gap-1" aria-label="Where this scope stands">
      {SCOPE_STEPS.map((s, i) => {
        const done = p.done[s.k], next = p.next === s.k && !p.done.sent;
        return (
          <React.Fragment key={s.k}>
            {i > 0 && <span aria-hidden="true" style={{ width: 8, height: 1, background: done ? T.green : T.hair }} />}
            <Link href={stepHref(jobId, s.k)} title={`${s.label}${done ? " · done" : next ? " · next" : ""}`}
              className="rounded" style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", whiteSpace: "nowrap",
                background: done ? T.greenDim : next ? T.hivizDim : "transparent", color: done ? T.green : next ? T.ink : T.ink3,
                border: `1px solid ${done ? "transparent" : next ? T.hiviz : T.hairSoft}` }}>
              {done ? "✓ " : ""}{s.label}
            </Link>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function ScopeBuilderPage() {
  const [scopes, setScopes] = useState<Scope[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketPick>(() => {
    try { return (localStorage.getItem("sc:scope-market") as MarketPick) || "all"; } catch { return "all"; }
  });
  const [step, setStep] = useState<ScopeStep | "all">("all");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/scope-builder").then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setScopes(b.scopes as Scope[]); }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);
  const pickMarket = (m: MarketPick) => { setMarket(m); try { localStorage.setItem("sc:scope-market", m); } catch { /* private */ } };

  const inMarket = useMemo(() => (scopes ?? []).filter((s) => !["lost"].includes(s.status) && (market === "all" || s.market === market)), [scopes, market]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: inMarket.length };
    for (const s of inMarket) c[s.progress.next] = (c[s.progress.next] ?? 0) + 1;
    return c;
  }, [inMarket]);
  const shown = inMarket.filter((s) => (step === "all" || s.progress.next === step)
    && (!q.trim() || `${s.title} ${s.customer ?? ""} ${s.address ?? ""} ${s.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const mCount = (m: Market) => (scopes ?? []).filter((s) => s.market === m && s.status !== "lost").length;
  const pill = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 10px", borderRadius: 14, fontSize: F.xs, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2 });

  return (
    <div style={{ color: T.ink, minHeight: "100%" }}>
      {/* The filters slide in from the left behind ☰, left of the org's name (Coy, 2026-10-11: "shrink
          the header height"); + New scope is Dusty's quick select on this page. */}
      <PageHeader title="Scope Builder" count={scopes ? shown.length : undefined}
        sub="Every scope from files to a sent proposal: Files → Takeoffs → Budget → Proposal. A row opens the job on its next step."
        menu={<MenuButton always onClick={() => setFilters(true)} label="Filter scopes" />}
        actions={<SearchToggle open={searching} onToggle={() => setSearching((x) => !x)} label="Find a scope" />}>
        {searching && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setSearching(false)} placeholder="Find a scope, customer or address" /></div>}
        {(market !== "all" || step !== "all") && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {market !== "all" && <button style={{ ...pill(true), height: 24 }} onClick={() => pickMarket("all")}>{market === "residential" ? "Residential" : "Commercial & government"} ×</button>}
            {step !== "all" && <button style={{ ...pill(true), height: 24 }} onClick={() => setStep("all")}>{step === "sent" ? "Sent" : `Needs ${(SCOPE_STEPS.find((x) => x.k === step)?.label ?? "").toLowerCase()}`} ×</button>}
          </div>
        )}
      </PageHeader>
      <SlideDrawer open={filters} onClose={() => setFilters(false)} width={280} label="Filter scopes">
        <div className="p-3 flex flex-col gap-1" style={{ color: T.ink }}>
          <div style={{ ...eyebrow, padding: "4px 2px" }}>Market</div>
          {([["all", `All · ${(scopes ?? []).filter((s) => s.status !== "lost").length}`], ["residential", `Residential · ${mCount("residential")}`], ["commercial", `Commercial & government · ${mCount("commercial")}`]] as Array<[MarketPick, string]>).map(([k, l]) => (
            <button key={k} onClick={() => pickMarket(k)} className="text-left rounded" style={{ padding: "8px 10px", fontSize: F.sm, background: market === k ? T.slab : "transparent", fontWeight: market === k ? 700 : 500, color: T.ink }}>{l}</button>
          ))}
          <div style={{ ...eyebrow, padding: "12px 2px 4px" }}>Next step</div>
          {([["all", "Every step"], ...SCOPE_STEPS.map((s) => [s.k, s.k === "sent" ? "Sent" : `Needs ${s.label.toLowerCase()}`])] as Array<[ScopeStep | "all", string]>).map(([k, l]) => (
            <button key={k} onClick={() => { setStep(k); setFilters(false); }} className="text-left rounded flex" style={{ padding: "8px 10px", fontSize: F.sm, background: step === k ? T.slab : "transparent", fontWeight: step === k ? 700 : 500, color: T.ink }}>
              <span className="flex-1">{l}</span><span style={{ color: T.ink3, ...nums }}>{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </SlideDrawer>

      <div className="px-3 lg:px-5 py-3">
        {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
        {!scopes && !err && <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading scopes…</div>}
        {scopes && shown.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>No scopes here. <Link href="/dashboard/scope?new=1" style={{ color: T.chalk }}>Start a new one</Link>.</div>}
        <div className="flex flex-col gap-2" style={{ maxWidth: 1100 }}>
          {shown.map((s) => (
            <div key={s.id} className="rounded" style={{ border: `1px solid ${T.hair}`, background: T.card, padding: "10px 12px" }}>
              <div className="flex items-start gap-2 flex-wrap">
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Link href={stepHref(s.id, s.progress.next)} style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: T.ink }}>{s.title}</Link>
                  <div style={{ fontSize: F.xs, color: T.ink3 }}>
                    {[s.customer, s.city ?? s.address, s.market === "commercial" ? (s.job_type === "public" ? "Government" : "Commercial") : "Residential", `updated ${ago(s.updated_at)}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ textAlign: "right", ...nums }}>
                  <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: s.total === null ? T.ink3 : T.ink }}>{s.total === null ? "no price yet" : money0(s.total)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-1.5">
                <Steps p={s.progress} jobId={s.id} />
                <span style={{ fontSize: F.xs, color: T.ink2 }}>{s.progress.line}</span>
                <span className="flex-1" />
                {!s.progress.done.sent && (
                  <Link href={stepHref(s.id, s.progress.next)} style={{ ...eyebrow, color: T.chalk }}>
                    {SCOPE_STEPS.find((x) => x.k === s.progress.next)?.label} ›
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
