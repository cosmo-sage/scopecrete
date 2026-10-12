"use client";
/**
 * "Specs — read by Dusty" on the job's Summary (Coy, 2026-10-12: "the concrete
 * specs consolidated into a new file called Specs - read by dusty … added to the
 * summary page of the job"). The digest file (specs-digest.ts) with what Dusty
 * made of it, and a button to make it — or make it again after a new addendum.
 * Shown when the job has a spec book or a digest.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { sizeLabel } from "@/lib/files";

type Digest = { id: string; name: string; byte_size: number | null; note: string | null; page_count: number | null; read_state: string | null; read_at: string | null; read_error: string | null; summary: string | null; facts: Record<string, unknown> | null; created_at: string };
type Book = { id: string; name: string; byte_size: number | null; read_state: string | null; read_error: string | null };

export function SpecsCard({ jobId, card }: { jobId: string; card: React.CSSProperties }) {
  const [data, setData] = useState<{ digest: Digest | null; books: Book[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let off = false;
    fetch(`/api/jobs/${jobId}/specs`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && b) setData(b); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, tick]);

  const d = data?.digest ?? null;
  const reading = !!d && (d.read_state === "waiting" || d.read_state === "reading");
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [reading, load]);

  const make = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/specs`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setErr(b.error ?? "Couldn't make it.");
      load();
    } catch {
      setErr("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!data || (!d && !data.books.length)) return null;
  const skipped = data.books.filter((b) => b.read_state === "skipped" || b.read_state === "failed");
  const facts = d?.facts ? Object.entries(d.facts).filter(([k, v]) => !["prompt", "dropped", "price_lines", "vendor_details"].includes(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length)) : [];
  const btn: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.ink}`, background: d ? T.card : T.ink, color: d ? T.ink : T.card, fontFamily: disp, fontSize: F.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", cursor: busy ? "wait" : "pointer", flexShrink: 0 };

  return (
    <section aria-label="Specs read by Dusty" style={card}>
      <div className="flex items-center gap-2">
        <div style={{ ...eyebrow, flex: 1 }}>Specs — read by Dusty</div>
        <button onClick={() => void make()} disabled={busy} style={btn}>{busy ? "Copying…" : d ? "Make it again" : "Make it"}</button>
      </div>

      {busy && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 6 }}>Opening the spec book and copying its concrete pages — a big book takes a minute or two.</div>}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}

      {d ? (
        <div style={{ marginTop: 6 }}>
          <Link href={`/dashboard/files?file=${d.id}`} style={{ fontSize: F.sm, fontWeight: 600, color: T.chalk }}>{d.name}</Link>
          <span style={{ fontSize: F.xs, color: T.ink3 }}> · {sizeLabel(d.byte_size)}</span>
          {d.note && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2, lineHeight: 1.4 }}>{d.note}</div>}
          <div style={{ fontSize: F.xs, color: d.read_state === "failed" || d.read_state === "skipped" ? T.red : T.ink3, marginTop: 4 }}>
            {d.read_state === "read" ? "Read by Dusty" : d.read_state === "reading" ? "Dusty is reading it now…" : d.read_state === "waiting" ? "Waiting for Dusty to read it — within a minute or two" : `Not read: ${d.read_error ?? d.read_state ?? "—"}`}
          </div>
          {d.summary && <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.45, marginTop: 6 }}>{d.summary}</div>}
          {facts.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: F.xs, color: T.ink2, lineHeight: 1.5 }}>
              {facts.map(([k, v]) => <li key={k}><b>{k.replace(/_/g, " ")}:</b> {Array.isArray(v) ? v.map(String).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 6, lineHeight: 1.45 }}>
          {skipped.length
            ? `${skipped.map((b) => `${b.name} (${sizeLabel(b.byte_size)})`).join(", ")} ${skipped.length === 1 ? "was" : "were"} too big for Dusty to read whole. Make it copies the concrete pages into one file he can read.`
            : "Copy the spec book's concrete pages into one short file for Dusty."}
        </div>
      )}
    </section>
  );
}
