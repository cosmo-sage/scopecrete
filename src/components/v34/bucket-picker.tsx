"use client";

/**
 * The bucket picker — Customer · Vendor · Personal · Spam, and the types under
 * each. One component for every place Coy files a person: the Threads row, the
 * plain conversation page, and the customer / vendor page (Coy, 2026-09-28:
 * "this is a vendor but there is no way to change this from within the
 * contact page"). PATCH /api/contacts/[id]/bucket does the writing.
 */

import React from "react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";

export type Bucket = "customer" | "vendor" | "personal" | "spam";
export type Subtype = { bucket: Bucket; slug: string; label: string };

/** What the picker needs to know about the person. */
export interface PickTarget {
  bucket: Bucket | null;
  subtype?: string | null;
  /** Set when Dusty filed them himself: offers Keep / Not X instead. */
  bucket_auto?: { reason: string | null } | null;
  /** Dusty's latest guess, drawn dashed. */
  proposal?: { classification: string } | null;
}

export const BUCKETS: Array<{ k: Bucket; l: string; c: string }> = [
  { k: "customer", l: "Customer", c: T.green },
  { k: "vendor", l: "Vendor", c: T.chalk },
  { k: "personal", l: "Personal", c: T.violet },
  { k: "spam", l: "Spam", c: T.red },
];

/** Dusty's classification, as the bucket it points at. */
export const SUGGESTS: Record<string, Bucket> = {
  customer: "customer", vendor: "vendor", sub: "vendor", personal: "personal", spam: "spam",
};

/**
 * One tap to sort a person. Dusty's guess is outlined; the confirmed bucket is
 * solid. After a bucket, the types under it (from org_contact_subtypes) are one
 * more optional tap. Filing someone as a vendor or sub also stops quo-intake
 * making leads for them (sc_classify_contact keeps the lead guard in step).
 */
export function BucketPicker({ t, busy, subtypes, onPick }: {
  t: PickTarget; busy: boolean; subtypes: Subtype[];
  onPick: (bucket: Bucket | null, subtype?: string | null) => void;
}) {
  const guess = !t.bucket && t.proposal ? SUGGESTS[t.proposal.classification] ?? null : null;
  const guessSub = guess === "vendor" && t.proposal?.classification === "sub" ? "subcontractor" : null;
  const types = t.bucket ? subtypes.filter((x) => x.bucket === t.bucket) : [];
  const chip = (on: boolean, hint: boolean, colour: string): React.CSSProperties => ({
    height: 30, padding: "0 11px", borderRadius: 3, fontFamily: disp, fontSize: F.sm,
    letterSpacing: ".04em", textTransform: "uppercase", cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.5 : 1,
    border: `1.5px ${hint ? "dashed" : "solid"} ${on || hint ? colour : T.hair}`,
    background: on ? colour : T.card, color: on ? "#fff" : hint ? colour : T.ink2,
  });

  if (t.bucket_auto && t.bucket) {
    const name = BUCKETS.find((b) => b.k === t.bucket)?.l.toLowerCase() ?? t.bucket;
    return (
      <div className="mt-2 rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: 10 }}>
        <div style={{ ...eyebrow, color: T.chalk }}>Filed as {name} by Dusty</div>
        {t.bucket_auto.reason && (
          <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 5, paddingLeft: 8, borderLeft: `2px solid ${T.chalk}`, fontStyle: "italic" }}>
            “{t.bucket_auto.reason.length > 200 ? `${t.bucket_auto.reason.slice(0, 200)}…` : t.bucket_auto.reason}”
          </div>
        )}
        <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
          <button disabled={busy} style={chip(true, false, T.ink)} onClick={() => onPick(t.bucket!, t.subtype ?? null)}>Keep as {name}</button>
          <button disabled={busy} style={chip(false, false, T.ink)} onClick={() => onPick(null)}>Not {name}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div style={{ ...eyebrow, color: T.ink3, marginBottom: 4 }}>
        {t.bucket ? "Filed as" : guess ? `Dusty thinks ${BUCKETS.find((b) => b.k === guess)?.l.toLowerCase()} — tap to file` : "What are they?"}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {BUCKETS.map((b) => (
          <button key={b.k} disabled={busy} style={chip(t.bucket === b.k, guess === b.k, b.c)}
            onClick={() => onPick(t.bucket === b.k ? null : b.k, t.bucket === b.k ? null : guess === b.k ? guessSub : null)}>
            {b.l}
          </button>
        ))}
      </div>
      {types.length > 0 && (
        <div className="flex gap-1 flex-wrap" style={{ marginTop: 6 }}>
          {types.map((x) => (
            <button key={x.slug} disabled={busy} onClick={() => onPick(t.bucket, t.subtype === x.slug ? null : x.slug)}
              className="rounded-full px-2.5"
              style={{ height: 26, fontSize: F.xs, cursor: "pointer", border: `1px solid ${t.subtype === x.slug ? T.ink : T.hair}`,
                       background: t.subtype === x.slug ? T.ink : T.card, color: t.subtype === x.slug ? "#fff" : T.ink2 }}>
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
