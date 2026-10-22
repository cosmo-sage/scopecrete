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
 *
 * Laid out for a phone first (Coy, 2026-10-22: "clear and simple to understand in a page or 2 on a
 * phone"): who is asking and when it is due, one short table of every section's size (SF, SY,
 * thickness, yards, LF, counts) with the job's totals under it, then each section's lines with their
 * quantity on the right and "we supply" marked; the takeoff map and photos are small thumbnails that
 * open full screen.
 */
import React, { useEffect, useState } from "react";
import { disp, strong } from "@/lib/v34/tokens";
import { dueLabel, isTimeUnit, jobTotals, sizeParts, type Measure } from "@/lib/bids";

export interface DocLine { key: string; name: string; qty: number | null; unit: string | null; supplied: boolean; on?: boolean }
export interface DocScope {
  key: string; title: string; size: string | null; measure?: Measure | null; lines: DocLine[]; on?: boolean;
  /** The section's takeoffs on its sheet, drawn live in the composer. */
  map?: React.ReactNode;
  /** The same, frozen as a picture when sent (the vendor's link): a thumbnail that opens full screen. */
  mapUrl?: string | null;
  photos?: Array<{ id: string; url: string; name: string }>;
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

const P = { ink: "#2A2A2A", ink2: "#5E5A52", ink3: "#8C8578", hair: "#E6DCC8", paper: "#FBF6EC", accent: "#B85A3C", accentText: "#9A4527", green: "#2F8A5B", greenBg: "#E5F2EA", red: "#B5412C", redBg: "#FBEAE6" };
const kicker: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: P.ink3 };
const f2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
const centralToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

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

interface Pic { url: string; name: string }

/** A picture full screen over the page: ‹ › through the section's pictures, × or Esc closes. */
function Viewer({ pics, at, onClose }: { pics: Pic[]; at: number; onClose: () => void }) {
  const [i, setI] = useState(at);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(pics.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pics.length, onClose]);
  const p = pics[i];
  const nav: React.CSSProperties = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 26, cursor: "pointer" };
  return (
    <div role="dialog" aria-modal="true" aria-label={p?.name ?? "Picture"} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(16,14,12,.94)", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-3" style={{ padding: "10px 12px", color: "#fff", fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.name}{pics.length > 1 ? ` · ${i + 1} of ${pics.length}` : ""}</span>
        <a href={p?.url} target="_blank" rel="noreferrer" style={{ color: "#fff", fontSize: 13 }}>Open</a>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed link */}
        {p && <img src={p.url} alt={p.name} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 8, width: "calc(100% - 16px)", height: "calc(100% - 16px)", objectFit: "contain" }} />}
        {i > 0 && <button type="button" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setI(i - 1); }} style={{ ...nav, left: 8 }}>‹</button>}
        {i < pics.length - 1 && <button type="button" aria-label="Next" onClick={(e) => { e.stopPropagation(); setI(i + 1); }} style={{ ...nav, right: 8 }}>›</button>}
      </div>
    </div>
  );
}

export function BidDocument({ vm, edits, price, narrow }: {
  vm: BidDocVM; edits?: BidDocEdits | null;
  /** The vendor's price box for one line (the link, per-item pricing). */
  price?: (l: DocLine) => React.ReactNode;
  narrow: boolean;
}) {
  const [view, setView] = useState<{ pics: Pic[]; at: number } | null>(null);
  const shown = vm.scopes.filter((s) => s.on !== false);
  const t = jobTotals(shown);
  const pad = narrow ? 14 : 28;
  const due = dueLabel(vm.priceBy, centralToday());
  const totals = [
    t.sf ? `${f2(t.sf)} SF · ${f2(t.sy!)} SY` : null,
    t.lf ? `${f2(t.lf)} LF` : null,
    ...t.counts.map((c) => `${f2(c.n)} ${c.unit}`),
  ].filter(Boolean) as string[];
  // The summary table lists the sections that measure something; "Whole job" lines come after them.
  const measured = shown.filter((s) => sizeParts(s.measure) || s.size);
  const numOf = new Map(shown.map((s, i) => [s.key, String(i + 1).padStart(2, "0")]));
  const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", background: "#fff", color: P.ink, boxShadow: "0 2px 10px rgba(42,32,20,.1)", fontSize: 14, lineHeight: 1.45, borderRadius: narrow ? 6 : 2, overflow: "hidden" }}>
      {/* Who is asking, for what, and by when. */}
      <div style={{ padding: `${narrow ? 14 : 22}px ${pad}px 12px`, borderTop: `4px solid ${P.accent}` }}>
        <div style={{ ...kicker, color: P.accentText }}>Bid request{vm.org ? ` · from ${vm.org}` : ""}</div>
        <div style={{ fontFamily: strong, fontWeight: 700, fontSize: narrow ? 20 : 24, lineHeight: 1.2, marginTop: 2 }}>{vm.jobTitle || "Concrete work"}</div>
        {vm.address && (
          <a href={maps(vm.address)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 4, color: P.ink2, fontSize: 13.5, textDecoration: "underline", textDecorationColor: P.hair }}>
            📍 {vm.address}
          </a>
        )}
        {(due || vm.pourDate) && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
            {due && (
              <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: due.soon ? P.redBg : P.paper, color: due.soon ? P.red : P.ink, border: `1px solid ${due.soon ? "#EBC2B8" : P.hair}` }}>
                Price by {due.text}
              </span>
            )}
            {vm.pourDate && <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 13, background: P.paper, border: `1px solid ${P.hair}`, color: P.ink2 }}>Pour {day(vm.pourDate)}</span>}
          </div>
        )}
        {vm.forName && <div style={{ marginTop: 10, fontSize: 14 }}>Hi {vm.forName}, {vm.org ? `${vm.org} would` : "we'd"} like your price on the work below.</div>}
        {vm.note && <div style={{ marginTop: 8, padding: "8px 10px", background: P.paper, borderLeft: `3px solid ${P.accent}`, whiteSpace: "pre-wrap", fontSize: 13.5 }}>{vm.note}</div>}
      </div>

      {/* Every section's size at a glance, and the job's totals. */}
      {measured.length > 0 && (
        <div style={{ padding: `4px ${pad}px 12px` }}>
          <div style={kicker}>The work at a glance</div>
          <div style={{ marginTop: 4, border: `1px solid ${P.hair}`, borderRadius: 4 }}>
            {measured.map((s, i) => {
              const sz = sizeParts(s.measure);
              return (
                <a key={s.key} href={`#bid-${s.key}`} className="flex items-start gap-2" style={{ padding: "7px 10px", borderTop: i ? `1px solid ${P.hair}` : "none", color: P.ink, textDecoration: "none" }}>
                  <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: P.accent, minWidth: 18, paddingTop: 2 }}>{numOf.get(s.key)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{s.title}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>{sz?.main ?? s.size}</span>
                    {sz?.sub && <span style={{ display: "block", fontSize: 11.5, color: P.ink3, whiteSpace: "nowrap" }}>{sz.sub}</span>}
                  </span>
                </a>
              );
            })}
            {totals.length > 0 && (
              <div className="flex items-start gap-2" style={{ padding: "8px 10px", borderTop: `2px solid ${P.ink}`, background: P.paper }}>
                <span style={{ flex: 1, fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", paddingTop: 1 }}>Total</span>
                <span style={{ textAlign: "right", fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {totals.map((x) => <span key={x} style={{ display: "block", whiteSpace: "nowrap" }}>{x}</span>)}
                </span>
              </div>
            )}
          </div>
          {t.sf && shown.some((s) => s.measure?.concrete) && shown.some((s) => s.measure?.sf && !s.measure.concrete && !s.measure.lf) && (
            <div style={{ fontSize: 11.5, color: P.ink3, marginTop: 4 }}>The total area counts the concrete only — base and prep under it cover the same ground.</div>
          )}
        </div>
      )}

      {/* What to price, section by section. */}
      <div style={{ padding: `4px ${pad}px ${narrow ? 14 : 22}px` }}>
        <div style={kicker}>What to price</div>
        {vm.scopes.length === 0 && <div style={{ color: P.ink3, marginTop: 6 }}>Nothing to price yet.</div>}
        {vm.scopes.map((s) => {
          const on = s.on !== false;
          if (!on && !edits) return null;
          const sz = sizeParts(s.measure);
          const lines = s.lines.filter((l) => edits || l.on !== false);
          const pics: Pic[] = [...(s.mapUrl ? [{ url: s.mapUrl, name: `Where ${s.title} is` }] : []), ...(s.photos ?? []).map((p) => ({ url: p.url, name: p.name }))];
          const thumb = narrow ? 64 : 76;
          return (
            <section key={s.key} id={`bid-${s.key}`} style={{ borderTop: `1px solid ${P.hair}`, padding: "10px 0", opacity: on ? 1 : 0.45, breakInside: "avoid", scrollMarginTop: 12 }}>
              <div className="flex items-start gap-2">
                {edits && <Tick on={on} onClick={() => edits.scope(s.key, !on)} label={`${on ? "Leave out" : "Put in"} ${s.title}`} />}
                <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: P.accent, minWidth: 18, paddingTop: 3 }}>{on ? numOf.get(s.key) : "—"}</span>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</div>
                  {(sz || s.size) && <div style={{ fontSize: 12.5, color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{sz ? [sz.main, sz.sub].filter(Boolean).join(" · ") : s.size}</div>}
                </div>
              </div>
              {on && s.map && <div style={{ marginTop: 8, paddingLeft: edits ? 46 : 26 }}>{s.map}</div>}
              {on && pics.length > 0 && (
                <div className="flex gap-2" style={{ marginTop: 8, paddingLeft: edits ? 46 : 26, overflowX: "auto" }}>
                  {pics.slice(0, 8).map((p, i) => (
                    <button key={p.url} type="button" onClick={() => setView({ pics, at: i })} aria-label={`Open ${p.name}`}
                      style={{ flex: "none", padding: 0, border: `1px solid ${P.hair}`, borderRadius: 4, background: "#fff", cursor: "zoom-in", position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed link */}
                      <img src={p.url} alt={p.name} style={{ width: thumb, height: thumb, objectFit: "cover", borderRadius: 3, display: "block" }} />
                      {i === 0 && s.mapUrl && <span style={{ position: "absolute", left: 3, bottom: 3, background: "rgba(42,42,42,.8)", color: "#fff", fontSize: 10, padding: "0 4px", borderRadius: 2 }}>Map</span>}
                    </button>
                  ))}
                </div>
              )}
              {lines.length > 0 && (
                <div style={{ marginTop: 6, paddingLeft: edits ? 46 : 26 }}>
                  {lines.map((l) => {
                    const lon = l.on !== false;
                    const q = lineQty(l);
                    const box = !edits && price && !l.supplied ? price(l) : null;
                    return (
                      <div key={l.key} style={{ padding: "7px 0", borderTop: `1px dashed ${P.hair}`, opacity: lon ? 1 : 0.5 }}>
                        <div className="flex items-start gap-2">
                          {edits && <Tick on={lon} onClick={() => edits.line(l.key, !lon)} label={`${lon ? "Leave out" : "Put in"} ${l.name}`} />}
                          <div className="flex-1" style={{ minWidth: 0, fontSize: 14 }}>
                            {l.name}
                            {l.supplied && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 3, background: P.greenBg, color: P.green, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{vm.org ?? "We"} supplies — don&apos;t price</span>}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: q ? P.ink : P.ink3 }}>{q ?? (l.supplied ? "" : "one price")}</span>
                          {edits && lon && (
                            <button type="button" onClick={() => edits.supplied(l.key, !l.supplied)} title="Who supplies the material" className="sc-no-print"
                              style={{ height: 22, padding: "0 7px", borderRadius: 3, fontFamily: disp, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer",
                                border: `1px solid ${l.supplied ? P.green : P.hair}`, background: l.supplied ? P.greenBg : "#fff", color: l.supplied ? P.green : P.ink3, whiteSpace: "nowrap" }}>
                              {l.supplied ? `${vm.org ?? "We"} supplies` : "They price it"}
                            </button>
                          )}
                          {box && !narrow && box}
                        </div>
                        {box && narrow && <div style={{ marginTop: 6 }}>{box}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {view && <Viewer pics={view.pics} at={view.at} onClose={() => setView(null)} />}
    </div>
  );
}
