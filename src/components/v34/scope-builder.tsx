"use client";
/**
 * The Scope Builder page (Coy, 2026-10-09) — a first cut, before Claude Design
 * works it up. Every scope with how far it has got (Files → Takeoffs → Budget →
 * Proposal → Sent), split Residential · Commercial & government, each row
 * opening the job on the step it needs next. + New scope opens the New job form.
 * The Jobs board stays the sales stages; this is the scope's own flow.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { PageHeader, SearchBubble, SearchToggle } from "@/components/v34/primitives";
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
      <PageHeader title="Scope Builder" count={scopes ? shown.length : undefined}
        sub="Every scope from files to a sent proposal: Files → Takeoffs → Budget → Proposal. A row opens the job on its next step."
        actions={<>
          <SearchToggle open={searching} onToggle={() => setSearching((x) => !x)} label="Find a scope" />
          <Link href="/dashboard/scope?new=1" className="sc-new-btn rounded flex items-center" style={{ height: 30, padding: "0 12px", background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>+ New scope</Link>
        </>}>
        {searching && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setSearching(false)} placeholder="Find a scope, customer or address" /></div>}
        <div className="flex gap-1.5 mt-2 overflow-x-auto" style={{ paddingBottom: 2 }}>
          <button style={pill(market === "all")} onClick={() => pickMarket("all")}>All</button>
          <button style={pill(market === "residential")} onClick={() => pickMarket("residential")}>Residential · {mCount("residential")}</button>
          <button style={pill(market === "commercial")} onClick={() => pickMarket("commercial")}>Commercial &amp; government · {mCount("commercial")}</button>
        </div>
        <div className="flex gap-1.5 mt-1.5 overflow-x-auto" style={{ paddingBottom: 2 }}>
          {([["all", "Every step"], ...SCOPE_STEPS.map((s) => [s.k, s.k === "sent" ? "Sent" : `Needs ${s.label.toLowerCase()}`])] as Array<[ScopeStep | "all", string]>).map(([k, l]) => (
            <button key={k} style={{ ...pill(step === k), height: 24, fontWeight: 500 }} onClick={() => setStep(k)}>{l} {counts[k] ? `· ${counts[k]}` : ""}</button>
          ))}
        </div>
      </PageHeader>

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
