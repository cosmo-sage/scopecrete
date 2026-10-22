"use client";
/**
 * The customer's portal link on their page (migration 123): make it, copy it,
 * put it in their person's thread or an email with the words, see whether
 * they've opened it, turn it off. Not for an onsite estimator.
 */
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { T, relTime } from "@/lib/v34/tokens";
import { PanelCard, SectionHead } from "@/components/v34/record-page";
import { OrgNameContext } from "@/components/v34/primitives";
import { draftKey } from "@/lib/v34/send-proposal";
import { portalMessage } from "@/lib/portal";

interface Link { id: string; url: string; created_at: string; view_count: number; last_viewed_at: string | null }

export function PortalCard({ customerId, customerName, contactId, email }: { customerId: string; customerName: string | null; contactId: string | null; email: string | null }) {
  const router = useRouter();
  const org = useContext(OrgNameContext) ?? "us";
  const [state, setState] = useState<{ supported: boolean; link: Link | null; requests: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const base = `/api/customers/${customerId}/portal`;

  const load = useCallback(() => {
    fetch(base, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && !j.error) setState(j); }).catch(() => {});
  }, [base]);
  useEffect(load, [load]);

  const make = async (): Promise<string | null> => {
    if (state?.link) return state.link.url;
    setBusy(true); setNote(null);
    try {
      const r = await fetch(base, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      load();
      return j.url as string;
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(false); }
  };
  const copy = async () => {
    const url = await make(); if (!url) return;
    try { await navigator.clipboard.writeText(url); setNote("Link copied."); } catch { setNote(url); }
  };
  const words = (url: string) => portalMessage({ customer: customerName, org, url });
  const text = async () => {
    const url = await make(); if (!url || !contactId) return;
    try { localStorage.setItem(draftKey(contactId), JSON.stringify({ channel: "text", text: words(url).body })); } catch { setNote(url); return; }
    router.push(`/dashboard/messages/${contactId}`);
  };
  const mail = async () => {
    const url = await make(); if (!url) return;
    const m = words(url), qs = new URLSearchParams();
    if (contactId) qs.set("contact", contactId);
    if (email) qs.set("to", email);
    qs.set("subject", m.subject); qs.set("body", m.body);
    router.push(`/dashboard/messages/email/new?${qs}`);
  };
  const off = async () => {
    if (!confirm("Turn this link off? The customer will see it's closed. You can make a new one after.")) return;
    setBusy(true);
    await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) }).catch(() => {});
    setBusy(false); setNote("Link turned off."); load();
  };

  if (!state) return null;
  const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer" };
  const l = state.link;
  return (
    <section>
      <SectionHead title="Customer portal" />
      <PanelCard>
        <div style={{ padding: "10px 12px", fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>
          {!state.supported ? "Their own page of proposals and bid requests — waits for migration 123."
            : l ? <>Their page: every proposal you&apos;ve sent them, and a form to send you a bid request with plans.{" "}
                <span style={{ color: T.ink3 }}>{l.view_count ? `Opened ${l.view_count} time${l.view_count === 1 ? "" : "s"}${l.last_viewed_at ? `, last ${relTime(l.last_viewed_at)}` : ""}` : "Not opened yet"}{state.requests ? ` · ${state.requests} request${state.requests === 1 ? "" : "s"} sent` : ""}.</span></>
            : "A page of their own, no login: every proposal you've sent them, and a form to send you a bid request with their plans."}
        </div>
        {state.supported && (
          <div className="flex flex-wrap gap-2" style={{ padding: "0 12px 12px" }}>
            {!l && <button style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: "none" }} disabled={busy} onClick={() => void copy()}>Make the link</button>}
            {l && <button style={btn} disabled={busy} onClick={() => void copy()}>Copy link</button>}
            {contactId && <button style={btn} disabled={busy} onClick={() => void text()}>Text it</button>}
            <button style={btn} disabled={busy} onClick={() => void mail()}>Email it</button>
            {l && <a style={{ ...btn, textDecoration: "none" }} href={l.url} target="_blank" rel="noreferrer">Open ↗</a>}
            {l && <button style={{ ...btn, color: T.red }} disabled={busy} onClick={() => void off()}>Turn off</button>}
          </div>
        )}
        {note && <div style={{ padding: "0 12px 10px", fontSize: 12, color: T.ink3, wordBreak: "break-all" }}>{note}</div>}
      </PanelCard>
    </section>
  );
}
