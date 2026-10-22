"use client";
/**
 * The proposal's cover as a full sheet (Coy, 2026-10-22: "I'd like the cover to be built into the
 * proposal itself and fill a full sheet of paper when printed out"). Drawn here from the job, not a
 * picture: a picture in the old photo strip was cropped to the strip's shape, which differs on a
 * desktop, a phone and paper. Letter-size on screen (8.5 × 11, every size in cqw so it scales), and
 * its own page in print with no margin (`@page cover`, v34-shell.css).
 *
 * Two looks from the Sacco cover mockup (/mnt/project-files/proposal-builder/): Field — logo on white,
 * the job photo slanted, estimate and customer under it; Pour — a dark sheet, the photo cut on the
 * diagonal with an accent edge, the job's name as the headline. Colours and the owner's own words are
 * the proposal's (display.cover); nothing here prices anything.
 */
import React from "react";
import { siteFonts } from "@/components/site/fonts";
import { formatPhone } from "@/lib/v34/tokens";
import { COVER_COLORS, COVER_STYLES, coverOf, type ProposalCover } from "@/lib/proposal";
import type { DocEdits, DocVM } from "./document";

const DISP = "var(--site-disp), 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const BODY = "var(--site-body), 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";

/** The job photo, or with none a quiet hatched field in the sheet's dark colour (and a pick button while editing). */
function Photo({ vm, edits, dark }: { vm: DocVM; edits: DocEdits | null; dark: string }) {
  if (vm.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- signed link, printed
    return <img src={vm.coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(135deg, ${dark} 0 1.6cqw, color-mix(in srgb, ${dark} 86%, #fff) 1.6cqw 1.9cqw)` }}>
      {edits && (
        <button type="button" onClick={edits.pickCover} className="sc-no-print"
          style={{ position: "absolute", inset: 0, width: "100%", border: 0, background: "transparent", color: "#fff", fontFamily: DISP, fontWeight: 600, fontSize: "3cqw", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer" }}>
          + Pick a cover photo from the job&apos;s files
        </button>
      )}
    </div>
  );
}

const ONE_LINE: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function CoverPage({ vm, edits, kind, dateStr }: { vm: DocVM; edits: DocEdits | null; kind: string; dateStr: string }) {
  const c = coverOf(vm.display);
  const set = (patch: Partial<ProposalCover>) => edits?.display({ ...vm.display, cover: { ...c, ...patch } });
  const who = vm.customer.person ?? vm.customer.name ?? "Customer";
  const site = vm.job.address ?? vm.customer.address;
  const by = vm.preparedBy?.name ?? vm.org.name;
  const phone = vm.preparedBy?.phone ? formatPhone(vm.preparedBy.phone) : null;
  const lines = c.lines.filter((l) => l.trim());
  // Field's headline is one short word; Pour's eyebrow carries the full kind.
  const prelim = vm.display.preliminary === true;
  const word = prelim ? "Estimate" : vm.typeKey === "public" ? "Bid" : "Proposal";
  const sheet: React.CSSProperties = { containerType: "inline-size", aspectRatio: "8.5 / 11", width: "100%", position: "relative", overflow: "hidden", fontFamily: BODY } as React.CSSProperties;

  return (
    <div className={siteFonts}>
      {edits && <CoverControls c={c} set={set} pickCover={edits.pickCover} hasPhoto={!!vm.coverUrl} />}
      {c.style === "field" ? (
        <div className="sc-cover-sheet" style={{ ...sheet, background: "#fff", color: "#16202B" }}>
          <div style={{ position: "absolute", inset: "0 0 auto", height: "17%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4cqw", padding: "0 7cqw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed redirect, printed */}
            {vm.org.logo ? <img src={vm.org.logo} alt={vm.org.name} style={{ maxWidth: "48cqw", maxHeight: "11cqw", objectFit: "contain" }} />
              : <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: "6cqw", color: c.dark }}>{vm.org.name}</div>}
            {c.tag && <div style={{ fontFamily: DISP, fontWeight: 700, color: c.dark, fontSize: "2.6cqw", letterSpacing: ".14em", textTransform: "uppercase", textAlign: "right" }}>{c.tag}</div>}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: "17%", height: "50%", clipPath: "polygon(0 0,100% 0,100% 84%,0 100%)", overflow: "hidden" }}>
            <Photo vm={vm} edits={edits} dark={c.dark} />
          </div>
          <div style={{ position: "absolute", right: 0, bottom: 0, width: "49%", height: "22.4%", background: c.accent, clipPath: "polygon(100% 0,100% 5%,6% 100%,0 100%)" }} />
          <div style={{ position: "absolute", right: 0, bottom: 0, width: "42%", height: "19%", background: c.dark, clipPath: "polygon(100% 0,100% 100%,0 100%)" }} />
          <div style={{ position: "absolute", left: "7cqw", right: "7cqw", top: "71%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5cqw" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: DISP, fontWeight: 700, color: c.dark, fontSize: "8.4cqw", lineHeight: 0.9, textTransform: "uppercase" }}>{word}</div>
              <div style={{ fontSize: "2.3cqw", color: "#5E6875", marginTop: "1.4cqw", letterSpacing: ".08em", textTransform: "uppercase" }}>{prelim ? "Preliminary · " : ""}{dateStr}</div>
              <div style={{ fontSize: "2.6cqw", fontWeight: 600, marginTop: "2cqw", lineHeight: 1.35 }}>{vm.job.title || "Concrete work"}</div>
              <div style={{ width: "6cqw", height: ".9cqw", background: c.accent, marginTop: "3cqw" }} />
            </div>
            <div style={{ minWidth: 0, borderLeft: ".25cqw solid #D9DEE5", paddingLeft: "5cqw" }}>
              <div style={{ fontFamily: DISP, fontWeight: 700, color: c.dark, fontSize: "4.6cqw", lineHeight: 1.05, letterSpacing: ".04em", textTransform: "uppercase" }}>{who}</div>
              {site && <div style={{ fontSize: "2.6cqw", lineHeight: 1.45, color: "#5E6875", marginTop: "1.6cqw" }}>{site}</div>}
            </div>
          </div>
          <div style={{ position: "absolute", left: "7cqw", bottom: "5cqw", maxWidth: "44cqw", fontSize: "2.1cqw", color: "#5E6875", lineHeight: 1.5 }}>
            {word} <b style={{ fontWeight: 600, color: c.dark }}>{vm.number}</b><br />{by}{phone ? ` · ${phone}` : ""}
          </div>
        </div>
      ) : (
        <div className="sc-cover-sheet" style={{ ...sheet, background: c.dark, color: "#EEF2F7" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "63%", background: c.accent, clipPath: "polygon(0 95.2%,100% 78.1%,100% 80.6%,0 97.7%)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "60%", clipPath: "polygon(0 0,100% 0,100% 82%,0 100%)", overflow: "hidden" }}>
            <Photo vm={vm} edits={edits} dark={c.dark} />
          </div>
          <div style={{ position: "absolute", top: 0, left: "7cqw", background: c.dark, padding: "4cqw 4.5cqw 3.6cqw", borderBottom: `.9cqw solid ${c.accent}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed redirect, printed */}
            {vm.org.logoOnDark ? <img src={vm.org.logoOnDark} alt={vm.org.name} style={{ display: "block", maxWidth: "38cqw", maxHeight: "10cqw", objectFit: "contain" }} />
              : <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: "5cqw", color: "#fff" }}>{vm.org.name}</div>}
          </div>
          <div style={{ position: "absolute", left: "7cqw", right: "7cqw", top: "63%", bottom: "6cqw", display: "flex", flexDirection: "column", gap: "3cqw" }}>
            <div style={{ minHeight: 0, overflow: "hidden" }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, color: c.accent, fontSize: "3cqw", letterSpacing: ".22em", textTransform: "uppercase" }}>{kind} · {vm.number}</div>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: (vm.job.title ?? "").length > 30 ? "6.6cqw" : "9.5cqw", lineHeight: 0.92, margin: "1.4cqw 0 0", color: "#fff", textWrap: "balance" } as React.CSSProperties}>{vm.job.title || "Concrete work"}</div>
            <div style={{ marginTop: "2cqw", fontSize: "2.5cqw", lineHeight: 1.5, color: "color-mix(in srgb, #fff 72%, transparent)" }}>
              <div style={ONE_LINE}>Prepared for <strong style={{ color: "#fff", fontWeight: 600 }}>{who}</strong>{site ? ` · ${site}` : ""}</div>
              <div style={ONE_LINE}>Prepared by <strong style={{ color: "#fff", fontWeight: 600 }}>{by}</strong>{phone ? ` · ${phone}` : ""} · {dateStr}</div>
            </div>
            </div>
          {lines.length > 0 && (
            <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: `repeat(${lines.length}, 1fr)`, borderTop: ".25cqw solid rgba(255,255,255,.18)", paddingTop: "2.4cqw", gap: "3cqw" }}>
              {lines.map((l, i) => (
                <div key={i} style={{ fontFamily: DISP, fontWeight: 600, fontSize: "2.7cqw", letterSpacing: ".06em", textTransform: "uppercase", lineHeight: 1.25, color: "#DCE3EC" }}>
                  <i style={{ display: "block", width: "4cqw", height: ".7cqw", background: c.accent, marginBottom: "1.6cqw" }} />{l}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

const lab: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#8C8578", fontWeight: 600 };
const inp: React.CSSProperties = { border: "1px solid #E6DCC8", borderRadius: 4, padding: "4px 7px", fontSize: 12, background: "#fff", color: "#2A2A2A", minWidth: 0 };

/** Above the sheet while editing, never printed: the look, its colours, the photo and the owner's words. */
export function CoverControls({ c, set, pickCover, hasPhoto }: { c: ReturnType<typeof coverOf>; set: (p: Partial<ProposalCover>) => void; pickCover: () => void; hasPhoto: boolean }) {
  return (
    <div className="sc-no-print" style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", padding: "10px 12px", paddingRight: 120, background: "#FBF6EC", borderBottom: "1px solid #E6DCC8", fontSize: 12 }}>
      <div className="flex items-center gap-1.5">
        <span style={lab}>Cover</span>
        {COVER_STYLES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => set({ style: k })} aria-pressed={c.style === k}
            style={{ border: `1px solid ${c.style === k ? "#B85A3C" : "#E6DCC8"}`, background: c.style === k ? "#F6E2D8" : "#fff", color: "#2A2A2A", borderRadius: 999, padding: "2px 10px", fontSize: 12, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      {c.style !== "strip" && (
        <div className="flex items-center gap-1.5">
          <span style={lab}>Colors</span>
          {COVER_COLORS.map((p) => {
            const on = p.dark === c.dark && p.accent === c.accent;
            return (
              <button key={p.name} type="button" title={p.name} aria-label={p.name} aria-pressed={on} onClick={() => set({ dark: p.dark, accent: p.accent })}
                style={{ width: 22, height: 22, borderRadius: 999, padding: 0, cursor: "pointer", border: on ? "2px solid #2A2A2A" : "1px solid #D9CDB6", background: `linear-gradient(135deg, ${p.dark} 0 55%, ${p.accent} 55% 100%)` }} />
            );
          })}
          <input type="color" aria-label="Dark color" title="Dark color" value={c.dark} onChange={(e) => set({ dark: e.target.value })} style={{ width: 24, height: 22, padding: 0, border: 0, background: "transparent", cursor: "pointer" }} />
          <input type="color" aria-label="Accent color" title="Accent color" value={c.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 24, height: 22, padding: 0, border: 0, background: "transparent", cursor: "pointer" }} />
        </div>
      )}
      <button type="button" onClick={pickCover} style={{ border: "1px solid #E6DCC8", background: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, cursor: "pointer", color: "#2A2A2A" }}>
        {hasPhoto ? "Change photo" : "+ Cover photo"}
      </button>
      {c.style === "field" && (
        <label className="flex items-center gap-1.5" style={{ flex: "1 1 220px" }}>
          <span style={lab}>By the logo</span>
          <input style={{ ...inp, flex: 1 }} maxLength={60} value={c.tag} placeholder="License no., Licensed & insured…" onChange={(e) => set({ tag: e.target.value })} />
        </label>
      )}
      {c.style === "pour" && (
        <div className="flex items-center gap-1.5 flex-wrap" style={{ flex: "1 1 100%" }}>
          <span style={lab}>Along the foot</span>
          {[0, 1, 2].map((i) => (
            <input key={i} style={{ ...inp, flex: "1 1 120px" }} maxLength={48} value={c.lines[i]} placeholder={["Residential · Commercial", "Licensed & insured", "Concrete is all we do"][i]}
              aria-label={`Foot line ${i + 1}`} onChange={(e) => { const next = [...c.lines]; next[i] = e.target.value; set({ lines: next }); }} />
          ))}
        </div>
      )}
    </div>
  );
}
