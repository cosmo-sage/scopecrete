"use client";

/**
 * Threads — the v34 screen, wired to /api/threads.
 *
 * This is the one screen that already worked, so the port is deliberately
 * conservative: v34's ThreadRow predates the spine (call_artifacts, voicemails,
 * next_steps, four-bucket contacts), and everything the previous Messages page
 * got right is carried across rather than re-derived.
 *
 * What is carried:
 *  - voicemail glance lines are LABELLED as voicemails, not passed off as
 *    summaries
 *  - 124 of 144 contacts have no name, so the phone number is the display name
 *    and nothing here invents one
 *  - the preview keeps a fixed minHeight so rows do not reflow as summaries land
 *
 * No mock constants. v34's THREADS array is not imported and must not be.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { Avatar, EmptyState } from "@/components/v34/primitives";

interface Thread {
  contact_id: string;
  display_name: string;
  name_is_phone: boolean;
  phone: string | null;
  contact_type: string | null;
  contact_subtype: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  preview: string;
  preview_source: "body" | "summary" | "synthesised";
  summary_source: string | null;
  msg_count: number;
}

function ThreadRow({ t, first, onOpen }: { t: Thread; first: boolean; onOpen: () => void }) {
  const when = relTime(t.occurred_at);
  const isVoicemail = t.summary_source === "quo_voicemail";
  const synthesised = t.preview_source === "synthesised";

  return (
    <div style={{ background: T.card, borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      <button onClick={onOpen} className="w-full px-2.5 py-2 flex gap-2.5 items-start text-left">
        <Avatar
          label={t.display_name}
          kind={t.contact_type}
          dim={t.name_is_phone}
        />
        <span style={{ minWidth: 0, flex: 1, display: "block" }}>
          <span className="flex items-baseline gap-1.5" style={{ minWidth: 0 }}>
            <span style={{
              fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.2, ...clip,
              // A phone number is a weaker identity than a name and is coloured
              // as such — but it is still the real one. Nothing is invented to
              // fill the gap.
              color: t.name_is_phone ? T.ink2 : T.ink,
            }}>
              {t.display_name}
            </span>
            <span className="flex-1" />
            {t.msg_count > 1 && (
              <span style={{ fontSize: F.micro, color: T.ink3, ...nums }}>{t.msg_count}</span>
            )}
            {when && (
              <span className="shrink-0" style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>
            )}
          </span>

          {isVoicemail && (
            <span style={{ ...eyebrow, color: T.hiviz, display: "block", marginTop: 2 }}>
              Voicemail
            </span>
          )}

          {/* Fixed height so several hundred rows gaining a summary changes no
              geometry. */}
          <span style={{
            display: "block", fontSize: F.sm, marginTop: 2,
            color: synthesised ? T.ink3 : T.ink2,
            fontStyle: synthesised ? "italic" : "normal",
            minHeight: "1.1rem", lineHeight: "1.15rem",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {t.preview}
          </span>
        </span>
      </button>
    </div>
  );
}

export default function ThreadsScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [drift, setDrift] = useState<{ count: number | null; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/threads")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (b?.code === "no_org") {
            if (!cancelled) { setNoOrg(true); setLoading(false); }
            return null;
          }
          throw new Error(b?.error || `HTTP ${r.status}`);
        }
        return b;
      })
      .then((data) => {
        if (cancelled || data === null) return;
        setThreads(Array.isArray(data.threads) ? data.threads : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    // The drift alarm. This is the real value from the real route — v34 has a
    // mock constant also called DRIFT, which is not imported anywhere and must
    // never be. A drift figure that did not come from here is a bug.
    fetch("/api/dashboard/drift")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDrift(d); })
      .catch(() => { if (!cancelled) setDrift({ count: null, error: "unreachable" }); });

    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {/* Drift: 0 is all-clear, >0 is an outage that reached the app, and a
          failure to read it renders as UNKNOWN — never as all-clear. */}
      {drift && (drift.count === null || drift.count > 0) && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.hivizDim, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: "#C24A00" }}>
            {drift.count === null ? "Drift unknown" : `Drift ${drift.count}`}
          </span>
          <span style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
            {drift.count === null
              ? "Could not read the spine-drift check."
              : "message(s) arrived but never reached the app."}
          </span>
        </div>
      )}

      {loading ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
          ))}
        </div>
      ) : noOrg ? (
        <EmptyState tone="warn"
          title="This account isn't a member of any organisation"
          detail="You are signed in, but nothing is shared with this account yet. Ask for an invitation to your organisation." />
      ) : error ? (
        <EmptyState tone="warn" title="Couldn't load threads" detail={error} />
      ) : threads.length === 0 ? (
        <EmptyState title="No threads yet"
          detail="Calls and texts appear here as they arrive." />
      ) : (
        <div>
          {threads.map((t, i) => (
            <ThreadRow key={t.contact_id} t={t} first={i === 0}
              onOpen={() => router.push(`/dashboard/messages/${t.contact_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
