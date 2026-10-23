"use client";

/**
 * Every time the customer opened the proposal, with its date and time, on the job's Summary and the
 * proposal page (Coy, 2026-10-23) — and on the same list the signing and what they wrote back from
 * the link (migration 127). Rows come from GET /api/jobs/[id]/proposal/link; openingRows() is tested.
 */

import React, { useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { centralStamp, openingRows, type OpeningRow } from "@/lib/proposal-links";

type LinkLike = Parameters<typeof openingRows>[0][number];

export function ProposalOpenings({ links, first = 6 }: {
  links: LinkLike[];
  /** How many rows show before "Show all". */
  first?: number;
}) {
  const rows = openingRows(links);
  const [all, setAll] = useState(false);
  if (!rows.length) return <div style={{ fontSize: F.xs, color: T.ink3 }}>Not opened yet.</div>;
  const opened = rows.filter((r) => r.kind === "opened").length;
  const shown = all ? rows : rows.slice(0, first);
  return (
    <div>
      <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 4 }}>
        Opened {opened === 1 ? "once" : `${opened} times`} · Central time · a link isn&apos;t one person&apos;s, so who opened it isn&apos;t known
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((r, i) => <Row key={`${r.at}-${i}`} r={r} />)}
      </ol>
      {rows.length > first && (
        <button onClick={() => setAll((x) => !x)} style={{ marginTop: 4, fontSize: F.xs, color: T.chalk, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function Row({ r }: { r: OpeningRow }) {
  // A message is a note on the person it was filed on: their thread, at Notes.
  const href = r.contact_id ? `/dashboard/messages/${r.contact_id}?channel=notes` : null;
  const tone = r.kind === "signed" ? T.green : r.kind === "message" ? T.chalk : T.ink2;
  const what = r.kind === "signed" ? "Signed" : r.kind === "message" ? `Message from ${r.name ?? "the customer"}` : "Opened";
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", borderTop: `1px solid ${T.hairSoft}`, fontSize: F.xs, lineHeight: 1.4 }}>
      <span style={{ flex: "0 0 auto", minWidth: 128, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{centralStamp(r.at)}</span>
      <span style={{ flex: 1, minWidth: 0, color: tone }}>
        <b style={{ fontWeight: 600 }}>{what}</b>
        {r.number ? <span style={{ color: T.ink3 }}> · {r.number}</span> : null}
        {r.device ? <span style={{ color: T.ink3 }}> · {r.device}</span> : null}
        {r.kind === "message" && r.body ? (
          <span style={{ display: "block", color: T.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            “{r.body}”{href ? <> <a href={href} style={{ color: T.chalk }}>Answer in their thread ›</a></> : null}
          </span>
        ) : null}
      </span>
    </li>
  );
}
