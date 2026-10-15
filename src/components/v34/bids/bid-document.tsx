"use client";
/**
 * The bid request as a document, laid out like the proposal (Coy, 2026-10-15: "I need the bid request
 * page to look more like the proposal page with the sections showing the takeoffs of the areas and
 * thicknesses of the areas, the linear feet of curbs, the counts on other types of take offs … They
 * should be able to see the sq/ft or sqyd per section and the total sqft of the job totaled out. same for
 * linear ft and counts. And I don't want to show the estimated amount of days").
 *
 * One component, two pages: the composer draws it with ticks (what goes in, who supplies the material)
 * and the vendor's link (/b/<token>) draws it with their price boxes. Always white paper, whatever the
 * theme, like the proposal. It never shows a cost, a price of the org's or a time estimate: a line in
 * days or hours shows no quantity (isTimeUnit()).
 */
import React from "react";
import { disp, strong } from "@/lib/v34/tokens";
import { isTimeUnit, jobTotals, measureLabel, type Measure } from "@/lib/bids";

export interface DocLine { key: string; name: string; qty: number | null; unit: string | null; supplied: boolean; on?: boolean }
export interface DocScope {
  key: string; title: string; size: string | null; measure?: Measure | null; lines: DocLine[]; on?: boolean;
  /** The section's takeoffs on its sheet: drawn live in the composer, a frozen picture on the link. */
  map?: React.ReactNode; photos?: Array<{ id: string; url: string; name: string }>;
}
export interface BidDocVM {
  org: string | null; jobTitle: string | null; forName?: string | null; address?: string | null;
  priceBy?: string | null; pourDate?: string | null; note?: string | null; scopes: DocScope[];
}
export interface BidDocEdits {
  scope: (key: string, on: boolean) => void;
  line: (key: string, on: boolean) => void;
  supplied: (key: string, on: boolean) => void;
}

const P = { ink: "#2A2A2A", ink2: "#5E5A52", ink3: "#8C8578", hair: "#E6DCC8", paper: "#FBF6EC", accent: "#B85A3C", accentText: "#9A4527", green: "#2F8A5B", band: "#2A2A2A" };
const kicker: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: P.accentText };
const f2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;

/** A line's quantity as the vendor reads it — none for a line in days or hours. */
export const lineQty = (l: Pick<DocLine, "qty" | "unit">) => isTimeUnit(l.unit) || l.qty === null ? null : `${f2(l.qty)}${l.unit ? ` ${l.unit}` : ""}`;

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} role="checkbox" aria-checked={on} aria-label={label} className="sc-no-print"
      style={{ width: 18, height: 18, flex: "none", borderRadius: 3, border: `1.5px solid ${on ? P.green : "#C9BDA6"}`, background: on ? P.green : "#fff", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer", padding: 0 }}>
      {on ? "✓" : ""}
    </button>
  );
}

export function BidDocument({ vm, edits, price, narrow }: {
  vm: BidDocVM; edits?: BidDocEdits | null;
  /** The vendor's price box for one line (the link, per-item pricing). */
  price?: (l: DocLine) => React.ReactNode;
  narrow: boolean;
}) {
  const shown = vm.scopes.filter((s) => s.on !== false);
  const t = jobTotals(shown);
  const pad = narrow ? "16px 16px" : "22px 34px";
  const facts = [
    vm.forName ? ["For", vm.forName] : null, vm.address ? ["Job site", vm.address] : null,
    day(vm.priceBy) ? ["Price by", day(vm.priceBy)!] : null, day(vm.pourDate) ? ["Pour", day(vm.pourDate)!] : null,
  ].filter(Boolean) as Array<[string, string]>;
  const totals = [
    t.sf ? { k: "Total area", v: `${f2(t.sf)} SF`, s: `${f2(t.sy!)} SY` } : null,
    t.lf ? { k: "Linear feet", v: `${f2(t.lf)} LF`, s: null } : null,
    ...t.counts.map((c) => ({ k: "Count", v: `${f2(c.n)} ${c.unit}`, s: null })),
  ].filter(Boolean) as Array<{ k: string; v: string; s: string | null }>;
  let n = 0;

  return (
    <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", background: "#fff", color: P.ink, boxShadow: "0 2px 10px rgba(42,32,20,.1)", fontSize: 13, lineHeight: 1.5 }}>
      <div className="flex items-center justify-between gap-4" style={{ background: P.band, color: P.paper, padding: narrow ? "12px 16px" : "14px 34px", flexWrap: narrow ? "wrap" : "nowrap" }}>
        <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 16 }}>{vm.org ?? ""}</div>
        <div style={{ textAlign: "right", minWidth: 0, marginLeft: "auto" }}>
          <div style={{ ...kicker, color: "#D97757" }}>Bid request</div>
          <div style={{ fontFamily: strong, fontWeight: 700, fontSize: narrow ? 17 : 20, lineHeight: 1.2 }}>{vm.jobTitle || "Concrete work"}</div>
        </div>
      </div>

      <div style={{ padding: pad }}>
        {facts.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: narrow ? "1fr 1fr" : `repeat(${facts.length}, minmax(0, 1fr))`, fontSize: 12.5, paddingBottom: 12, borderBottom: `1px solid ${P.hair}` }}>
            {facts.map(([k, v]) => <div key={k}><div style={{ ...kicker, color: P.ink3 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>)}
          </div>
        )}
        {vm.note && <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{vm.note}</div>}

        {totals.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={kicker}>Job totals</div>
            <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: narrow ? "1fr 1fr" : `repeat(${Math.min(4, totals.length)}, minmax(0, 1fr))` }}>
              {totals.map((x, i) => (
                <div key={i} style={{ background: P.paper, border: `1px solid ${P.hair}`, borderTop: `3px solid ${P.accent}`, borderRadius: 3, padding: "8px 10px" }}>
                  <div style={{ fontFamily: disp, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: P.ink3 }}>{x.k}</div>
                  <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{x.v}</div>
                  {x.s && <div style={{ fontSize: 12, color: P.ink2 }}>{x.s}</div>}
                </div>
              ))}
            </div>
            {t.sf && shown.some((s) => s.measure?.concrete) && shown.some((s) => s.measure?.sf && !s.measure.concrete && !s.measure.lf) && (
              <div style={{ fontSize: 11.5, color: P.ink3, marginTop: 4 }}>Total area counts the concrete only — base and prep under it cover the same ground.</div>
            )}
          </div>
        )}

        <div style={{ ...kicker, marginTop: 18 }}>Scope of work</div>
        {vm.scopes.length === 0 && <div style={{ color: P.ink3, marginTop: 6 }}>Nothing to price yet.</div>}
        <div className="flex flex-col" style={{ marginTop: 4 }}>
          {vm.scopes.map((s) => {
            const on = s.on !== false;
            if (!on && !edits) return null;
            const num = on ? String(++n).padStart(2, "0") : "—";
            const spec = measureLabel(s.measure) ?? s.size;
            const lines = s.lines.filter((l) => edits || l.on !== false);
            return (
              <section key={s.key} style={{ borderTop: `1px solid ${P.hair}`, padding: "12px 0", opacity: on ? 1 : 0.45, breakInside: "avoid" }}>
                <div className="flex items-start gap-2">
                  {edits && <Tick on={on} onClick={() => edits.scope(s.key, !on)} label={`${on ? "Leave out" : "Put in"} ${s.title}`} />}
                  <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: P.accent, minWidth: 18, paddingTop: 2 }}>{num}</span>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                    {spec && <div style={{ fontSize: 12.5, color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{spec}</div>}
                  </div>
                </div>
                {on && (s.map || (s.photos?.length ?? 0) > 0) && (
                  <div className="flex gap-2 items-start flex-wrap" style={{ marginTop: 8, paddingLeft: edits ? 46 : 26 }}>
                    {s.map}
                    {(s.photos ?? []).slice(0, 6).map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed link */}
                        <img src={p.url} alt={p.name} style={{ width: narrow ? 76 : 92, height: narrow ? 76 : 92, objectFit: "cover", borderRadius: 3, border: `1px solid ${P.hair}`, display: "block" }} />
                      </a>
                    ))}
                  </div>
                )}
                {lines.length > 0 && (
                  <div style={{ marginTop: 8, paddingLeft: edits ? 46 : 26 }}>
                    {lines.map((l) => {
                      const lon = l.on !== false;
                      const q = lineQty(l);
                      return (
                        <div key={l.key} className="flex items-center gap-2" style={{ padding: "5px 0", borderTop: `1px dashed ${P.hair}`, opacity: lon ? 1 : 0.5 }}>
                          {edits && <Tick on={lon} onClick={() => edits.line(l.key, !lon)} label={`${lon ? "Leave out" : "Put in"} ${l.name}`} />}
                          <div className="flex-1" style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13 }}>{l.name}</div>
                            {(q || l.supplied) && (
                              <div style={{ fontSize: 11.5, color: l.supplied ? P.green : P.ink3, fontVariantNumeric: "tabular-nums" }}>
                                {[q, l.supplied ? `${vm.org ?? "We"} supplies — don't price it` : null].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          {edits && lon && (
                            <button type="button" onClick={() => edits.supplied(l.key, !l.supplied)} title="Who supplies the material" className="sc-no-print"
                              style={{ height: 22, padding: "0 7px", borderRadius: 3, fontFamily: disp, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer",
                                border: `1px solid ${l.supplied ? P.green : P.hair}`, background: l.supplied ? "#E5F2EA" : "#fff", color: l.supplied ? P.green : P.ink3, whiteSpace: "nowrap" }}>
                              {l.supplied ? `${vm.org ?? "We"} supplies` : "They price it"}
                            </button>
                          )}
                          {!edits && price && !l.supplied && price(l)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
