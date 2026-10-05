"use client";
/**
 * The proposal as the customer opens it from their link (migration 075): the
 * same document Coy previews, read-only, built from the link's customer copy
 * (`documents.shown` — no cost side, no hidden lines) and the pictures frozen
 * when it was sent. Nobody signs in. Print / Save as PDF is the browser's.
 */
import React, { useEffect, useState } from "react";
import { ProposalDocument, type DocArea, type DocVM } from "./document";
import { drawsCheck, type ProposalPrice } from "@/lib/proposal";
import type { AreaVisual } from "./area-visuals";

type Rec = Record<string, unknown>;
interface Shown {
  number: string | null; made_at: string | null; project_type: string | null; type_label: string;
  job: Rec | null; customer: Rec | null; contact: Rec | null; prepared_by?: Rec | null; org: { name: string | null };
  display: DocVM["display"]; draws: DocVM["draws"]; scope_intro: string | null;
  warranty_text: { title?: string; body?: string } | null; terms_text: { title: string | null; clauses: Array<{ h: string; b: string }> };
  sections: Rec[]; price: ProposalPrice; choices: DocVM["choices"];
}
interface Urls { logo: string | null; logo_dark: string | null; cover: string | null; maps: Record<string, string>; photos: Record<string, string[]> }

const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function vmFromShown(sh: Shown, urls: Urls): DocVM {
  const areas: DocArea[] = sh.sections.map((x) => {
    const L = n(x.length_ft), W = n(x.width_ft), o = n(x.sqft_override);
    return { id: String(x.id), name: s(x.name), work_type: s(x.work_type), length_ft: L, width_ft: W, sqft: o ?? (L && W ? L * W : null),
      depth_in: n(x.depth_in), psi: n(x.psi), rebar: s(x.rebar), count: n(x.count_qty), count_unit: s(x.count_unit) };
  });
  const visuals: Record<string, AreaVisual> = {};
  for (const a of areas) {
    const map = urls.maps[a.id] ?? null, photos = urls.photos[a.id] ?? [];
    if (map || photos.length) visuals[a.id] = { map: null, mapImage: map, photos: photos.map((u, i) => ({ id: `${a.id}-${i}`, url: u, name: "" })) };
  }
  const c = sh.customer, k = sh.contact;
  return {
    number: sh.number ?? "", date: sh.made_at ?? new Date().toISOString(), readOnly: true,
    typeKey: sh.project_type, typeLabel: sh.type_label,
    org: { name: sh.org.name ?? "", logo: urls.logo ?? urls.logo_dark, logoOnDark: urls.logo_dark ?? urls.logo },
    preparedBy: sh.prepared_by ? { name: s(sh.prepared_by.name), phone: s(sh.prepared_by.phone), email: s(sh.prepared_by.email) } : null,
    customer: {
      name: s(c?.name) ?? s(k?.name),
      address: s(c?.address_formatted) ?? ([s(c?.address_line1), s(c?.city), s(c?.state)].filter(Boolean).join(", ") || null),
      phone: s(k?.phone), email: s(k?.email),
    },
    job: { title: s(sh.job?.title), address: s(sh.job?.address), description: null },
    coverUrl: urls.cover, scopeIntro: sh.scope_intro, areas, visuals,
    priced: sh.price, choices: sh.choices ?? null, display: sh.display, draws: sh.draws,
    check: sh.price.ok ? drawsCheck(sh.draws, sh.price.total) : null,
    warranty: { title: sh.warranty_text?.title ?? "", body: sh.warranty_text?.body ?? "", template: null, starter: false, edited: false },
    terms: { title: sh.terms_text.title ?? "", clauses: sh.terms_text.clauses, template: null, starter: false, edited: false },
    typeDraws: [],
  };
}

export function SharedProposal({ token }: { token: string }) {
  const [state, setState] = useState<{ vm?: DocVM; gone?: boolean; org?: string | null; own?: boolean; err?: string } | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    let off = false;
    fetch(`/api/p/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (off) return;
      if (!r.ok) { setState({ err: b?.error ?? "This link can't be opened." }); return; }
      if (b.gone) { setState({ gone: true, org: b.org_name }); return; }
      setState({ vm: vmFromShown(b.shown as Shown, b.urls as Urls), own: !!b.own, org: b.org_name });
    }).catch(() => { if (!off) setState({ err: "Couldn't reach the proposal. Check your connection and try again." }); });
    return () => { off = true; };
  }, [token]);

  const box: React.CSSProperties = { maxWidth: 520, margin: "60px auto", padding: "0 16px", fontSize: 15, color: "#2A2A2A", lineHeight: 1.5 };
  if (!state) return <div style={box}>Opening the proposal…</div>;
  if (state.err) return <div style={box}>{state.err}</div>;
  if (state.gone) return <div style={box}><b>This proposal is no longer available.</b><br />{state.org ? `${state.org} may have sent you a newer one — ask them for the latest link.` : "Ask for the latest link."}</div>;
  return (
    <div className="sc-proposal" style={{ fontFamily: "var(--sc-font-body)", minHeight: "100dvh", background: "#E9E4DA", padding: narrow ? "0 0 40px" : "24px 16px 60px" }}>
      <div className="sc-no-print flex items-center gap-2" style={{ maxWidth: 720, margin: "0 auto 10px", padding: narrow ? "10px 12px" : 0, fontSize: 12.5, color: "#5E5A52" }}>
        <span className="flex-1">{state.own ? "Your own view — opening it here isn't counted as the customer's." : `From ${state.org ?? "your contractor"}`}</span>
        <button type="button" onClick={() => window.print()} style={{ height: 30, padding: "0 12px", border: "1px solid #C9BDA6", borderRadius: 3, background: "#fff", color: "#2A2A2A", fontSize: 12.5, cursor: "pointer" }}>Save as PDF</button>
      </div>
      <ProposalDocument vm={state.vm!} edits={null} narrow={narrow} />
    </div>
  );
}
