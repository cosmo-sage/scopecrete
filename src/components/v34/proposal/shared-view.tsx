"use client";
/**
 * The proposal as the customer opens it from their link (migration 075): the
 * same document Coy previews, read-only, built from the link's customer copy
 * (`documents.shown` — no cost side, no hidden lines) and the pictures frozen
 * when it was sent. Nobody signs in. Print / Save as PDF is the browser's.
 * Approve and sign (migration 097) records their signature and wins the job; once signed the page
 * says so and the signature sits on the Sign line.
 */
import React, { useEffect, useState } from "react";
import { ProposalDocument, type DocArea, type DocVM } from "./document";
import { drawsCheck, type ProposalPrice } from "@/lib/proposal";
import type { AreaVisual } from "./area-visuals";
import { SignSheet } from "./sign-sheet";

type Rec = Record<string, unknown>;
interface Shown {
  number: string | null; made_at: string | null; project_type: string | null; type_label: string;
  job: Rec | null; customer: Rec | null; contact: Rec | null; prepared_by?: Rec | null; org: { name: string | null };
  display: DocVM["display"]; draws: DocVM["draws"]; scope_intro: string | null;
  warranty_text: { title?: string; body?: string } | null; terms_text: { title: string | null; clauses: Array<{ h: string; b: string }> };
  sections: Rec[]; price: ProposalPrice; choices: DocVM["choices"];
}
interface Urls { logo: string | null; logo_dark: string | null; cover: string | null; maps: Record<string, string>; photos: Record<string, string[]> }

const money = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 ? 2 : 0 });
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
  type Sig = { name: string | null; at: string | null; image: string | null };
  const [state, setState] = useState<{ vm?: DocVM; gone?: boolean; org?: string | null; own?: boolean; err?: string; sig?: Sig | null; canSign?: boolean } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [signing, setSigning] = useState(false);
  const [reload, setReload] = useState(0);
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
      const vm = vmFromShown(b.shown as Shown, b.urls as Urls);
      const sig = (b.signature ?? null) as Sig | null;
      vm.signature = sig;
      setState({ vm, own: !!b.own, org: b.org_name, sig, canSign: !!b.can_sign });
    }).catch(() => { if (!off) setState({ err: "Couldn't reach the proposal. Check your connection and try again." }); });
    return () => { off = true; };
  }, [token, reload]);

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
      {state.sig && (
        <div className="sc-no-print" role="status" style={{ maxWidth: 720, margin: "0 auto 10px", padding: "10px 12px", background: "#E6F2EA", border: "1px solid #9CC9AE", borderRadius: 4, color: "#1F5C3A", fontSize: 14 }}>
          <b>✓ Signed by {state.sig.name ?? "you"}</b>{state.sig.at ? ` on ${new Date(state.sig.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} (Central)` : ""}.
          {" "}{state.org ?? "Your contractor"} has it — they&apos;ll be in touch to schedule the work. Save as PDF keeps a copy.
        </div>
      )}
      <ProposalDocument vm={state.vm!} edits={null} narrow={narrow} />
      {!state.sig && state.canSign && state.vm?.priced.ok && (
        <div className="sc-no-print" style={{ position: "sticky", bottom: 0, maxWidth: 720, margin: "12px auto 0", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,.96)", borderTop: "1px solid #D9CDB6", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 -4px 14px rgba(0,0,0,.06)" }}>
          {state.own ? (
            <span style={{ flex: 1, fontSize: 13, color: "#5E5A52" }}>Your customer sees <b>Approve and sign</b> here. Signing it wins the job — you can&apos;t sign it for them while signed in.</span>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13.5, color: "#2A2A2A" }}>Ready to go ahead? <b>{money(state.vm.priced.total)}</b></span>
              <button type="button" onClick={() => setSigning(true)}
                style={{ height: 44, padding: "0 18px", border: 0, borderRadius: 6, background: "#2F8A5B", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Approve and sign
              </button>
            </>
          )}
        </div>
      )}
      {signing && <SignSheet token={token} total={state.vm?.priced.ok ? money(state.vm.priced.total) : null}
        onClose={() => setSigning(false)} onSigned={() => { setSigning(false); setReload((n) => n + 1); window.scrollTo({ top: 0 }); }} />}
    </div>
  );
}
