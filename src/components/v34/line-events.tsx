"use client";

/**
 * Logs' event table (Claude Design package 9, `Lines.dc.html` C): every
 * provider event of the last 7 days, filtered by line, provider and kind, the
 * filter kept in the address (?line=&provider=&event=) so the Lines page's
 * "Logs ›" opens it filtered. A red alarm when anything in view failed, with
 * Replay; a row opens a drawer with the payload as it arrived, the trace, and
 * the contact and message it became. Desktop: a table; phone: two-line rows.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, formatPhone } from "@/lib/v34/tokens";
import { PageHeader, Sheet } from "@/components/v34/primitives";
import { latencyText, logFilterQuery, matchesLog, providerCard, readLogFilter, type EventStatus, type LogFilter } from "@/lib/lines";

interface Ev {
  id: string; at: string; line_id: string | null; provider: string | null; event_type: string; kind: "call" | "text" | "webhook";
  status: EventStatus; latency_ms: number | null; error: string | null; contact_id: string | null; who: string | null; number: string | null; summary: string;
}
interface LineLite { id: string; label: string | null; phone_e164: string; color: string; provider: string | null }

const colorVar = (c: string) => (T as unknown as Record<string, string>)[c] ?? T.ink3;
const STATUS: Record<EventStatus, { l: string; c: string }> = {
  ok: { l: "OK", c: T.green }, failed: { l: "Failed", c: T.red }, pending: { l: "Pending", c: T.hiviz }, late: { l: "Late", c: T.hiviz },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function LineEvents({ tabs }: { tabs?: React.ReactNode } = {}) {
  const [data, setData] = useState<{ lines: LineLite[]; events: Ev[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<LogFilter>({ line: null, provider: null, event: "all" });
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setF(readLogFilter(new URLSearchParams(window.location.search))); });
    return () => { off = true; };
  }, []);
  useEffect(() => {
    let off = false;
    fetch("/api/logs/events").then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setData(b); }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);
  const pick = (next: LogFilter) => {
    setF(next);
    try { window.history.replaceState(null, "", `${window.location.pathname}${logFilterQuery(next)}`); } catch { /* no history */ }
  };
  const replay = useCallback(async (id: string) => {
    setReplaying(id); setNote(null);
    try {
      const r = await fetch(`/api/logs/events/${id}/replay`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      setNote(r.ok ? "Replayed — it reached the app." : `Replay didn't go through: ${b?.error ?? `HTTP ${r.status}`}`);
      setTick((n) => n + 1);
    } finally { setReplaying(null); }
  }, []);

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const lineOf = (id: string | null) => lines.find((l) => l.id === id) ?? null;
  const all = data?.events ?? [];
  const shown = all.filter((e) => matchesLog(e, f));
  const failed = shown.filter((e) => e.status === "failed");
  const providers = [...new Set(all.map((e) => e.provider).filter(Boolean) as string[])];
  const chip = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 10px", borderRadius: 3, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card,
    color: on ? T.card : T.ink2, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 });
  const dot = (c: string, s = 7) => <span style={{ width: s, height: s, borderRadius: s, background: colorVar(c), display: "inline-block", flexShrink: 0 }} />;
  const lineName = (l: LineLite | null) => (l ? l.label || formatPhone(l.phone_e164) : "No line");

  return (
    <div>
      <PageHeader title="Logs" sub="What happened behind the scenes. Nothing here needs you unless it is red."
        actions={<Link href="/dashboard/settings/lines" style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: T.chalk }}>Lines ›</Link>}>
        {tabs}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 mt-2.5">
          {([
            { k: "Line", items: [{ v: null as string | null, l: "All lines", n: all.length, c: null as string | null }, ...lines.map((l) => ({ v: l.id, l: lineName(l), n: all.filter((e) => e.line_id === l.id).length, c: l.color }))],
              on: (v: string | null) => f.line === v, set: (v: string | null) => pick({ ...f, line: v }) },
            { k: "Provider", items: [{ v: null as string | null, l: "All", n: null as number | null, c: null as string | null }, ...providers.map((p) => ({ v: p, l: providerCard(p)?.name ?? p, n: null, c: null }))],
              on: (v: string | null) => f.provider === v, set: (v: string | null) => pick({ ...f, provider: v }) },
            { k: "Event", items: (["all", "call", "text", "webhook", "needs"] as const).map((v) => ({ v: v as string | null, l: { all: "All", call: "Calls", text: "Texts", webhook: "Webhooks", needs: "Needs you" }[v], n: null as number | null, c: null as string | null })),
              on: (v: string | null) => f.event === v, set: (v: string | null) => pick({ ...f, event: (v ?? "all") as LogFilter["event"] }) },
          ]).map((g) => (
            <div key={g.k} className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <span style={{ ...eyebrow, fontSize: 9.5, color: T.ink3, flexShrink: 0 }}>{g.k}</span>
              {g.items.map((it) => (
                <button key={String(it.v)} onClick={() => g.set(it.v)} style={chip(g.on(it.v))}>
                  {it.c && dot(it.c)}{it.l}{it.n !== null ? <span style={{ ...nums, opacity: 0.7 }}>{it.n}</span> : null}
                </button>
              ))}
            </div>
          ))}
          <span className="flex-1" />
          <span style={{ fontSize: 11.5, color: T.ink3, ...nums, whiteSpace: "nowrap" }}>{data ? `${shown.length} of ${all.length} events · last 7 days` : "Loading…"}</span>
        </div>
      </PageHeader>

      {err && <div className="px-4 py-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
      {note && <div className="px-4 py-2" style={{ fontSize: F.sm, color: T.ink2 }}>{note}</div>}
      {failed.length > 0 && (
        <div role="alert" className="mx-4 mt-3 rounded flex items-center gap-2" style={{ background: T.red, color: "#fff", fontSize: 12.5, padding: "8px 10px" }}>
          <span style={{ flex: 1 }}>
            {failed.length} event{failed.length === 1 ? "" : "s"} reached {failed[0].line_id ? <>the <b>{lineName(lineOf(failed[0].line_id))}</b> line</> : "a line"}
            {failed[0].provider ? ` (${providerCard(failed[0].provider)?.name ?? failed[0].provider})` : ""} but never reached the app
            {failed[0].error ? ` — ${failed[0].error}` : ""}. It is saved as it arrived; it is not in Threads.
          </span>
          <button onClick={() => void replay(failed[0].id)} disabled={!!replaying} className="rounded px-2.5"
            style={{ height: 28, border: "1px solid #fff", color: "#fff", background: "transparent", fontFamily: disp, fontSize: 11, textTransform: "uppercase", cursor: "pointer" }}>
            {replaying ? "Replaying…" : "Replay event"}
          </button>
        </div>
      )}

      <div className="mx-4 mt-3 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="hidden lg:grid" style={{ gridTemplateColumns: "150px 120px 90px 190px 1fr 110px 90px", ...eyebrow, fontSize: 9.5, color: T.ink3, padding: "8px 12px" }}>
          <span>When</span><span>Line</span><span>Provider</span><span>Event</span><span>Who · what</span><span>Latency</span><span>Status</span>
        </div>
        {data && shown.length === 0 && <div className="px-3 py-4" style={{ fontSize: F.sm, color: T.ink3 }}>{all.length ? "Nothing matches this filter." : "No events in the last 7 days."}</div>}
        {shown.slice(0, 300).map((e) => {
          const l = lineOf(e.line_id), st = STATUS[e.status];
          const who = e.who ?? (e.number ? formatPhone(e.number) : "—");
          return (
            <button key={e.id} onClick={() => setOpen(e.id)} className="w-full text-left block"
              style={{ borderTop: `1px solid ${T.hairSoft}`, background: e.status === "failed" ? "color-mix(in srgb, var(--sc-red) 8%, transparent)" : "transparent", cursor: "pointer", fontSize: 12.5 }}>
              <div className="hidden lg:grid items-center" style={{ gridTemplateColumns: "150px 120px 90px 190px 1fr 110px 90px", padding: "8px 12px" }}>
                <span style={{ ...nums, color: T.ink2 }}>{when(e.at)}</span>
                <span className="flex items-center gap-1.5" style={clip}>{l && dot(l.color)}{lineName(l)}</span>
                <span style={{ color: T.ink2 }}>{providerCard(e.provider)?.name ?? "—"}</span>
                <span style={{ fontFamily: "var(--sc-font-code)", fontSize: 11.5, ...clip }}>{e.event_type}</span>
                <span style={clip}><b>{who}</b> <span style={{ color: T.ink2 }}>{e.summary}</span></span>
                <span style={{ ...nums, color: T.ink2 }}>{latencyText(e.latency_ms)}</span>
                <span style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: st.c }}>{st.l}</span>
              </div>
              <div className="lg:hidden" style={{ padding: "8px 12px" }}>
                <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: T.ink3 }}>
                  <span style={nums}>{when(e.at)}</span>{l && dot(l.color)}<span style={{ fontFamily: "var(--sc-font-code)", ...clip }}>{e.event_type}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span style={{ flex: 1, minWidth: 0, ...clip }}><b>{who}</b> <span style={{ color: T.ink2 }}>{e.summary}</span></span>
                  <span style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: st.c }}>{st.l}</span>
                </div>
              </div>
            </button>
          );
        })}
        {shown.length > 300 && <div className="px-3 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Showing the newest 300 — narrow the filter to see the rest.</div>}
      </div>

      <EventDrawer id={open} onClose={() => setOpen(null)} onReplay={(id) => void replay(id)} replaying={replaying} />
    </div>
  );
}

function EventDrawer({ id, onClose, onReplay, replaying }: { id: string | null; onClose: () => void; onReplay: (id: string) => void; replaying: string | null }) {
  const [d, setD] = useState<{ event: Record<string, unknown>; payload: unknown; defects: Array<{ defect: string; created_at: string; resolved_at: string | null }>;
    message: { id: string; contact_id: string; channel: string } | null; contact: { id: string; name: string | null; phone: string | null } | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let off = false;
    fetch(`/api/logs/events/${id}`).then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off) setD(b); }).catch(() => {});
    return () => { off = true; setD(null); };
  }, [id]);
  const ev = d?.event as { event_type?: string; received_at?: string; projected_at?: string | null; projection_error?: string | null; from_phone?: string; to_phone?: string } | undefined;
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-2" style={{ fontSize: 12.5 }}><span style={{ width: 92, color: T.ink3, flexShrink: 0 }}>{k}</span><span style={{ minWidth: 0 }}>{v}</span></div>;
  return (
    <Sheet open={!!id} onClose={onClose} title={ev?.event_type ?? "Event"} sub="As it arrived, and what became of it">
      {!d ? <div className="px-4 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : (
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            {row("Received", ev?.received_at ? when(ev.received_at) : "—")}
            {row("Reached app", ev?.projected_at ? `${when(ev.projected_at)}` : <span style={{ color: T.red }}>Not yet</span>)}
            {ev?.projection_error && row("Error", <span style={{ color: T.red }}>{ev.projection_error}</span>)}
            {d.defects.map((x, i) => <React.Fragment key={i}>{row("Noted", `${x.defect.replace(/_/g, " ")}${x.resolved_at ? " · resolved" : ""}`)}</React.Fragment>)}
            {row("From → to", `${formatPhone(ev?.from_phone ?? "")} → ${formatPhone(ev?.to_phone ?? "")}`)}
            {row("Contact", d.contact ? <Link href={`/dashboard/messages/${d.contact.id}`} style={{ color: T.chalk }}>{d.contact.name || formatPhone(d.contact.phone ?? "")} ›</Link> : "—")}
            {row("Message", d.message ? <Link href={`/dashboard/messages/${d.message.contact_id}`} style={{ color: T.chalk }}>Open the {d.message.channel} ›</Link> : "None — an artifact of a call, or not filed")}
          </div>
          {(ev?.projection_error || !ev?.projected_at) && id && (
            <button onClick={() => onReplay(id)} disabled={!!replaying} className="self-start rounded px-3"
              style={{ height: 32, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>{replaying ? "Replaying…" : "Replay event"}</button>
          )}
          <div>
            <div style={{ ...eyebrow, marginBottom: 4 }}>Payload, as it arrived</div>
            <pre className="rounded overflow-auto" style={{ background: T.slab, border: `1px solid ${T.hairSoft}`, padding: 10, fontSize: 11, lineHeight: 1.45, maxHeight: 420, fontFamily: "var(--sc-font-code)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
              {JSON.stringify(d.payload, null, 2)}
            </pre>
          </div>
          <div style={{ fontSize: 11, color: T.ink3 }}>Kept as it arrived, for good; nothing edits the raw log.</div>
        </div>
      )}
    </Sheet>
  );
}
