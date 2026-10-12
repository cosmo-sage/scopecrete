"use client";
/**
 * "What I'm reading" in Dusty's chat on a job (Coy, 2026-10-12: "open the dusty
 * chat and see the specifics of what he's reading and the status of the
 * process"). Each of the job's files with what the background reader is doing
 * with it — reading now (since when, which try), waiting (how many ahead),
 * read, or not read and why — and the plan sheets the browser reads, live
 * from plan-ocr-runner while it runs ("sheet 3 of 74 · part 5/12").
 * /api/jobs/[id]/reading, checked every 15 s while anything is still moving.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { T, F, agent, clip } from "@/lib/v34/tokens";
import { usePlanOcr } from "@/lib/v34/plan-ocr-runner";
import { fileRows, readingSummary, sheetLine, sheetProgress, stillReading, type ReadFile, type ReadSheet, type RowTone } from "@/lib/dusty/reading";
import { shouldPoll } from "@/lib/v34/idle-poll";

type Data = { files: Array<ReadFile & { in_plan_room: boolean | null }>; sheets: ReadSheet[]; reader: { status: string; detail: string | null; ticked_at: string } | null };

const DOT: Record<RowTone, string> = {
  now: "var(--sc-work-dot-read)", warn: "var(--sc-work-dot-reply)", wait: "var(--sc-work-dot-idle)", done: "var(--sc-work-dot-done)", stop: "var(--sc-work-dot-warn)",
};

export function DustyReading({ jobId, onGo }: { jobId: string; onGo: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ocr = usePlanOcr();
  const live = ocr.running && ocr.jobId === jobId ? ocr.label : null;
  const router = useRouter();

  const rows = useMemo(() => (data ? fileRows(data.files, now) : []), [data, now]);
  const sheets = useMemo(() => {
    if (!data) return null;
    const room = new Set(data.files.filter((f) => f.in_plan_room).map((f) => f.id));
    return sheetLine(sheetProgress(data.sheets, room), live);
  }, [data, live]);
  const moving = stillReading(rows) || !!live;

  useEffect(() => {
    let off = false;
    let last = 0;
    const load = (force = false) => {
      if (!force && !shouldPoll(last)) return Promise.resolve();
      last = Date.now();
      return fetch(`/api/jobs/${jobId}/reading`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && b) { setData(b as Data); setNow(Date.now()); } }).catch(() => {});
    };
    void load(true);
    // While something is still being read, look again every 15 s; otherwise once a minute keeps "5 min ago" honest.
    const t = setInterval(() => void load(), moving ? 15_000 : 60_000);
    return () => { off = true; clearInterval(t); };
    // ocr.done: each sheet the browser finishes is saved, so the counts move.
  }, [jobId, moving, ocr.done]);

  if (!data || (!rows.length && !sheets)) return null;
  const isOpen = open ?? moving;
  const active = rows.filter((r) => r.tone !== "done");
  const done = rows.filter((r) => r.tone === "done");
  const reader = data.reader;
  const readerDown = reader && (reader.status !== "ok" || now - Date.parse(reader.ticked_at) > 15 * 60_000);
  const head = [moving ? "What I'm reading" : "What I've read", readingSummary(rows)].filter(Boolean).join(" · ");

  return (
    <div style={{ border: `1px solid ${T.hair}`, borderRadius: 8, background: T.card, marginBottom: 14, fontFamily: agent }}>
      <button onClick={() => setOpen(!isOpen)} className="w-full flex items-center gap-2 text-left"
        style={{ padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: T.ink }} aria-expanded={isOpen}>
        <span aria-hidden className={moving ? "sc-read-pulse" : undefined}
          style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: moving ? DOT.now : DOT.done }} />
        <span style={{ flex: 1, fontSize: F.sm, fontWeight: 600, ...clip }}>{head}</span>
        <span aria-hidden style={{ color: T.ink3, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && (
        <div style={{ padding: "0 10px 10px" }}>
          {readerDown && (
            <Row tone="stop" name="The background reader" status={reader!.status === "ok" ? "hasn't checked in for a while" : reader!.status.replace(/_/g, " ")} detail={reader!.detail} />
          )}
          {sheets && <Row tone={sheets.tone} name="Plan sheets" status={sheets.status} detail={sheets.detail} />}
          {active.map((r) => <Row key={r.id} tone={r.tone} name={r.name} status={r.status} detail={r.detail} />)}
          {done.length > 0 && (showDone
            ? done.map((r) => <Row key={r.id} tone={r.tone} name={r.name} status={r.status} detail={r.detail} />)
            : <button onClick={() => setShowDone(true)} style={{ fontSize: F.xs, color: T.ink3, background: "none", border: "none", padding: "6px 0 0", cursor: "pointer" }}>
                {done.length} read — show them ›
              </button>)}
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { onGo(); router.push(`/dashboard/scope/${jobId}/files`); }}
              style={{ fontSize: F.xs, color: T.chalk, background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600 }}>
              Open the job&apos;s Files ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ tone, name, status, detail }: { tone: RowTone; name: string; status: string; detail: string | null }) {
  return (
    <div className="flex gap-2" style={{ padding: "6px 0", borderTop: `1px solid ${T.hairSoft}` }}>
      <span aria-hidden className={tone === "now" ? "sc-read-pulse" : undefined}
        style={{ width: 7, height: 7, borderRadius: 2, marginTop: 5, flexShrink: 0, background: DOT[tone] }} />
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: F.sm, color: T.ink, ...clip }} title={name}>{name}</div>
        <div style={{ fontSize: F.xs, color: tone === "stop" ? T.red : tone === "warn" ? T.hivizText : T.ink2, lineHeight: 1.4 }}>{status}</div>
        {detail && <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>{detail}</div>}
      </div>
    </div>
  );
}
