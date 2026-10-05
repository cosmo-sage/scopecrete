"use client";

/**
 * Feedback and the Roadmap (migration 084; Coy, 2026-10-05: "a pipeline page
 * … where people can see what features are recommended … vote on those
 * recommended features and comment on them and see what's being worked on
 * similar to how JobTread does it I like their Roadmap page").
 *
 * RoadmapPage   the board: Under consideration · Planned · In progress ·
 *               Released (columns when wide, a column at a time on a phone),
 *               each card with its vote button; "Your feedback" waiting for
 *               review; for Coy, the Inbox of new feedback to publish.
 * ItemSheet     one item: what it is, votes, comments; Coy's status and wording.
 * FeedbackSheet "Give feedback" — from here and from Settings (sc:feedback).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, relTime } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import {
  BOARD, KINDS, STATUSES, canVote, matchesItem, sortItems, statusLabel,
  type RoadmapItem, type RoadmapKind, type RoadmapSort, type RoadmapStatus,
} from "@/lib/roadmap";

async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const btn = (primary: boolean): React.CSSProperties => ({ height: 36, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
  letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });
const field: React.CSSProperties = { border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 4, padding: "6px 8px", minWidth: 0, width: "100%" };
const chip = (on: boolean): React.CSSProperties => ({ height: 30, padding: "0 10px", borderRadius: 15, fontSize: F.xs, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: `1px solid ${on ? T.ink : T.hair}` });

const COLOR: Record<RoadmapStatus, string> = {
  new: T.hiviz, considering: T.chalk, planned: T.violet, in_progress: T.hiviz, released: T.green, declined: T.ink3,
};

export function StatusTag({ status }: { status: RoadmapStatus }) {
  const c = COLOR[status];
  return (
    <span style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: "15px",
      padding: "0 5px", border: `1px solid ${c}`, color: c, whiteSpace: "nowrap", borderRadius: 2 }}>{statusLabel(status)}</span>
  );
}

function VoteButton({ item, onVote, big }: { item: RoadmapItem; onVote: (on: boolean) => void; big?: boolean }) {
  const open = canVote(item.status);
  return (
    <button onClick={(e) => { e.stopPropagation(); if (open) onVote(!item.voted); }} disabled={!open}
      aria-pressed={item.voted} aria-label={open ? `${item.voted ? "Take back your vote" : "Vote"} · ${item.votes} votes` : `${item.votes} votes`}
      title={open ? (item.voted ? "Take back your vote" : "Vote for this") : "Votes are closed once it's released"}
      className="shrink-0 flex flex-col items-center justify-center"
      style={{ width: big ? 56 : 44, height: big ? 56 : 46, borderRadius: 4, cursor: open ? "pointer" : "default",
        background: item.voted ? T.hiviz : T.card, color: item.voted ? T.onHiviz : T.ink,
        border: `1px solid ${item.voted ? T.hiviz : T.hair}`, opacity: open || item.votes ? 1 : 0.6 }}>
      <svg width="12" height="9" viewBox="0 0 12 9" aria-hidden="true"><path d="M6 0.8 11.2 8.2H0.8z" fill="currentColor" /></svg>
      <span style={{ fontFamily: "var(--sc-font-strong)", fontWeight: 700, fontSize: big ? F.md : F.sm, lineHeight: 1.2 }}>{item.votes}</span>
    </button>
  );
}

function Card({ item, onOpen, onVote, showStatus }: { item: RoadmapItem; onOpen: () => void; onVote: (on: boolean) => void; showStatus?: boolean }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="flex gap-2.5 p-2.5" style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4, cursor: "pointer" }}>
      <VoteButton item={item} onVote={onVote} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: F.md, fontWeight: 600, color: T.ink, lineHeight: 1.3 }}>{item.title}</div>
        {item.body && (
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.body}
          </div>
        )}
        {item.admin_note && <div style={{ fontSize: F.xs, color: T.hivizText, marginTop: 3 }}>{item.admin_note}</div>}
        <div className="flex items-center gap-2 flex-wrap mt-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>
          {showStatus && <StatusTag status={item.status} />}
          {item.kind === "bug" && <span>Something&apos;s wrong</span>}
          <span>{item.comments === 1 ? "1 comment" : `${item.comments} comments`}</span>
          {item.org_name && <span>· {item.mine ? "You" : item.org_name}</span>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the page

export function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<RoadmapSort>("top");
  const [col, setCol] = useState<RoadmapStatus | "inbox" | "mine">("considering");
  const [openId, setOpenId] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [measure, wide] = useWide<HTMLDivElement>(900);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let off = false;
    call("/api/roadmap").then((b) => {
      if (off) return;
      setItems(b.items as RoadmapItem[]); setAdmin(!!b.admin); setMissing(!!b.missing); setErr(null);
    }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("feedback") === "1") setGiving(true);
      if (sp.get("item")) setOpenId(sp.get("item"));
    });
    return () => { off = true; };
  }, []);

  const vote = async (id: string, on: boolean) => {
    // Shown at once; the server's count wins.
    setItems((xs) => xs?.map((x) => x.id === id ? { ...x, voted: on, votes: x.votes + (on ? 1 : -1) } : x) ?? xs);
    try {
      const b = await call(`/api/roadmap/${id}`, "PATCH", { vote: on });
      setItems((xs) => xs?.map((x) => x.id === id ? { ...x, voted: on, votes: Number(b.votes) } : x) ?? xs);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); reload(); }
  };

  const hit = useMemo(() => (items ?? []).filter((i) => matchesItem(i, q)), [items, q]);
  const by = (s: RoadmapStatus) => sortItems(hit.filter((i) => i.status === s), sort);
  const inbox = sortItems(hit.filter((i) => i.status === "new" || (admin && i.status === "declined")), "new");
  const mine = sortItems(hit.filter((i) => i.mine && (i.status === "new" || i.status === "declined")), "new");
  const open = items?.find((i) => i.id === openId) ?? null;

  const column = (s: RoadmapStatus) => {
    const list = by(s);
    const meta = STATUSES.find((x) => x.k === s)!;
    return (
      <section key={s} className="flex-1 min-w-0">
        {wide && (
          <div className="flex items-baseline gap-2 mb-1.5 pb-1" style={{ borderBottom: `2px solid ${COLOR[s]}` }}>
            <h2 style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{meta.label}</h2>
            <span style={{ fontSize: F.xs, color: T.ink3 }}>{list.length}</span>
          </div>
        )}
        <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 6 }}>{meta.note}</div>
        <div className="flex flex-col gap-1.5">
          {list.map((i) => <Card key={i.id} item={i} onOpen={() => setOpenId(i.id)} onVote={(on) => vote(i.id, on)} />)}
          {!list.length && <div style={{ fontSize: F.xs, color: T.ink3, padding: "10px 0" }}>{q ? "Nothing here matches." : "Nothing here yet."}</div>}
        </div>
      </section>
    );
  };

  const tabs: Array<[RoadmapStatus | "inbox" | "mine", string, number]> = [
    ...BOARD.map((s) => [s, statusLabel(s), by(s).length] as [RoadmapStatus, string, number]),
    ...(admin ? [["inbox", "Inbox", inbox.length] as ["inbox", string, number]] : mine.length ? [["mine", "Your feedback", mine.length] as ["mine", string, number]] : []),
  ];

  return (
    <div ref={measure} className="px-3 py-3 mx-auto" style={{ maxWidth: 1280 }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".02em", flex: 1, minWidth: 140 }}>Roadmap</h1>
        {admin && <button onClick={() => setAdding(true)} style={btn(false)}>+ Add to the board</button>}
        <button onClick={() => setGiving(true)} style={btn(true)} disabled={missing}>Give feedback</button>
      </div>
      <p style={{ fontSize: F.sm, color: T.ink2, marginBottom: 10, maxWidth: 720 }}>
        What&apos;s coming to ScopeCrete, from every company using it. Vote for what you want most and say why in the comments.
        Your feedback goes to the ScopeCrete team first; only you see it until it&apos;s put on the board.
      </p>

      {missing && (
        <div className="p-3 mb-3" style={{ background: T.hivizDim, border: `1px solid ${T.hiviz}`, borderRadius: 4, fontSize: F.sm, color: T.ink }}>
          The roadmap is built and waiting for its database tables (migration 084). It switches on once that is applied.
        </div>
      )}
      {err && <div className="mb-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}

      <div className="flex gap-2 flex-wrap items-center mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an idea…" aria-label="Find on the roadmap" style={{ ...field, height: 34, maxWidth: 320 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as RoadmapSort)} aria-label="Sort" style={{ ...field, height: 34, width: "auto" }}>
          <option value="top">Most votes</option><option value="new">Newest</option>
        </select>
      </div>

      {!wide || col === "inbox" || col === "mine" ? (
        <div className="flex gap-1.5 overflow-x-auto mb-3" role="tablist" style={{ scrollbarWidth: "none" }}>
          {tabs.map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={col === k} onClick={() => setCol(k)} style={chip(col === k)}>{label} {n}</button>
          ))}
        </div>
      ) : (
        (admin || mine.length > 0) && (
          <div className="flex gap-1.5 mb-3">
            <button onClick={() => setCol(admin ? "inbox" : "mine")} style={chip(false)}>
              {admin ? `Inbox ${inbox.length}` : `Your feedback ${mine.length}`}
            </button>
          </div>
        )
      )}

      {items === null && !err ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading the roadmap…</div>
        : col === "inbox" || col === "mine" ? (
          <div className="flex flex-col gap-1.5" style={{ maxWidth: 760 }}>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>
              {col === "inbox" ? "Feedback from every company, newest first. Open one to publish it to the board (reword it first if it names a customer), or mark it Not planned."
                : "What you've sent. It goes on the board once the ScopeCrete team publishes it."}
            </div>
            {(col === "inbox" ? inbox : mine).map((i) => <Card key={i.id} item={i} showStatus onOpen={() => setOpenId(i.id)} onVote={() => {}} />)}
            {!(col === "inbox" ? inbox : mine).length && <div style={{ fontSize: F.sm, color: T.ink3 }}>Nothing waiting.</div>}
          </div>
        ) : wide ? <div className="flex gap-3 items-start">{BOARD.map(column)}</div>
          : column(col)}

      <ItemSheet item={open} admin={admin} onClose={() => setOpenId(null)} onVote={(on) => open && vote(open.id, on)} onChanged={reload} />
      <FeedbackSheet open={giving} onClose={() => setGiving(false)} onSent={() => { reload(); setCol(admin ? "inbox" : "mine"); }} />
      <FeedbackSheet open={adding} admin onClose={() => setAdding(false)} onSent={reload} />
    </div>
  );
}

// ------------------------------------------------------------------ one item

interface Comment { id: string; author_name: string | null; org_name: string | null; body: string; created_at: string; mine: boolean }

function ItemSheet({ item, admin, onClose, onVote, onChanged }: {
  item: RoadmapItem | null; admin: boolean; onClose: () => void; onVote: (on: boolean) => void; onChanged: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const id = item?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let off = false;
    call(`/api/roadmap/${id}/comments`).then((b) => { if (!off) setComments(b.comments as Comment[]); })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [id, tick]);

  const post = async () => {
    if (!id || !text.trim()) return;
    setBusy(true); setErr(null);
    try { await call(`/api/roadmap/${id}/comments`, "POST", { body: text }); setText(""); setTick((t) => t + 1); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const remove = async (c: string) => {
    if (!id) return;
    try { await call(`/api/roadmap/${id}/comments?comment=${c}`, "DELETE"); setTick((t) => t + 1); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Sheet open={!!item} onClose={() => { onClose(); setComments(null); setErr(null); }} title={item?.title ?? ""} sub={item ? statusLabel(item.status) : undefined}>
      {item && (
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex gap-3 items-start">
            <VoteButton item={item} onVote={onVote} big />
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 items-center flex-wrap mb-1"><StatusTag status={item.status} />
                {item.kind !== "idea" && <span style={{ fontSize: F.xs, color: T.ink3 }}>{KINDS.find((k) => k.k === item.kind)?.label}</span>}
              </div>
              {item.body ? <div style={{ fontSize: F.sm, color: T.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{item.body}</div>
                : <div style={{ fontSize: F.sm, color: T.ink3 }}>No more detail.</div>}
              {item.admin_note && <div className="mt-2 p-2" style={{ fontSize: F.sm, background: T.hivizDim, borderRadius: 4 }}>
                <span style={{ ...eyebrow, color: T.hivizText }}>From the ScopeCrete team</span><div>{item.admin_note}</div></div>}
              <div className="mt-2" style={{ fontSize: F.xs, color: T.ink3 }}>
                {item.mine ? "You sent this" : item.author_name ? `From ${item.author_name}${item.org_name ? ` · ${item.org_name}` : ""}` : null}
                {` · ${relTime(item.created_at) ?? ""} ago`}
                {item.page && ` · sent from ${item.page}`}
              </div>
            </div>
          </div>

          {admin && <AdminPanel key={`${item.id}|${item.status}|${item.title}`} item={item} onChanged={onChanged} />}

          <div>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Comments {comments ? comments.length : ""}</div>
            {comments === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : (
              <div className="flex flex-col gap-2">
                {comments.map((c) => (
                  <div key={c.id} className="p-2" style={{ background: T.sunk, borderRadius: 4 }}>
                    <div className="flex items-baseline gap-2" style={{ fontSize: F.xs, color: T.ink3 }}>
                      <span style={{ fontWeight: 600, color: T.ink2 }}>{c.mine ? "You" : c.author_name ?? "Someone"}</span>
                      {c.org_name && <span>{c.org_name}</span>}
                      <span className="flex-1">{relTime(c.created_at)} ago</span>
                      {(c.mine || admin) && <button onClick={() => remove(c.id)} style={{ color: T.ink3, cursor: "pointer", fontSize: F.xs }}>Remove</button>}
                    </div>
                    <div style={{ fontSize: F.sm, color: T.ink, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body}</div>
                  </div>
                ))}
                {!comments.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>No comments yet. Say how you&apos;d use it.</div>}
              </div>
            )}
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Add a comment" maxLength={2000}
              style={{ ...field, marginTop: 8, resize: "vertical" }} />
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1" style={{ fontSize: F.xs, color: T.ink3 }}>Everyone using ScopeCrete sees your name and company on a comment.</div>
              <button onClick={post} disabled={busy || !text.trim()} style={{ ...btn(true), opacity: busy || !text.trim() ? 0.5 : 1 }}>{busy ? "Posting…" : "Comment"}</button>
            </div>
            {err && <div className="mt-1" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Coy's controls: where it sits, its words, a note. */
function AdminPanel({ item, onChanged }: { item: RoadmapItem; onChanged: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [note, setNote] = useState(item.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (status?: RoadmapStatus) => {
    setBusy(true); setErr(null);
    try { await call(`/api/roadmap/${item.id}`, "PATCH", { status, title, body, note }); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <div className="p-2.5" style={{ border: `1px dashed ${T.hairStrong}`, borderRadius: 4 }}>
      <div style={{ ...eyebrow, marginBottom: 6 }}>Only you see this · platform admin</div>
      {item.status === "new" && <div style={{ fontSize: F.xs, color: T.ink2, marginBottom: 6 }}>
        Nobody else sees this until you move it onto the board. Take out anything about their customers first.</div>}
      <label style={{ fontSize: F.xs, color: T.ink3 }}>Title on the board
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} style={{ ...field, height: 32 }} /></label>
      <label className="block mt-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>Detail
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} style={{ ...field, resize: "vertical" }} /></label>
      <label className="block mt-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>Note from you (shown on it — &quot;In the next update&quot;)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ ...field, height: 32 }} /></label>
      {(item.original_title || item.original_body) && (
        <div className="mt-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>
          As they sent it: <span style={{ color: T.ink2 }}>{item.original_title ?? item.title}{item.original_body ? ` — ${item.original_body}` : ""}</span>
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap mt-2 items-center">
        <span style={{ fontSize: F.xs, color: T.ink3 }}>Move to</span>
        {STATUSES.filter((s) => s.k !== "new" || item.status === "new").map((s) => (
          <button key={s.k} disabled={busy} onClick={() => save(s.k)} style={chip(item.status === s.k)}>{s.label}</button>
        ))}
        <button disabled={busy} onClick={() => save()} style={{ ...btn(false), height: 30, marginLeft: "auto" }}>Save words</button>
      </div>
      {err && <div className="mt-1" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ feedback

/** "Give feedback": one box (its first line is the title), what kind, and the page it came from. Coy's `admin` version puts an item straight on the board. */
export function FeedbackSheet({ open, onClose, onSent, admin }: { open: boolean; onClose: () => void; onSent?: () => void; admin?: boolean }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<RoadmapKind>("idea");
  const [status, setStatus] = useState<RoadmapStatus>("considering");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      // Where they were when they opened it (the Roadmap itself isn't worth noting).
      const from = new URLSearchParams(window.location.search).get("from") ?? window.location.pathname;
      setPage(from.startsWith("/dashboard/roadmap") ? null : from);
    });
    return () => { off = true; };
  }, [open]);

  const close = () => { onClose(); setSent(false); setErr(null); };
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await call("/api/roadmap", "POST", admin ? { add: true, body: text, status } : { body: text, kind, page });
      setText(""); setKind("idea"); setSent(true); onSent?.();
      if (admin) close();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={close} title={admin ? "Add to the roadmap" : "Give feedback"}
      sub={admin ? "Goes straight onto the board" : "Goes to the ScopeCrete team"}>
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {sent ? (
          <>
            <div style={{ fontSize: F.md, fontWeight: 600 }}>Thanks — it&apos;s in.</div>
            <div style={{ fontSize: F.sm, color: T.ink2 }}>
              Only you and the ScopeCrete team see it for now. If it goes on the Roadmap, everyone can vote on it, and you&apos;ll see it move from Planned to Released.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSent(false)} style={btn(false)}>Send another</button>
              <a href="/dashboard/roadmap" onClick={close} style={{ ...btn(true), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>See the roadmap</a>
            </div>
          </>
        ) : (
          <>
            {admin ? (
              <div className="flex gap-1.5 flex-wrap">
                {STATUSES.filter((s) => s.public).map((s) => <button key={s.k} onClick={() => setStatus(s.k)} style={chip(status === s.k)}>{s.label}</button>)}
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="What kind">
                {KINDS.map((k) => <button key={k.k} role="radio" aria-checked={kind === k.k} onClick={() => setKind(k.k)} style={chip(kind === k.k)}>{k.label}</button>)}
              </div>
            )}
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000} autoFocus
              aria-label={admin ? "The item: first line is its title" : "Your feedback: first line is its title"}
              placeholder={admin ? "Title on the first line\nDetail below" : "What would make ScopeCrete better?\nThe first line is the title; say more below."}
              style={{ ...field, resize: "vertical", fontSize: F.md }} />
            {!admin && page && <div style={{ fontSize: F.xs, color: T.ink3 }}>Sent with the page you were on: {page}</div>}
            {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
            <div className="flex justify-end">
              <button onClick={send} disabled={busy || text.trim().length < 3} style={{ ...btn(true), opacity: busy || text.trim().length < 3 ? 0.5 : 1 }}>
                {busy ? "Sending…" : admin ? "Add it" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
