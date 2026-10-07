"use client";
/**
 * Threads made from rules (migration 089; Coy, 2026-10-07).
 *
 *   RuleForm — channels, lines, inboxes, when, who, in / out, words. Used by
 *              the New thread sheet ("By rule") and Edit rule.
 *   RuleFeed — the list pane for a rule thread: what the rule catches, newest
 *              first, each row opening the person's thread (or the email).
 *
 * The rule is the filter; nothing is copied. src/lib/rule-threads.ts shapes it,
 * /api/threads/rule works it out.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, relTime, BUCKET } from "@/lib/v34/tokens";
import { EmptyState, MenuButton, Sheet } from "@/components/v34/primitives";
import { useThreads } from "@/components/v34/threads-ctx";
import { useLiveThreads } from "@/lib/v34/live-threads";
import { describeRule, RULE_WHO, RULE_WINDOWS, type RuleChannel, type ThreadRule } from "@/lib/rule-threads";
import type { CustomThread } from "@/lib/v34/threads";

export const EMPTY_RULE: ThreadRule = { channels: ["call", "text"], lines: [], inboxes: [], window: "all", who: [], direction: "any", words: "" };

interface Line { id: string; label: string; phone: string | null; provider: string | null }
interface Item { id: string; kind: "call" | "text" | "email"; at: string; direction: "in" | "out"; name: string; body: string; line: string | null; bucket: string | null; contact_id: string | null; href: string | null }

const CH_LABEL: Record<RuleChannel, string> = { call: "Calls", text: "Texts", email: "Emails" };
const WHO_LABEL: Record<string, string> = { customer: "Customers", vendor: "Vendors", personal: "Personal", unsorted: "Unsorted" };
const bucketColor = (b: string | null) => (b === "customer" ? BUCKET.customer : b === "vendor" ? BUCKET.vendor : b === "personal" ? BUCKET.personal : b === "unsorted" ? BUCKET.unsorted : T.ink3);

function useRuleOptions(on: boolean) {
  const [opts, setOpts] = useState<{ lines: Line[]; inboxes: string[] } | null>(null);
  useEffect(() => {
    if (!on) return;
    let off = false;
    fetch("/api/threads/rule?options=1").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && b) setOpts({ lines: b.lines ?? [], inboxes: b.inboxes ?? [] }); }).catch(() => {});
    return () => { off = true; };
  }, [on]);
  return opts;
}

function Chip({ on, onClick, children, color = T.ink }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="rounded px-2.5"
      style={{ height: 28, border: `1px solid ${on ? color : T.hairStrong}`, background: on ? `color-mix(in srgb, ${color} 12%, var(--sc-card))` : T.card,
        color: on ? T.ink : T.ink2, fontSize: F.xs, fontWeight: on ? 600 : 400, cursor: "pointer" }}>
      {on ? "✓ " : ""}{children}
    </button>
  );
}

const toggle = <X,>(list: X[], x: X) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** The rule's pickers. Empty lists mean "any". */
export function RuleForm({ rule, onChange }: { rule: ThreadRule; onChange: (r: ThreadRule) => void }) {
  const opts = useRuleOptions(true);
  const set = (p: Partial<ThreadRule>) => onChange({ ...rule, ...p });
  const phone = rule.channels.includes("call") || rule.channels.includes("text");
  const mail = rule.channels.includes("email");
  const row = "flex flex-wrap gap-1.5";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1"><span style={eyebrow}>Show</span>
        <div className={row}>{(["call", "text", "email"] as RuleChannel[]).map((c) => <Chip key={c} on={rule.channels.includes(c)} onClick={() => set({ channels: toggle(rule.channels, c) })}>{CH_LABEL[c]}</Chip>)}</div>
      </div>
      {phone && (opts?.lines.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1"><span style={eyebrow}>On the line {rule.lines.length ? "" : "· any"}</span>
          <div className={row}>{opts!.lines.map((l) => <Chip key={l.id} on={rule.lines.includes(l.id)} onClick={() => set({ lines: toggle(rule.lines, l.id) })}>{l.label}</Chip>)}</div>
        </div>
      )}
      {mail && (opts?.inboxes.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1"><span style={eyebrow}>Into the inbox {rule.inboxes.length ? "" : "· any"}</span>
          <div className={row}>{opts!.inboxes.map((a) => <Chip key={a} on={rule.inboxes.includes(a)} onClick={() => set({ inboxes: toggle(rule.inboxes, a) })}>{a}</Chip>)}</div>
        </div>
      )}
      <div className="flex flex-col gap-1"><span style={eyebrow}>When</span>
        <div className={row}>{RULE_WINDOWS.map((w) => <Chip key={w.k} on={rule.window === w.k} onClick={() => set({ window: w.k })}>{w.label}</Chip>)}</div>
      </div>
      <div className="flex flex-col gap-1"><span style={eyebrow}>Which way</span>
        <div className={row}>
          {(["any", "in", "out"] as const).map((d) => <Chip key={d} on={rule.direction === d} onClick={() => set({ direction: d })}>{d === "any" ? "Both" : d === "in" ? "Coming in" : "Sent out"}</Chip>)}
        </div>
        {mail && rule.direction === "out" && <span style={{ fontSize: F.xs, color: T.ink3 }}>Emails only come in, so “Sent out” leaves them out.</span>}
      </div>
      <div className="flex flex-col gap-1"><span style={eyebrow}>With {rule.who.length ? "" : "· anyone but spam"}</span>
        <div className={row}>{RULE_WHO.map((w) => <Chip key={w} color={bucketColor(w)} on={rule.who.includes(w)} onClick={() => set({ who: toggle(rule.who, w) })}>{WHO_LABEL[w]}</Chip>)}</div>
      </div>
      <label className="flex flex-col gap-1"><span style={eyebrow}>Words in it · optional</span>
        <input value={rule.words} onChange={(e) => set({ words: e.target.value.slice(0, 80) })} placeholder="bid" aria-label="Words"
          style={{ height: 36, width: "100%", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", background: T.card, color: T.ink, fontSize: F.sm }} />
      </label>
    </div>
  );
}

const ICON: Record<Item["kind"], React.ReactNode> = {
  call: <path d="M6.5 3.5l2 3-1.5 1.5a8 8 0 0 0 5 5l1.5-1.5 3 2-1 2.5c-6 0-11-5-11-11z" />,
  text: <path d="M3.5 4.5h13v9h-7l-3.5 3v-3h-2.5z" />,
  email: <><rect x="3" y="5" width="14" height="10" rx="1" /><path d="M3.5 5.5l6.5 5 6.5-5" /></>,
};

/** The list pane for a rule thread. */
export function RuleFeed({ thread, folded }: { thread: CustomThread; folded?: boolean }) {
  const ctx = useThreads();
  const [data, setData] = useState<{ items: Item[]; lines: Line[]; capped: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  useLiveThreads(() => setReload((n) => n + 1));
  useEffect(() => {
    let off = false;
    fetch(`/api/threads/rule?thread=${encodeURIComponent(thread.id)}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) { setData({ items: b.items ?? [], lines: b.lines ?? [], capped: !!b.capped }); setErr(null); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [thread.id, reload, thread.rule]);
  const lineName = (id: string) => data?.lines.find((l) => l.id === id)?.label ?? null;

  if (folded) {
    return (
      <div className="flex flex-col items-center">
        <button onClick={() => ctx?.setFolded(false)} aria-label="Show the list" className="flex items-center justify-center" style={{ width: "100%", height: 46, color: T.ink2, cursor: "pointer", borderBottom: `1px solid ${T.hairSoft}` }}>›</button>
        <div style={{ ...eyebrow, fontSize: 9, color: T.hiviz, padding: "4px 0" }}>{data?.items.length ?? ""}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="sticky top-[var(--sc-head)] lg:top-0" style={{ zIndex: 6, background: T.card, padding: "12px 12px 10px 14px", borderBottom: `1px solid ${T.hairSoft}` }}>
        <div className="flex items-center gap-2">
          <MenuButton onClick={() => ctx?.setDrawer(true)} label="Threads" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
              <span className="sc-page-title" style={{ fontFamily: disp, fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: T.hiviz, lineHeight: 1.1, ...clip }}>{thread.name}</span>
              <span className="sc-page-count" style={{ ...nums, fontSize: 13, color: T.ink3 }}>{data ? `${data.items.length}${data.capped ? "+" : ""}` : ""}</span>
            </div>
            {thread.rule && <div style={{ fontSize: 11.5, color: T.ink3, ...clip }}>{describeRule(thread.rule, lineName)}</div>}
          </div>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded px-2" style={{ ...eyebrow, height: 26, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.chalk, cursor: "pointer" }}>Edit rule</button>
        </div>
      </div>
      {err ? <EmptyState tone="warn" title="Couldn't read this thread" detail={err} />
        : !data ? (
          <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState title="Nothing matches yet" detail="Calls, texts and emails that fit the rule land here as they come in." />
        ) : (
          <div>
            {data.items.map((it) => {
              const row = (
                <div className="flex items-start gap-2.5 px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                  <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 30, height: 30, border: `1px solid ${bucketColor(it.bucket)}`, color: bucketColor(it.bucket), marginTop: 1 }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{ICON[it.kind]}</svg>
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="flex items-baseline gap-2">
                      <span style={{ fontSize: F.sm, fontWeight: 600, ...clip, flex: 1, minWidth: 0 }}>{it.name}</span>
                      <span style={{ fontSize: 11, color: T.ink3, ...nums, flexShrink: 0 }}>{relTime(it.at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {it.direction === "out" ? "You: " : ""}{it.body}
                    </div>
                    {it.line && <div style={{ fontSize: 10.5, color: T.ink3, ...clip }}>{it.kind === "email" ? "to " : "via "}{it.line}</div>}
                  </div>
                </div>
              );
              return it.href
                ? <Link key={it.id} href={it.kind === "email" ? it.href : `${it.href}?t=${encodeURIComponent(thread.id)}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>{row}</Link>
                : <div key={it.id}>{row}</div>;
            })}
            {data.capped && <div style={{ fontSize: F.xs, color: T.ink3, padding: "10px 14px" }}>Showing the newest 200 of each kind — narrow the rule to see further back.</div>}
          </div>
        )}
      {editing && thread.rule && <EditRule thread={thread} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); ctx?.refresh(); setReload((n) => n + 1); }} />}
    </div>
  );
}

function EditRule({ thread, onClose, onSaved }: { thread: CustomThread; onClose: () => void; onSaved: () => void }) {
  const [rule, setRule] = useState<ThreadRule>(thread.rule ?? EMPTY_RULE);
  const [name, setName] = useState(thread.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/threads/custom/${thread.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rule, name }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Edit rule" sub="What this thread shows.">
      <div className="px-4 py-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1"><span style={eyebrow}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            style={{ height: 38, width: "100%", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", background: T.card, color: T.ink, fontSize: F.sm }} /></label>
        <RuleForm rule={rule} onChange={setRule} />
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-4" style={{ height: 36, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, fontFamily: disp, fontSize: F.xs, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => void save()} disabled={busy || !rule.channels.length || !name.trim()} className="rounded px-4"
            style={{ height: 36, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: busy || !rule.channels.length || !name.trim() ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Sheet>
  );
}
