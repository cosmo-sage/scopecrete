"use client";

/**
 * One person — v34's CustomerScreen, cut to what the data can back: who they
 * are, what they are to the business, their numbers, their jobs, and a way
 * into the conversation. No lifetime value (there are no invoices), no
 * activity feed of invented events.
 *
 * Classifying is a human confirmation (DECISIONS §2b), and a confirmed vendor
 * or sub stops new leads being created for this contact. The buttons say so
 * before they are tapped.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, Badge } from "@/components/v34/primitives";

interface Detail {
  contact_id: string; name: string | null; name_confirmed: boolean; numbers: string[];
  email: string | null; address: string | null;
  relation: "customer" | "vendor" | "sub" | "unclassified"; relation_confirmed_at: string | null;
  jobs: { id: string; title: string | null; status: string | null }[];
}

const LABEL = { customer: "Customer", vendor: "Vendor", sub: "Sub", unclassified: "Unclassified" } as const;

async function getDetail(id: string): Promise<Detail & { redirect_to?: string }> {
  const r = await fetch(`/api/customers/${id}`);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export default function CustomerPage() {
  const { contactId } = useParams<{ contactId: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const apply = useCallback((b: Detail & { redirect_to?: string }) => {
    if (b.redirect_to) { router.replace(`/dashboard/customers/${b.redirect_to}`); return; }
    setD(b);
  }, [router]);

  useEffect(() => {
    let off = false;
    getDetail(contactId).then((b) => { if (!off) apply(b); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [contactId, apply]);

  async function classify(relation: string | null) {
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/customers/${contactId}/relation`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relation }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setNote(b.customer_created ? "Saved — a customer record was created for this contact." : "Saved.");
      apply(await getDetail(contactId));
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function newScope() {
    setBusy(true);
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: contactId }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (error) return <EmptyState tone="warn" title="Couldn't load this person" detail={error} />;
  if (!d) return <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 60, background: T.hairSoft }} />)}</div>;

  const title = d.name ?? formatPhone(d.numbers[0] ?? null);
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}` };

  return (
    <div className="pb-6" style={{ color: T.ink }}>
      <div className="px-3 pt-2.5 pb-2.5" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <Link href="/dashboard/customers" className="lg:hidden no-underline" style={{ ...eyebrow, color: T.ink2 }}>‹ Customers</Link>
        <div className="flex items-start gap-2 mt-0.5">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, ...clip }}>{title}</div>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>
              {d.name ? (d.name_confirmed ? "Name confirmed by you" : "Name not confirmed") : "No name on file"}
            </div>
          </div>
          <span style={{ ...eyebrow, color: d.relation === "unclassified" ? T.hiviz : T.ink, fontSize: F.xs }}>{LABEL[d.relation]}</span>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <Link href={`/dashboard/messages/${d.contact_id}`} className="rounded px-3 inline-flex items-center no-underline"
            style={{ height: 32, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Open thread
          </Link>
          {d.numbers[0] && (
            <a href={`tel:${d.numbers[0]}`} className="rounded px-3 inline-flex items-center no-underline"
              style={{ height: 32, border: `1px solid ${T.hair}`, color: T.ink, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Call
            </a>
          )}
        </div>
      </div>

      <div className="p-2.5 space-y-2.5 lg:max-w-[760px]">
        {/* ---- what they are ---- */}
        <section className="rounded px-3 py-2.5" style={card}>
          <div style={eyebrow}>What they are to the business</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {(["customer", "vendor", "sub"] as const).map((k) => {
              const on = d.relation === k;
              return (
                <button key={k} disabled={busy || on} onClick={() => void classify(k)} className="rounded px-3"
                  style={{ height: 34, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? "#fff" : T.ink,
                           fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".06em", cursor: on ? "default" : "pointer" }}>
                  {LABEL[k]}
                </button>
              );
            })}
            {d.relation !== "unclassified" && (
              <button disabled={busy} onClick={() => void classify(null)}
                style={{ ...eyebrow, color: T.ink2, cursor: "pointer", marginLeft: 4 }}>Clear</button>
            )}
          </div>
          <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginTop: 6 }}>
            {d.relation === "unclassified"
              ? "Unclassified — nobody has said. New calls and texts from them still create a lead."
              : `Confirmed ${d.relation_confirmed_at ? new Date(d.relation_confirmed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}.`}
            {" "}Marking someone a vendor or sub stops new leads being created for them; a lead already open stays.
          </div>
          {note && <div style={{ fontSize: F.xs, color: note.startsWith("Saved") ? T.green : T.red, marginTop: 4 }}>{note}</div>}
        </section>

        {/* ---- how to reach them ---- */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-3 pt-2.5" style={eyebrow}>Contact</div>
          {[
            [d.numbers.length > 1 ? "Numbers" : "Number", d.numbers.map(formatPhone).join(", ") || null],
            ["Email", d.email],
            ["Address", d.address],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2 flex items-baseline gap-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              <span style={{ fontSize: F.sm, color: T.ink2 }}>{k}</span>
              <span className="flex-1" />
              <span style={{ fontSize: F.sm, fontWeight: 600, color: v ? T.ink : T.ink3, textAlign: "right", ...nums }}>{v ?? "Not recorded"}</span>
            </div>
          ))}
        </section>

        {/* ---- their work ---- */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-3 pt-2.5 pb-1 flex items-center">
            <span style={eyebrow}>Jobs</span>
            <span className="flex-1" />
            <button disabled={busy} onClick={() => void newScope()} style={{ ...eyebrow, color: T.hiviz, cursor: "pointer" }}>+ New scope</button>
          </div>
          {d.jobs.length === 0 ? (
            <div className="px-3 pb-2.5" style={{ fontSize: F.sm, color: T.ink3 }}>No jobs yet.</div>
          ) : d.jobs.map((j) => (
            <Link key={j.id} href={`/dashboard/scope/${j.id}`} className="px-3 py-2 flex items-center gap-2 no-underline"
              style={{ borderTop: `1px solid ${T.hairSoft}`, color: T.ink }}>
              <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, flex: 1, ...clip }}>{j.title || "Untitled scope"}</span>
              {j.status && <Badge s={j.status} />}
            </Link>
          ))}
        </section>

        <section className="rounded px-3 py-2.5" style={card}>
          <div style={eyebrow}>Money</div>
          <div style={{ fontSize: F.sm, color: T.ink3, marginTop: 2 }}>
            Nothing recorded. Invoices and payments hang off a job, and none exist yet.
          </div>
        </section>
      </div>
    </div>
  );
}
