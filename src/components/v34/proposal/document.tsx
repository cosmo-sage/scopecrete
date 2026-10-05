"use client";
/**
 * The proposal document (migration 060; Claude Design, design/proposal) —
 * the pages the customer sees. Every section, pricing group, line and price
 * can be switched off; the draws are checked against the total; warranty and
 * terms are edited in place. The same component draws a final proposal from
 * its snapshot, read-only.
 *
 * Nothing here prices anything: the numbers come from priceProposal()
 * (src/lib/proposal.ts) on top of the engine's budget().
 */
import React from "react";
import { disp, strong, light, hand, nums, formatPhone } from "@/lib/v34/tokens";
import { AreaMap, type AreaVisual } from "./area-visuals";
import { drawAmount, fixLastDraw, type Clause, type Draw, type ProposalChoice, type ProposalDisplay, type ProposalPrice, type ProposalGroup } from "@/lib/proposal";

export const SECTIONS: Array<[string, string]> = [
  ["cover", "Cover"], ["header", "Header"], ["scope", "Scope"], ["pricing", "Pricing"],
  ["pay", "Payments"], ["warranty", "Warranty"], ["terms", "Terms"], ["sign", "Sign"],
];

export interface DocArea { id: string; name: string | null; work_type: string | null; length_ft: number | null; width_ft: number | null; sqft: number | null; depth_in: number | null; psi: number | null; rebar: string | null; count?: number | null; count_unit?: string | null }
export interface DocVM {
  number: string; date: string; readOnly: boolean;
  typeKey: string | null; typeLabel: string;
  org: { name: string; logo: string | null; logoOnDark: string | null };
  /** The member who prepared it — their name and phone from Settings → You. */
  preparedBy?: { name: string | null; phone: string | null; email: string | null } | null;
  customer: { name: string | null; address: string | null; phone: string | null; email: string | null };
  job: { title: string | null; address: string | null; description: string | null };
  coverUrl: string | null;
  scopeIntro: string | null;
  areas: DocArea[];
  /** Each area's map and photos, from the Plan Room (read live, like the cover). */
  visuals?: Record<string, AreaVisual>;
  priced: ProposalPrice;
  /** Every option side by side, when the customer picks (display.all_options). */
  choices?: { list: ProposalChoice[]; shared: string[] } | null;
  display: ProposalDisplay;
  draws: Draw[];
  check: { sum: number; gap: number; ok: boolean; pct: number } | null;
  warranty: { title: string; body: string; template: string | null; starter: boolean; edited: boolean };
  terms: { title: string; clauses: Clause[]; template: string | null; starter: boolean; edited: boolean };
  typeDraws: Draw[];
}
export interface DocEdits {
  display: (d: ProposalDisplay) => void;
  draws: (d: Draw[]) => void;
  intro: (s: string) => void;
  warranty: (w: { title: string; body: string }) => void;
  terms: (c: Clause[]) => void;
  saveTemplate: (kind: "warranty" | "terms") => void;
  dusty: (kind: "warranty" | "terms" | "scope") => void;
  pickCover: () => void;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const qtyFmt = (n: number | null) => (n === null ? "" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const kicker: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "#9A4527" };
const h2: React.CSSProperties = { fontFamily: light, fontWeight: 300, fontSize: 20, margin: "2px 0 10px", color: "#2A2A2A" };
const edit: React.CSSProperties = { display: "block", width: "100%", border: "1px dashed transparent", borderRadius: 3, background: "transparent", color: "inherit", font: "inherit", padding: "2px 4px", margin: "0 -4px", resize: "none" };

function Switch({ on, onChange, label, size = "md" }: { on: boolean; onChange?: (v: boolean) => void; label: string; size?: "sm" | "md" }) {
  const w = size === "sm" ? 22 : 26, h = size === "sm" ? 13 : 16;
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={() => onChange?.(!on)} disabled={!onChange}
      className="sc-no-print shrink-0" style={{ width: w, height: h, borderRadius: 999, background: on ? "#2F8A5B" : "#D9CDB6", position: "relative", cursor: onChange ? "pointer" : "default", border: 0, padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? w - h + 2 : 2, width: h - 4, height: h - 4, borderRadius: 999, background: "#fff", transition: "left .12s" }} />
    </button>
  );
}

function Eye({ off, onClick, label }: { off: boolean; onClick?: () => void; label: string }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="sc-no-print shrink-0"
      style={{ width: 18, height: 18, borderRadius: 999, border: `1px solid ${off ? "#B5412C" : "#D9CDB6"}`, color: off ? "#B5412C" : "#8C8578", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" />
        {off && <path d="M2 2l12 12" />}
      </svg>
    </button>
  );
}

/** A textarea that grows with its text — the in-place editor for the document's words. */
function Grow({ value, onChange, style, placeholder, readOnly, label }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties; placeholder?: string; readOnly?: boolean; label: string }) {
  if (readOnly) return <div style={{ ...style, whiteSpace: "pre-wrap" }}>{value}</div>;
  return (
    <textarea className="sc-doc-edit" aria-label={label} value={value} placeholder={placeholder} rows={1}
      onChange={(e) => onChange(e.target.value)}
      ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
      onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }}
      style={{ ...edit, ...style, overflow: "hidden", fieldSizing: "content" } as React.CSSProperties} />
  );
}

function Section({ k, label, off, onToggle, children, page, narrow }: { k: string; label: string; off: boolean; onToggle?: (on: boolean) => void; children: React.ReactNode; page?: boolean; narrow?: boolean }) {
  if (off) {
    if (!onToggle) return null;
    return (
      <button type="button" onClick={() => onToggle(true)} className="sc-no-print w-full text-left"
        style={{ height: 44, border: "1px dashed #C9BDA6", borderRadius: 3, color: "#8C8578", fontFamily: disp, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", padding: "0 14px", background: "transparent", cursor: "pointer", margin: "10px 0" }}>
        {label} · hidden from the proposal · tap to include
      </button>
    );
  }
  return (
    <section data-section={k} className={page ? "sc-doc-page" : "sc-doc-sec"} style={{ position: "relative", padding: k === "cover" || narrow ? 0 : "22px 34px 18px", borderTop: page || k === "cover" || k === "header" ? "none" : "1px solid #F1E9DA" }}>
      {onToggle && (
        <div className="sc-no-print flex items-center gap-1.5" style={{ position: "absolute", top: 8, right: 8, zIndex: 2, background: "rgba(251,246,236,.94)", border: "1px solid #E6DCC8", borderRadius: 999, padding: "2px 4px 2px 9px", fontFamily: disp, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#5E5A52" }}>
          {label}<Switch on onChange={onToggle} label={`Show ${label.toLowerCase()}`} />
        </div>
      )}
      {children}
    </section>
  );
}

export function ProposalDocument({ vm, edits, narrow }: { vm: DocVM; edits: DocEdits | null; narrow: boolean }) {
  const d = vm.display;
  const off = d.off ?? {};
  const setD = (patch: Partial<ProposalDisplay>) => edits?.display({ ...d, ...patch });
  const flip = (key: "groupsOff" | "linesOff" | "pricesOff" | "picsOff", id: string) => {
    const cur = { ...(d[key] ?? {}) };
    if (cur[id]) delete cur[id]; else cur[id] = true;
    setD({ [key]: cur });
  };
  const toggleSection = edits ? (k: string) => (on: boolean) => { const o = { ...off }; if (on) delete o[k]; else o[k] = true; setD({ off: o }); } : () => undefined;
  const sectionToggle = (k: string) => (edits ? toggleSection(k) : undefined);
  const pad = narrow ? "18px 16px 14px" : undefined;
  const custName = vm.customer.name ?? "Customer";
  const where = vm.customer.address ?? vm.job.address;
  const kind = vm.typeKey === "public" ? "Bid submission" : vm.typeKey === "commercial" ? "Bid proposal" : "Proposal";
  const signer = vm.typeKey === "public" ? "Awarding authority" : vm.typeKey === "commercial" ? "Authorized representative" : vm.typeKey === "residential" ? "Owner" : "Customer";
  const dateStr = new Date(vm.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="sc-doc" style={{ width: "100%", maxWidth: 720, margin: "0 auto", background: "#fff", color: "#2A2A2A", boxShadow: "0 2px 10px rgba(42,32,20,.1)", fontSize: 13, lineHeight: 1.5 }}>
      <Section k="cover" label="Cover" off={!!off.cover} onToggle={sectionToggle("cover")} narrow={narrow}>
        {(vm.coverUrl || edits) && <div className={vm.coverUrl ? "sc-doc-cover" : "sc-no-print"} style={{ position: "relative", height: narrow ? 150 : 420, background: vm.coverUrl ? "#2A2A2A" : "#E9E4DA", overflow: "hidden" }}>
          {/* An <img>, not a CSS background: browsers leave backgrounds out of a print unless asked. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- signed link, printed */}
          {vm.coverUrl && <img src={vm.coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          {!vm.coverUrl && (
            <button type="button" onClick={edits ? edits.pickCover : undefined} className="sc-no-print absolute inset-0 flex items-center justify-center" disabled={!edits}
              style={{ color: "#8C8578", fontFamily: disp, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", border: 0, background: "transparent", cursor: edits ? "pointer" : "default" }}>
              {edits ? "+ Pick a cover photo from the job's files" : "No cover photo"}
            </button>
          )}
          {vm.coverUrl && edits && (
            <button type="button" onClick={edits.pickCover} className="sc-no-print absolute" style={{ left: 10, top: 10, background: "rgba(251,246,236,.94)", border: "1px solid #E6DCC8", borderRadius: 999, padding: "2px 10px", fontFamily: disp, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>Change photo</button>
          )}
        </div>}
      </Section>

      {/* The dark band: the logo on the left, what it is on the right. Its own strip since 2026-10-05
          (Coy: "The cover should not include this dark header. I don't want to lose this when I turn the
          header off") — the Cover switch hides only the photo, the Header switch only what is below. */}
      <div data-band className="flex items-center justify-between gap-4" style={{ background: "#2A2A2A", color: "#FBF6EC", padding: narrow ? "12px 16px" : "14px 34px", flexWrap: narrow ? "wrap" : "nowrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed redirect, printed */}
        {vm.org.logoOnDark ? <img src={vm.org.logoOnDark} alt={vm.org.name} style={{ height: 28, flex: "none" }} />
          : <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 16 }}>{vm.org.name}</div>}
        <div style={{ textAlign: "right", minWidth: 0, marginLeft: "auto" }}>
          <div style={{ ...kicker, color: "#D97757" }}>{kind}</div>
          <div style={{ fontFamily: strong, fontWeight: 700, fontSize: narrow ? 20 : 26, lineHeight: 1.15 }}>{vm.job.title || "Concrete work"}</div>
        </div>
      </div>

      <Section k="header" label="Header" off={!!off.header} onToggle={sectionToggle("header")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div className={narrow ? "flex flex-col gap-2" : "flex items-start gap-3"}>
            {/* The logo is on the dark band above, always — Coy: "redundant" here. */}
            <div className="flex-1" style={{ minWidth: 0, paddingRight: narrow && edits ? 90 : 0 }} />
            <div style={{ textAlign: narrow ? "left" : "right", paddingRight: edits && !narrow ? 90 : 0 }}>
              <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 18 }}>{vm.typeKey === "public" ? "Bid" : vm.typeKey === "commercial" ? "Proposal" : "Quote"} {vm.number}</div>
              <div style={{ fontSize: 11.5, color: "#5E5A52" }}>Issued {dateStr} · valid 30 days</div>
            </div>
          </div>
          <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", fontSize: 11.5 }}>
            <div>
              <div style={{ ...kicker, color: "#8C8578" }}>Prepared by</div>
              <div style={{ fontWeight: 600 }}>{vm.preparedBy?.name ?? vm.org.name}</div>
              {vm.preparedBy?.name && vm.org.name && <div>{vm.org.name}</div>}
              {vm.preparedBy?.phone && <div>{formatPhone(vm.preparedBy.phone)}</div>}
              {vm.preparedBy?.email && <div>{vm.preparedBy.email}</div>}
            </div>
            <div>
              <div style={{ ...kicker, color: "#8C8578" }}>Prepared for</div>
              <div style={{ fontWeight: 600 }}>{custName}</div>
              {where && <div>{where}</div>}
              {vm.customer.phone && <div>{formatPhone(vm.customer.phone)}</div>}
              {vm.customer.email && <div>{vm.customer.email}</div>}
            </div>
          </div>
        </div>
      </Section>

      <Section k="scope" label="Scope" off={!!off.scope} onToggle={sectionToggle("scope")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div style={kicker}>Scope of work</div>
          <h2 style={h2}>{vm.job.title || "The work"}</h2>
          <Grow label="Scope introduction" readOnly={!edits} value={vm.scopeIntro ?? vm.job.description ?? ""} onChange={(v) => edits?.intro(v)}
            placeholder="A sentence or two on the work, in the customer's words…" style={{ fontSize: 13, color: "#2A2A2A" }} />
          {edits && (
            <button type="button" onClick={() => edits.dusty("scope")} className="sc-no-print mt-1" style={dustyChip}>Edit with Dusty</button>
          )}
          {vm.areas.length > 0 && (
            <ol className="mt-3" style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: "6px 22px", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
              {vm.areas.map((a, i) => (
                <li key={a.id} className="flex gap-2">
                  <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: "#B85A3C", minWidth: 16 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <b style={{ fontWeight: 600 }}>{a.name || a.work_type || "Area"}</b>
                    <span style={{ color: "#5E5A52" }}>{areaSpec(a)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {!d.hide_area_pics && vm.areas.some((a) => vm.visuals?.[a.id]) && (
            <div className="mt-4 flex flex-col gap-3">
              {vm.areas.map((a, i) => {
                const v = vm.visuals?.[a.id];
                if (!v) return null;
                const hidden = !!d.picsOff?.[a.id];
                if (hidden && !edits) return null;
                return (
                  <div key={a.id} style={{ breakInside: "avoid", opacity: hidden ? 0.45 : 1 }} className={hidden ? "sc-no-print" : undefined}>
                    <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                      <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: "#B85A3C" }}>{String(i + 1).padStart(2, "0")}</span>
                      <b style={{ fontWeight: 600 }}>{a.name || a.work_type || "Area"}</b>
                      <span style={{ color: "#8C8578" }}>{[v.map || v.mapImage ? "where it is" : null, v.photos.length ? `${v.photos.length} photo${v.photos.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}{hidden ? " · hidden from the proposal" : ""}</span>
                      <span className="flex-1" />
                      <Eye off={hidden} label={hidden ? "Show this area's map and photos" : "Hide this area's map and photos"} onClick={edits ? () => flip("picsOff", a.id) : undefined} />
                    </div>
                    {!hidden && (
                      <div className="mt-1.5 flex gap-2 flex-wrap items-start">
                        {v.map && <AreaMap map={v.map} height={narrow ? 150 : 190} />}
                        {/* eslint-disable-next-line @next/next/no-img-element -- frozen when sent, printed */}
                        {!v.map && v.mapImage && <img src={v.mapImage} alt={`Where ${a.name || "this area"} is`} style={{ height: narrow ? 150 : 190, maxWidth: "100%", border: "1px solid #E6DCC8", borderRadius: 3 }} />}
                        {/* Thumbnails, a tap opens the photo full size (Coy, 2026-10-05: "the photos aren't showing as thumbnails"). */}
                        {v.photos.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap" style={{ alignContent: "flex-start" }}>
                            {v.photos.slice(0, 4).map((ph) => (
                              <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer" aria-label={`Open ${ph.name || "the photo"} full size`} style={{ display: "block", lineHeight: 0 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- signed link, printed */}
                                <img src={ph.url} alt={ph.name} loading="lazy" style={{ width: narrow ? 76 : 92, height: narrow ? 76 : 92, objectFit: "cover", borderRadius: 3, border: "1px solid #E6DCC8", background: "#E9E4DA" }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      <Section k="pricing" label="Pricing" off={!!off.pricing} onToggle={sectionToggle("pricing")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div className="flex items-center gap-2 flex-wrap" style={{ paddingRight: edits ? 90 : 0 }}>
            <div style={kicker}>Pricing</div>
            <span className="flex-1" />
          </div>
          {vm.choices ? (
            <Choices vm={vm} narrow={narrow} />
          ) : !vm.priced.ok ? (
            <div className="mt-2" style={{ background: "#F7EBC9", color: "#6B4E12", borderRadius: 4, padding: "10px 12px", fontSize: 12.5 }}>
              <b>No price yet.</b> The budget can&apos;t be priced until these are set:
              <ul style={{ margin: "6px 0 0 18px" }}>{vm.priced.blocked.slice(0, 8).map((b) => <li key={b}>{b}</li>)}</ul>
              {/* Every line an add-on: the per-line toggle lives in the price list, which isn't drawn — so it is here (Coy, 2026-10-02). */}
              {edits && !!vm.priced.addons?.length && (
                <div className="sc-no-print mt-2 flex flex-col gap-1">
                  {vm.priced.addons.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 flex-wrap">
                      <span style={{ flex: 1, minWidth: 0 }}>{a.name} <span style={{ color: "#8C8578" }}>· optional add-on</span></span>
                      <button type="button" onClick={() => setD({ addons: (vm.display.addons ?? []).filter((x) => x !== a.id) })} style={plainChip}>Put in the price</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Pricing vm={vm} narrow={narrow} edits={edits} flip={flip} setD={setD} />
          )}
        </div>
      </Section>

      <Section k="pay" label="Payments" off={!!off.pay} onToggle={sectionToggle("pay")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <Payments vm={vm} edits={edits} narrow={narrow} />
        </div>
      </Section>

      <Section k="warranty" label="Warranty" off={!!off.warranty} onToggle={sectionToggle("warranty")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div className="flex items-center gap-2 flex-wrap" style={{ paddingRight: edits ? 100 : 0 }}>
            <div style={kicker}>Warranty</div>
            <TemplateTag name={vm.warranty.template} starter={vm.warranty.starter} edited={vm.warranty.edited} />
          </div>
          <Grow label="Warranty title" readOnly={!edits} value={vm.warranty.title} onChange={(v) => edits?.warranty({ title: v, body: vm.warranty.body })} style={{ ...h2, marginTop: 4 }} />
          <Grow label="Warranty" readOnly={!edits} value={vm.warranty.body} onChange={(v) => edits?.warranty({ title: vm.warranty.title, body: v })} style={{ fontSize: 12.5, color: "#2A2A2A" }}
            placeholder="No warranty text — pick a template in the job panel, or write it here." />
          {edits && (
            <div className="sc-no-print flex gap-2 mt-2 flex-wrap">
              <button type="button" onClick={() => edits.dusty("warranty")} style={dustyChip}>Edit with Dusty</button>
              <button type="button" onClick={() => edits.saveTemplate("warranty")} style={plainChip}>Save as template</button>
            </div>
          )}
        </div>
      </Section>

      <Section k="terms" label="Terms" off={!!off.terms} onToggle={sectionToggle("terms")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div className="flex items-center gap-2 flex-wrap" style={{ paddingRight: edits ? 90 : 0 }}>
            <div style={kicker}>Terms &amp; conditions</div>
            <TemplateTag name={vm.terms.template} starter={vm.terms.starter} edited={vm.terms.edited} />
          </div>
          <h2 style={{ ...h2, marginTop: 4 }}>{vm.terms.title}</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {vm.terms.clauses.map((c, i) => (
              <li key={i} className="flex gap-2" style={{ position: "relative", marginBottom: 8 }}>
                <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 11, color: "#B85A3C", minWidth: 18, paddingTop: 2 }}>{i + 1}.</span>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <Grow label={`Clause ${i + 1} heading`} readOnly={!edits} value={c.h} onChange={(v) => edits?.terms(vm.terms.clauses.map((x, j) => (j === i ? { ...x, h: v } : x)))} style={{ fontWeight: 600, fontSize: 12.5 }} />
                  <Grow label={`Clause ${i + 1}`} readOnly={!edits} value={c.b} onChange={(v) => edits?.terms(vm.terms.clauses.map((x, j) => (j === i ? { ...x, b: v } : x)))} style={{ fontSize: 12.5, color: "#2A2A2A" }} />
                </div>
                {edits && (
                  <button type="button" aria-label={`Remove clause ${i + 1}`} onClick={() => edits.terms(vm.terms.clauses.filter((_, j) => j !== i))} className="sc-no-print shrink-0"
                    style={{ color: "#8C8578", width: 22, height: 22, border: 0, background: "transparent", cursor: "pointer" }}>×</button>
                )}
              </li>
            ))}
          </ol>
          {!vm.terms.clauses.length && <div style={{ color: "#8C8578", fontSize: 12.5 }}>No terms — pick a contract template in the job panel, or add a clause.</div>}
          {edits && (
            <div className="sc-no-print flex gap-2 mt-1 flex-wrap">
              <button type="button" onClick={() => edits.terms([...vm.terms.clauses, { h: "", b: "" }])} style={plainChip}>+ Clause</button>
              <button type="button" onClick={() => edits.dusty("terms")} style={dustyChip}>Edit with Dusty</button>
              <button type="button" onClick={() => edits.saveTemplate("terms")} style={plainChip}>Save as template</button>
            </div>
          )}
        </div>
      </Section>

      <Section k="sign" label="Sign" off={!!off.sign} onToggle={sectionToggle("sign")} narrow={narrow}>
        <div style={pad ? { padding: pad } : undefined}>
          <div style={kicker}>Acceptance</div>
          <p style={{ fontSize: 12.5, margin: "6px 0 18px" }}>
            The prices, scope, payment schedule and terms above are accepted. {vm.org.name} is authorized to do the work as described.
          </p>
          <div className="grid gap-6" style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
            {[signer, vm.org.name].map((who, i) => (
              <div key={i}>
                <div style={{ height: 34, borderBottom: "1px solid #2A2A2A", fontFamily: hand, color: "#B3AA9A", fontSize: 13, display: "flex", alignItems: "flex-end" }}>{i === 0 ? "sign here" : ""}</div>
                <div className="flex justify-between" style={{ fontSize: 11, color: "#5E5A52", marginTop: 3 }}><span>{who}</span><span>Date</span></div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

const dustyChip: React.CSSProperties = { border: "1px solid #D97757", color: "#9A4527", background: "#fff", borderRadius: 999, padding: "2px 10px", fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" };
const plainChip: React.CSSProperties = { border: "1px solid #D9CDB6", color: "#5E5A52", background: "#fff", borderRadius: 999, padding: "2px 10px", fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" };

function TemplateTag({ name, starter, edited }: { name: string | null; starter: boolean; edited: boolean }) {
  if (!name && !edited) return null;
  return (
    <span className="sc-no-print" style={{ fontSize: 10.5, border: "1px solid #E6DCC8", borderRadius: 999, padding: "0 8px", color: "#5E5A52" }}>
      {name ? `Template · ${name}` : "Written for this job"}{edited && name ? " · edited here" : ""}
      {starter && <b style={{ color: "#6B4E12", fontWeight: 600 }}> · starter text — check it with your attorney</b>}
    </span>
  );
}

function areaSpec(a: DocArea) {
  const bits: string[] = [];
  if (a.length_ft && a.width_ft) bits.push(`${qtyFmt(a.length_ft)} × ${qtyFmt(a.width_ft)} ft`);
  if (a.count && (a.count_unit ?? "").toUpperCase() === "LF") bits.push(`${qtyFmt(a.count)} LF`);
  else if (a.sqft) bits.push(`${Math.round(a.sqft).toLocaleString("en-US")} sf`);
  else if (a.count) bits.push(`${qtyFmt(a.count)} ${a.count_unit ?? "EA"}`);
  if (a.depth_in) bits.push(`${qtyFmt(a.depth_in)}" thick`);
  if (a.psi) bits.push(`${a.psi} psi`);
  if (a.rebar) bits.push(a.rebar);
  return bits.length ? ` — ${bits.join(" · ")}` : "";
}

function Pricing({ vm, narrow, edits, flip, setD }: { vm: DocVM; narrow: boolean; edits: DocEdits | null; flip: (k: "groupsOff" | "linesOff" | "pricesOff", id: string) => void; setD: (p: Partial<ProposalDisplay>) => void }) {
  const p = vm.priced;
  if (!p.ok) return null;
  const d = vm.display;
  const showQty = d.show_qty === true && !narrow;
  const showItems = d.show_item_prices === true;
  const cols = showQty ? "1fr 70px 90px 100px" : "1fr 110px";
  const addons = new Set(d.addons ?? []);
  const toggleAddon = (id: string) => { const s = new Set(addons); if (s.has(id)) s.delete(id); else s.add(id); setD({ addons: [...s] }); };
  const visibleGroups = p.groups.filter((g) => edits || !g.hidden);
  const rule = "1.5px solid #2A2A2A";
  const money = (n: number, hidden: boolean) => (hidden ? "—" : usd(n));
  return (
    <div className="mt-2">
      <div className="grid items-end" style={{ gridTemplateColumns: cols, borderTop: rule, borderBottom: "1px solid #E6DCC8", padding: "5px 0", fontFamily: disp, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "#8C8578" }}>
        <span>Description</span>
        {showQty && <span style={{ textAlign: "right" }}>Qty</span>}
        {showQty && <span style={{ textAlign: "right" }}>Unit price</span>}
        <span style={{ textAlign: "right" }}>Total</span>
      </div>
      {visibleGroups.map((g) => <GroupRows key={g.key} g={g} cols={cols} showQty={showQty} showItems={showItems} edits={edits} flip={flip} toggleAddon={toggleAddon} money={money} />)}
      <div className="ml-auto mt-3" style={{ width: narrow ? "100%" : 260, borderTop: rule, paddingTop: 6, fontSize: 12.5 }}>
        <Row k="Subtotal" v={usd(p.subtotal)} />
        {p.tax_shown && p.tax > 0 && <Row k="Sales tax · materials" v={usd(p.tax)} />}
        {p.discount > 0 && <Row k="Discount" v={`− ${usd(p.discount)}`} />}
        <div className="flex justify-between items-baseline mt-1"><span style={{ fontWeight: 600 }}>Total</span><span style={{ fontFamily: strong, fontWeight: 700, fontSize: 17, ...nums }}>{usd(p.total)}</span></div>
        {p.addons_total > 0 && <div style={{ fontSize: 11.5, color: "#5E5A52", marginTop: 4 }}>Optional add-ons not included: {usd(p.addons_total)}</div>}
        {!p.tax_shown && p.tax > 0 && <div style={{ fontSize: 11, color: "#8C8578", marginTop: 2 }}>Sales tax included.</div>}
      </div>
    </div>
  );
}

/** Every option side by side: what all of them include, then each option's own lines and its total. */
function Choices({ vm, narrow }: { vm: DocVM; narrow: boolean }) {
  const c = vm.choices!;
  return (
    <div className="mt-2">
      <p style={{ fontSize: 12.5, margin: "0 0 10px", color: "#2A2A2A" }}>
        {c.list.length === 2 ? "Two ways to do the work" : `${c.list.length} ways to do the work`} — pick the one you want.
      </p>
      {c.shared.length > 0 && (
        <div style={{ fontSize: 12, color: "#5E5A52", marginBottom: 10 }}>
          <span style={{ ...kicker, color: "#8C8578" }}>In every option</span>
          <div>{c.shared.join(" · ")}</div>
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: narrow ? "1fr" : `repeat(${Math.min(c.list.length, 3)}, minmax(0, 1fr))` }}>
        {c.list.map((o) => (
          <div key={o.id} style={{ border: "1px solid #E6DCC8", borderTop: "3px solid #B85A3C", borderRadius: 4, padding: "10px 12px", breakInside: "avoid" }}>
            <div style={{ fontFamily: disp, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>{o.label}</div>
            <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 20, margin: "2px 0 6px", ...nums }}>{o.total !== null ? usd(o.total) : "—"}</div>
            {o.blocked && <div className="sc-no-print" style={{ fontSize: 11.5, color: "#8E2B1C" }}>Not priced: {o.blocked}</div>}
            {o.own.length > 0
              ? <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12 }}>{o.own.map((n, i) => <li key={i}>{n}</li>)}</ul>
              : <div style={{ fontSize: 12, color: "#8C8578" }}>{c.shared.length ? "What every option includes." : "—"}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span style={{ color: "#5E5A52" }}>{k}</span><span style={nums}>{v}</span></div>;
}

function GroupRows({ g, cols, showQty, showItems, edits, flip, toggleAddon, money }: {
  g: ProposalGroup; cols: string; showQty: boolean; showItems: boolean; edits: DocEdits | null;
  flip: (k: "groupsOff" | "linesOff" | "pricesOff", id: string) => void; toggleAddon: (id: string) => void; money: (n: number, h: boolean) => string;
}) {
  const allAddon = g.items.length > 0 && g.items.every((i) => i.addon);
  const addonSell = g.items.filter((i) => i.addon && !i.hidden).reduce((a, i) => a + i.sell, 0);
  const items = g.items.filter((i) => edits || !i.hidden);
  return (
    <div style={{ borderBottom: "1px solid #F1E9DA", opacity: g.hidden ? 0.45 : 1 }}>
      <div className="grid items-center" style={{ gridTemplateColumns: cols, padding: "8px 0 4px", position: "relative" }}>
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {edits && <Switch size="sm" on={!g.hidden} onChange={() => flip("groupsOff", g.key)} label={`${g.hidden ? "Show" : "Hide"} ${g.name}`} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
          {allAddon && <span style={{ fontSize: 9.5, border: "1px solid #1E5AA8", color: "#1E5AA8", borderRadius: 3, padding: "0 4px", fontFamily: disp, letterSpacing: ".1em" }}>OPTIONAL ADD-ON</span>}
          {g.sqft ? <span style={{ fontSize: 11, color: "#8C8578" }}>{Math.round(g.sqft).toLocaleString("en-US")} sf</span> : null}
        </div>
        {showQty && <span />}
        {showQty && <span />}
        <div className="flex items-center justify-end gap-1.5">
          <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 13, ...nums }}>{allAddon ? money(addonSell, g.price_hidden) : money(g.sell, g.price_hidden)}</span>
          {edits && <Eye off={g.price_hidden} onClick={() => flip("pricesOff", g.key)} label={g.price_hidden ? "Show this price" : "Hide this price"} />}
        </div>
      </div>
      {items.map((i) => (
        <div key={i.id} className="grid items-center" style={{ gridTemplateColumns: cols, padding: "3px 0 3px 30px", borderTop: "1px dotted #EDE6D8", fontSize: 12, opacity: i.hidden ? 0.45 : 1 }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            {edits && (
              <button type="button" onClick={() => flip("linesOff", i.id)} aria-label={`${i.hidden ? "Show" : "Hide"} ${i.name}`} title={i.hidden ? "Hidden — tap to show" : "Shown — tap to hide"} className="sc-no-print shrink-0"
                style={{ width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${i.hidden ? "#B3AA9A" : "#2F8A5B"}`, background: i.hidden ? "transparent" : "#2F8A5B", padding: 0, cursor: "pointer" }} />
            )}
            <span style={{ minWidth: 0 }}>{i.name}{i.note ? <span style={{ color: "#8C8578" }}> — {i.note}</span> : null}</span>
            {i.addon && !allAddon && <span style={{ fontSize: 9.5, color: "#1E5AA8", fontFamily: disp, letterSpacing: ".1em" }}>ADD-ON</span>}
            {edits && (
              <button type="button" onClick={() => toggleAddon(i.id)} className="sc-no-print" title={i.addon ? "Put it back in the total" : "Offer it as an optional add-on, not in the total"}
                style={{ fontSize: 10, color: "#8C8578", border: 0, background: "transparent", cursor: "pointer", textDecoration: "underline dotted" }}>{i.addon ? "in total" : "optional"}</button>
            )}
          </div>
          {showQty && <span style={{ textAlign: "right", ...nums }}>{qtyFmt(i.qty)} {i.unit}</span>}
          {showQty && <span style={{ textAlign: "right", ...nums }}>{showItems && i.qty ? money(i.sell / i.qty, i.price_hidden) : ""}</span>}
          <div className="flex items-center justify-end gap-1.5">
            <span style={{ ...nums, color: "#5E5A52" }}>{showItems || i.addon ? money(i.sell, i.price_hidden) : "included"}</span>
            {edits && (showItems || i.addon) && <Eye off={i.price_hidden} onClick={() => flip("pricesOff", i.id)} label={i.price_hidden ? "Show this price" : "Hide this price"} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Payments({ vm, edits, narrow }: { vm: DocVM; edits: DocEdits | null; narrow: boolean }) {
  // With every option offered there is no one total: draws are percentages of the option chosen.
  const total = vm.choices ? 0 : vm.priced.ok ? vm.priced.total : 0;
  const draws = vm.draws;
  const c = vm.check;
  const set = (i: number, patch: Partial<Draw>) => edits?.draws(draws.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const pctLeft = Math.max(0, 100 - draws.reduce((a, d) => a + (total ? (drawAmount(d, total) / total) * 100 : d.pct ?? 0), 0));
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" style={{ paddingRight: edits ? 100 : 0 }}>
        <div style={kicker}>Payment schedule</div>
        {edits && c && vm.choices && (c.ok
          ? <span className="sc-no-print" style={{ fontSize: 11.5, color: "#1F5C3A", background: "#DDEEE3", borderRadius: 999, padding: "0 8px" }}>✓ draws total 100%</span>
          : <span className="sc-no-print" style={{ fontSize: 11.5, color: "#8E2B1C", background: "#F7DCD6", borderRadius: 999, padding: "0 8px" }}>⚠ with every option offered, draws are percentages that add up to 100% — now {c.pct}%</span>)}
        {edits && c && !vm.choices && (c.ok
          ? <span className="sc-no-print" style={{ fontSize: 11.5, color: "#1F5C3A", background: "#DDEEE3", borderRadius: 999, padding: "0 8px" }}>✓ draws total {usd(c.sum)}</span>
          : <span className="sc-no-print" style={{ fontSize: 11.5, color: "#8E2B1C", background: "#F7DCD6", borderRadius: 999, padding: "0 8px" }}>⚠ draws total {usd(c.sum)} of {usd(total)}</span>)}
      </div>
      <div className="mt-2" style={{ display: "grid", gap: 6, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {draws.map((d, i) => {
          const amt = total ? drawAmount(d, total) : null;
          return (
            <div key={i} className="flex items-center" style={{ fontSize: 12.5, gap: narrow ? 4 : 8 }}>
              {edits ? (
                <>
                  <span className="sc-print-only" style={{ width: 52, textAlign: "right", ...nums }}>{total && amt !== null ? `${((amt / total) * 100).toFixed(d.amt !== null && d.amt !== undefined ? 1 : 0)}%` : !total && d.pct !== null && d.pct !== undefined ? `${d.pct}%` : ""}</span>
                  <span className="sc-print-only flex-1">{d.when}</span>
                  <span className="sc-print-only" style={{ ...nums, fontWeight: 600 }}>{amt !== null ? usd(amt) : ""}</span>
                  <input aria-label={`Draw ${i + 1} percent`} className="sc-no-print" inputMode="decimal" value={d.amt !== null && d.amt !== undefined ? (total ? ((d.amt / total) * 100).toFixed(1) : "") : d.pct ?? ""}
                    onChange={(e) => set(i, { pct: e.target.value === "" ? null : Number(e.target.value), amt: null })}
                    style={{ width: 44, textAlign: "right", border: "1px solid #E6DCC8", borderRadius: 3, padding: "2px 4px", color: d.amt !== null && d.amt !== undefined ? "#8C8578" : "#2A2A2A" }} />
                  <span className="sc-no-print" style={{ color: "#8C8578" }}>%</span>
                  <input aria-label={`Draw ${i + 1} when`} value={d.when} onChange={(e) => set(i, { when: e.target.value })} className="flex-1 sc-no-print"
                    style={{ minWidth: 0, border: "1px solid #E6DCC8", borderRadius: 3, padding: "2px 6px" }} />
                  <span className="sc-no-print" style={{ color: "#8C8578" }}>$</span>
                  <input aria-label={`Draw ${i + 1} dollars`} className="sc-no-print" inputMode="decimal" value={d.amt !== null && d.amt !== undefined ? d.amt : amt !== null ? amt.toFixed(2) : ""}
                    onChange={(e) => set(i, { amt: e.target.value === "" ? null : Number(e.target.value), pct: e.target.value === "" ? d.pct ?? null : null })}
                    style={{ width: narrow ? 70 : 86, textAlign: "right", border: "1px solid #E6DCC8", borderRadius: 3, padding: "2px 4px", color: d.amt !== null && d.amt !== undefined ? "#2A2A2A" : "#8C8578" }} />
                  <button type="button" aria-label={`Remove draw ${i + 1}`} onClick={() => edits.draws(draws.filter((_, j) => j !== i))} className="sc-no-print"
                    style={{ color: "#8C8578", border: 0, background: "transparent", cursor: "pointer", width: 20 }}>×</button>
                </>
              ) : (
                <>
                  <span style={{ width: 52, textAlign: "right", ...nums }}>{total && amt !== null ? `${((amt / total) * 100).toFixed(d.amt !== null && d.amt !== undefined ? 1 : 0)}%` : !total && d.pct !== null && d.pct !== undefined ? `${d.pct}%` : ""}</span>
                  <span className="flex-1">{d.when}</span>
                  <span style={{ ...nums, fontWeight: 600 }}>{amt !== null ? usd(amt) : ""}</span>
                </>
              )}
            </div>
          );
        })}
        {!draws.length && <div style={{ color: "#8C8578", fontSize: 12.5 }}>No payment schedule.</div>}
        {vm.choices && draws.length > 0 && <div style={{ color: "#5E5A52", fontSize: 11.5 }}>Percentages of the option you choose.</div>}
      </div>
      {edits && (
        <div className="sc-no-print flex gap-2 mt-2 flex-wrap">
          <button type="button" style={plainChip} onClick={() => edits.draws([...draws, { pct: Math.round(pctLeft * 10) / 10, amt: null, when: "" }])}>+ Draw</button>
          {vm.typeDraws.length > 0 && <button type="button" style={plainChip} onClick={() => edits.draws(vm.typeDraws)}>Reset to {vm.typeLabel.toLowerCase()} default</button>}
        </div>
      )}
      {c && !c.ok && vm.priced.ok && !vm.choices && (
        <div className="sc-no-print mt-3" role="alert" style={{ background: "#F7DCD6", border: "1px solid #E7B4A8", color: "#8E2B1C", borderRadius: 4, padding: "10px 12px", fontSize: 12.5 }}>
          <b>Draws don&apos;t add up.</b> {usd0(Math.abs(c.gap))} {c.gap > 0 ? "over" : "short"} · {c.pct.toFixed(1)}% of the proposal. Print and Final are off until they do.
          {edits && (
            <div className="mt-2"><button type="button" onClick={() => edits.draws(fixLastDraw(draws, total))}
              style={{ background: "#8E2B1C", color: "#fff", border: 0, borderRadius: 3, padding: "4px 10px", fontFamily: disp, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Put the difference on the last draw</button></div>
          )}
        </div>
      )}
    </>
  );
}

export { usd, usd0 };
