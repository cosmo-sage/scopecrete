"use client";
/**
 * A final proposal in the Files page's preview panel (Coy, 2026-10-10): the
 * document as it was sent, read only, from its frozen snapshot, with a
 * button to the proposal page itself. Area maps and photos are left to the
 * proposal page, which draws them from the plans.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ProposalDocument, type DocArea, type DocVM } from "./document";
import { drawsCheck } from "@/lib/proposal";
import { T, F } from "@/lib/v34/tokens";

type Rec = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function areasOf(rows: Rec[]): DocArea[] {
  return rows.map((s) => {
    const L = n(s.length_ft), W = n(s.width_ft), o = n(s.sqft_override);
    return { id: String(s.id), name: str(s.name), work_type: str(s.work_type), length_ft: L, width_ft: W,
      sqft: o ?? (L && W ? L * W : null), depth_in: n(s.depth_in), psi: n(s.psi), rebar: str(s.rebar),
      count: n(s.count_qty), count_unit: str(s.count_unit), scope: str(s.prep_notes) ?? str(s.scope) };
  });
}

interface Resp {
  proposal: { id: string; job_id: string; version: number; project_type: string | null; snapshot: Rec };
  type_label: string;
  org: { name: string; logo_light: boolean; logo_dark: boolean; logo_stamp: string | null } | null;
  cover_url: string | null;
}

export function vmFromFinal(r: Resp): DocVM {
  const snap = r.proposal.snapshot as Rec & {
    number: string; made_at: string; job: Rec; customer: Rec | null; contact: Rec | null; org: { name: string } | null; prepared_by?: Rec | null;
    display: DocVM["display"]; draws: DocVM["draws"]; scope_intro: string | null; sections: Rec[]; price: DocVM["priced"]; choices?: DocVM["choices"];
    warranty_text: { title: string; body: string; template: { name: string } | null; starter: boolean; edited: boolean };
    terms_text: { title: string; clauses: DocVM["terms"]["clauses"]; template: { name: string } | null; starter: boolean; edited: boolean };
  };
  const o = r.org, stamp = o?.logo_stamp ? `?v=${encodeURIComponent(o.logo_stamp)}` : "";
  const light = o?.logo_light ? `/api/org/logo/light${stamp}` : null, dark = o?.logo_dark ? `/api/org/logo/dark${stamp}` : null;
  const cust = snap.customer, cont = snap.contact, by = snap.prepared_by ?? null;
  return {
    number: snap.number, date: snap.made_at, readOnly: true, typeKey: r.proposal.project_type, typeLabel: r.type_label,
    org: { name: snap.org?.name ?? o?.name ?? "", logo: light ?? dark, logoOnDark: dark ?? light },
    preparedBy: by ? { name: str(by.name), phone: str(by.phone), email: str(by.email) } : null,
    customer: {
      name: str(cust?.name) ?? str(cont?.name),
      address: str(cust?.address_formatted) ?? ([str(cust?.address_line1), str(cust?.city), str(cust?.state)].filter(Boolean).join(", ") || null),
      phone: str(cont?.phone), email: str(cont?.email), person: str(cont?.name),
    },
    job: { title: str(snap.job?.title), address: str(snap.job?.address), description: null },
    coverUrl: r.cover_url, scopeIntro: snap.scope_intro, areas: areasOf(snap.sections ?? []), visuals: {},
    priced: snap.price, choices: snap.choices ?? null, display: snap.display ?? {}, draws: snap.draws ?? [],
    check: snap.choices ? { sum: 100, gap: 0, ok: true, pct: 100 } : snap.price?.ok ? drawsCheck(snap.draws ?? [], snap.price.total) : null,
    warranty: { ...snap.warranty_text, template: snap.warranty_text?.template?.name ?? null },
    terms: { ...snap.terms_text, template: snap.terms_text?.template?.name ?? null },
    typeDraws: [],
  };
}

export function FinalProposalPreview({ id, jobId, version }: { id: string; jobId: string; version: number }) {
  const [got, setGot] = useState<{ id: string; vm: DocVM | null; err: string | null } | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/proposals/final/${id}`)
      .then(async (res) => { const b = await res.json().catch(() => ({})); if (!res.ok) throw new Error(b.error ?? "Couldn't open the proposal."); return b as Resp; })
      .then((b) => { if (!off) setGot({ id, vm: vmFromFinal(b), err: null }); })
      .catch((e) => { if (!off) setGot({ id, vm: null, err: e instanceof Error ? e.message : String(e) }); });
    return () => { off = true; };
  }, [id]);
  const cur = got?.id === id ? got : null;
  return (
    <div>
      <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <Link href={`/dashboard/scope/${jobId}/proposal?v=${version}`} className="inline-flex items-center rounded px-3 no-underline"
          style={{ height: 32, background: T.ink, color: T.card, fontSize: F.sm, fontWeight: 600 }}>Open the proposal page ›</Link>
      </div>
      {!cur && <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>Opening the proposal…</div>}
      {cur?.err && <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.red }}>{cur.err}</div>}
      {cur?.vm && (
        <div style={{ background: "#fff", color: "#2A2A2A" }}>
          <ProposalDocument vm={cur.vm} edits={null} narrow />
        </div>
      )}
    </div>
  );
}
