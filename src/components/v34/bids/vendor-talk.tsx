"use client";
/**
 * Coy's side of one vendor's bid link, under their row on the job's bid request and on the vendor
 * page's Bid requests (migration 130): the weeks they said they could do it — with the ones that
 * match the weeks Coy asked for — and **Chat**, the messages on that link.
 */
import React, { useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { sharedWeeks, weeksSummary } from "@/lib/bid-weeks";
import { BidChat } from "./bid-chat";

export interface TalkRec { id: string; availability?: unknown; availability_note?: string | null; availability_at?: string | null; revoked_at?: string | null }

export function availabilityLine(rec: TalkRec, wanted: string[]): { text: string; good: boolean } | null {
  const have = Array.isArray(rec.availability) ? (rec.availability as string[]) : [];
  if (!rec.availability_at) return null;
  if (!have.length) return { text: `No weeks picked${rec.availability_note ? ` — “${rec.availability_note}”` : ""}`, good: false };
  const both = sharedWeeks(wanted, have);
  const tail = wanted.length ? (both.length ? ` · matches your ${weeksSummary(both)}` : " · none of your weeks") : "";
  return { text: `Could do it ${weeksSummary(have)}${tail}${rec.availability_note ? ` — “${rec.availability_note}”` : ""}`, good: !wanted.length || both.length > 0 };
}

export function VendorTalk({ rec, wanted, name }: { rec: TalkRec; wanted: string[]; name: string }) {
  const [open, setOpen] = useState(false);
  const av = availabilityLine(rec, wanted);
  return (
    <div className="flex flex-col gap-1">
      {av && <div style={{ fontSize: F.xs, color: av.good ? T.green : T.sun, lineHeight: 1.45 }}>📅 {av.text}</div>}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ alignSelf: "flex-start", fontSize: F.xs, fontWeight: 600, color: T.chalk, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {open ? "▾ Chat" : `▸ Chat with ${name.split(" ")[0]}`}
      </button>
      {open && (
        <div style={{ border: `1px solid ${T.hair}`, borderRadius: 4, padding: 8, background: T.sunk }}>
          <BidChat url={`/api/bid-requests/recipients/${rec.id}/chat`} mine="org"
            empty={`No messages yet. ${name.split(" ")[0]} reads them on their bid link — nothing is texted.`}
            disabled={rec.revoked_at ? "Their link is turned off, so they can't read new messages." : null}
            pal={{ ink: T.ink, ink2: T.ink2, ink3: T.ink3, hair: T.hair, card: T.card, mine: T.outBg, theirs: T.card, accent: T.hiviz, onAccent: T.onHiviz, red: T.red }} />
        </div>
      )}
    </div>
  );
}
