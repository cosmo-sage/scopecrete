"use client";
/**
 * Questions pinned on a sheet (Coy, 2026-10-10: "If I want to ask Jeremy a question about these
 * sections I measured … tag him and the communications would be pulled into the existing thread
 * for that contact … he could open and see the full drawing and zoom into the areas of question").
 *
 * **Ask** on the takeoff toolbar, then a click on the sheet (or **Ask about this** on a picked
 * shape) drops a pin; pick who, write the question, Send. Each person gets it as an internal note
 * on their own thread (tagging a teammate notifies them), and a tick texts them the link through
 * Quo on the same tap. The link opens this sheet zoomed to the pin (src/lib/plan-pins.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, disp, relTime } from "@/lib/v34/tokens";
import { noteParts } from "@/lib/mentions";
import { pinFromQuery, pinParts, pinText, pinWhere, sameSpot, type PinSpot } from "@/lib/plan-pins";
import type { Pt } from "@/lib/takeoff";
import { call } from "./shared";

export interface SheetPin { id: string; at: string; by: string | null; mine: boolean; contact_id: string | null; contact_name: string | null; body: string; spot: PinSpot }
export interface PinPerson { key: string; name: string; contact_id: string | null; user_id: string | null; phone: string | null; role: string }

/** Pins grouped by spot: the first is the question, the rest replies. */
function bySpot(pins: SheetPin[]) {
  const out: Array<{ x: number; y: number; m: string | null; notes: SheetPin[] }> = [];
  for (const p of pins) {
    const g = out.find((s) => sameSpot(s, p.spot));
    if (g) g.notes.push(p); else out.push({ x: p.spot.x, y: p.spot.y, m: p.spot.m, notes: [p] });
  }
  return out;
}

export function usePlanPins({ jobId, sheetId, sheetName, shapeName, query, setZoom, setSelId }: {
  jobId: string; sheetId: string | null; sheetName: string;
  /** The name of a shape by id, for "AERIAL 2 · Curbs 2". */
  shapeName: (id: string | null) => string | null;
  /** The page's own ?pin=&z=&m= (a link from a thread or a text). */
  query: { pin: string | null; z: string | null; m: string | null; sheet: string | null };
  setZoom: (z: number) => void; setSelId: (id: string | null) => void;
}) {
  const [pins, setPins] = useState<SheetPin[]>([]);
  const [people, setPeople] = useState<PinPerson[]>([]);
  const [limited, setLimited] = useState(false);
  const [askMode, setAskMode] = useState(false);
  // The open spot: a new pin being written, or a group of notes.
  const [open, setOpen] = useState<{ x: number; y: number; m: string | null; fresh: boolean } | null>(null);
  const load = useCallback(async () => {
    if (!sheetId) return;
    try {
      const d = await call(`/api/jobs/${jobId}/takeoff/comments?sheet=${sheetId}`, "GET");
      setPins((d.pins ?? []) as SheetPin[]); setPeople((d.people ?? []) as PinPerson[]); setLimited(!!d.limited);
    } catch { /* pins are extra; the takeoff works without them */ }
  }, [jobId, sheetId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  // A link to a pin: zoom there once, pick its shape, open it.
  const linked = useMemo(() => (query.sheet && query.sheet === sheetId ? pinFromQuery(query.pin, query.z, query.m) : null), [query.pin, query.z, query.m, query.sheet, sheetId]);
  const done = useRef<string | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const k = linked ? `${sheetId}:${linked.x},${linked.y}` : null;
    if (!linked || done.current === k) return;
    done.current = k;
    Promise.resolve().then(() => {
      setZoom(linked.z); if (linked.m) setSelId(linked.m);
      setFocus({ x: linked.x, y: linked.y }); setOpen({ x: linked.x, y: linked.y, m: linked.m, fresh: false });
    });
  }, [linked, sheetId, setZoom, setSelId]);

  const groups = useMemo(() => bySpot(pins), [pins]);
  const place = useCallback((p: Pt, m: string | null) => { setAskMode(false); setOpen({ x: p[0], y: p[1], m, fresh: true }); }, []);

  const layer = (scale: number) => (
    <PinLayer scale={scale} groups={groups} open={open} focus={focus} onFocused={() => setFocus(null)}
      onOpen={(g) => { setOpen({ x: g.x, y: g.y, m: g.m, fresh: false }); if (g.m) setSelId(g.m); }} />
  );
  const openGroup = open ? groups.find((g) => sameSpot(g, open)) ?? null : null;
  const panel = open ? (
    <PinPanel key={`${open.x},${open.y}`} jobId={jobId} sheetId={sheetId} limited={limited} people={people}
      where={pinWhere(sheetName, shapeName(open.m))} spot={open} notes={openGroup?.notes ?? []}
      onClose={() => setOpen(null)} onSent={load} />
  ) : null;
  return { askMode, setAskMode, place, layer, panel, count: groups.length, limited };
}

/** The pins over the drawing, numbered, in the sheet's own points × the drawing's scale. */
function PinLayer({ scale, groups, open, focus, onFocused, onOpen }: {
  scale: number; groups: ReturnType<typeof bySpot>; open: { x: number; y: number } | null;
  focus: { x: number; y: number } | null; onFocused: () => void; onOpen: (g: ReturnType<typeof bySpot>[number]) => void;
}) {
  const focusRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!focus || !scale || !focusRef.current) return;
    // After the zoomed page has laid out.
    const t = window.setTimeout(() => { focusRef.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); onFocused(); }, 250);
    return () => window.clearTimeout(t);
  }, [focus, scale, onFocused]);
  if (!scale) return null;
  const spots = [...groups.map((g) => ({ ...g, n: groups.indexOf(g) + 1 }))];
  const loose = open && !groups.some((g) => sameSpot(g, open)) ? open : null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
      {focus && <span ref={focusRef} style={{ position: "absolute", left: focus.x * scale - 60, top: focus.y * scale - 60, width: 120, height: 120 }} />}
      {focus && (
        <span aria-hidden="true" className="sc-pin-ring" style={{ position: "absolute", left: focus.x * scale - 34, top: focus.y * scale - 34, width: 68, height: 68, borderRadius: "50%", border: `3px solid ${T.hiviz}`, boxShadow: `0 0 0 4px ${T.hivizDim}` }} />
      )}
      {spots.map((g) => {
        const on = !!open && sameSpot(open, g);
        return (
          <button key={`${g.x},${g.y}`} type="button" onClick={(e) => { e.stopPropagation(); onOpen(g); }} onPointerUp={(e) => e.stopPropagation()}
            title={`${g.notes.length} note${g.notes.length === 1 ? "" : "s"} here`} aria-label={`Question ${g.n}: ${g.notes.length} note${g.notes.length === 1 ? "" : "s"}`}
            style={{ position: "absolute", left: g.x * scale - 14, top: g.y * scale - 32, pointerEvents: "auto", cursor: "pointer", border: "none", background: "transparent", padding: 0 }}>
            <PinIcon n={g.n} on={on} />
          </button>
        );
      })}
      {loose && <span style={{ position: "absolute", left: loose.x * scale - 14, top: loose.y * scale - 32 }}><PinIcon n={null} on /></span>}
    </div>
  );
}

function PinIcon({ n, on }: { n: number | null; on: boolean }) {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" aria-hidden="true" style={{ display: "block", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" }}>
      <path d="M14 33C14 33 2 20.5 2 13a12 12 0 0 1 24 0c0 7.5-12 20-12 20z" fill={on ? T.hiviz : "#1E5AA8"} stroke="#fff" strokeWidth="2" />
      {n !== null ? <text x="14" y="17.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{n}</text>
        : <text x="14" y="18" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">?</text>}
    </svg>
  );
}

/** The spot's conversation, and the box to ask (or reply). */
function PinPanel({ jobId, sheetId, limited, people, where, spot, notes, onClose, onSent }: {
  jobId: string; sheetId: string | null; limited: boolean; people: PinPerson[]; where: string;
  spot: { x: number; y: number; m: string | null; fresh: boolean }; notes: SheetPin[]; onClose: () => void; onSent: () => Promise<void>;
}) {
  // A reply goes to the people the question went to; a new pin starts with no one picked.
  const first = notes[0];
  const askedBefore = useMemo(() => new Set(notes.map((n) => n.contact_id).filter(Boolean) as string[]), [notes]);
  const [to, setTo] = useState<Set<string>>(() => new Set(people.filter((p) => p.contact_id && askedBefore.has(p.contact_id)).map((p) => p.key)));
  const [words, setWords] = useState("");
  const [text, setText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const picked = people.filter((p) => to.has(p.key));
  const canText = picked.some((p) => p.contact_id && p.phone);

  const send = async () => {
    if (!sheetId || !words.trim() || !picked.length) return;
    setBusy(true); setMsg(null);
    try {
      const d = await call(`/api/jobs/${jobId}/takeoff/comments`, "POST", {
        sheet_id: sheetId, x: spot.x, y: spot.y, z: 3, measurement_id: spot.m, where, words,
        to: picked.map((p) => ({ contact_id: p.contact_id, user_id: p.user_id })),
      });
      const sentTo: string[] = [];
      const failed: string[] = [];
      if (text) {
        // Coy's tap texts them the link through Quo (§6 Texts send through Quo).
        const plain = noteParts(words).map((p) => p.text).join("");
        for (const n of (d.notes ?? []) as Array<{ contact_id: string; name: string; phone: string | null; first: string | null }>) {
          if (!n.phone) continue;
          try { await call("/api/texts", "POST", { contact_id: n.contact_id, body: pinText(n.first, where, plain, window.location.origin, d.link) }); sentTo.push(n.name); }
          catch (e) { failed.push(`${n.name}: ${e instanceof Error ? e.message : e}`); }
        }
      }
      setWords("");
      setMsg([`Saved on ${picked.map((p) => p.name).join(", ")}'s thread${picked.length === 1 ? "" : "s"}.`, sentTo.length ? `Texted ${sentTo.join(", ")}.` : "", failed.length ? `Text not sent — ${failed.join("; ")}` : ""].filter(Boolean).join(" "));
      await onSent();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-label={`Questions on ${where}`} className="rounded flex flex-col"
      style={{ position: "absolute", top: 8, right: 8, zIndex: 7, width: "min(360px, calc(100% - 16px))", maxHeight: "calc(100% - 16px)", background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 8px 28px rgba(0,0,0,.22)" }}>
      <div className="flex items-center gap-2" style={{ padding: "8px 10px", borderBottom: `1px solid ${T.hair}` }}>
        <PinIcon n={null} on />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: T.ink2 }}>{first ? "Question" : "Ask about this spot"}</div>
          <div style={{ fontSize: 13, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{where}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: "none", background: "transparent", fontSize: 18, color: T.ink3, cursor: "pointer" }}>×</button>
      </div>
      {notes.length > 0 && (
        <div className="flex flex-col gap-2" style={{ padding: 10, overflowY: "auto", minHeight: 0 }}>
          {notes.map((n) => {
            const parts = pinParts(n.body);
            return (
              <div key={n.id} className="rounded" style={{ background: n.mine ? T.hivizDim : T.sunk, padding: "6px 9px" }}>
                <div style={{ fontSize: 11, color: T.ink3 }}>
                  <b style={{ color: T.ink2 }}>{n.by ?? "Note"}</b>{n.contact_name ? ` → on ${n.contact_name}'s thread` : ""} · {relTime(n.at)}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", color: T.ink }}>
                  {noteParts(parts?.words ?? n.body).map((p, i) => p.user
                    ? <span key={i} className="rounded px-1" style={{ background: T.chalkDim, color: T.chalk, fontWeight: 600 }}>{p.text}</span>
                    : <React.Fragment key={i}>{p.text}</React.Fragment>)}
                </div>
                {n.contact_id && !limited && <a href={`/dashboard/messages/${n.contact_id}?channel=notes`} style={{ fontSize: 11.5, color: T.chalk }}>Open their thread ›</a>}
              </div>
            );
          })}
          {notes.length > 0 && <div style={{ fontSize: 11, color: T.ink3 }}>A texted answer comes back on their thread.</div>}
        </div>
      )}
      {limited ? (
        <div style={{ padding: 10, fontSize: 12.5, color: T.ink2, borderTop: `1px solid ${T.hair}` }}>Answer by text or call. It lands on your thread with them.</div>
      ) : (
        <div className="flex flex-col gap-2" style={{ padding: 10, borderTop: notes.length ? `1px solid ${T.hair}` : undefined }}>
          <div style={{ fontSize: 11.5, color: T.ink3 }}>{first ? "Reply to" : "Ask"}</div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = to.has(p.key);
              return (
                <button key={p.key} type="button" aria-pressed={on} title={p.role}
                  onClick={() => setTo((s) => { const n = new Set(s); if (on) n.delete(p.key); else n.add(p.key); return n; })}
                  style={{ height: 28, padding: "0 9px", borderRadius: 14, fontSize: 12.5, cursor: "pointer", border: `1px solid ${on ? T.hiviz : T.hairStrong}`, background: on ? T.hivizDim : T.card, color: on ? T.hivizText : T.ink, fontWeight: on ? 600 : 400 }}>
                  {on ? "✓ " : ""}{p.name}
                </button>
              );
            })}
            {!people.length && <span style={{ fontSize: 12, color: T.ink3 }}>Nobody on this job yet. Put the customer, a vendor or a teammate on it first.</span>}
          </div>
          <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} aria-label="Your question"
            placeholder={first ? "Reply…" : "What do you need to know here?"}
            style={{ width: "100%", resize: "vertical", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: 8, fontSize: 14, color: T.ink, background: T.card }} />
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: canText ? T.ink2 : T.ink3, cursor: canText ? "pointer" : "default" }}>
            <input type="checkbox" checked={text && canText} disabled={!canText} onChange={(e) => setText(e.target.checked)} />
            Also text them the link{canText ? "" : " (no number to text)"}
          </label>
          <div className="flex items-center gap-2">
            <span style={{ flex: 1, fontSize: 11, color: T.ink3 }}>Saved on their thread{picked.some((p) => p.user_id) ? "; teammates are tagged" : ""}.</span>
            <button type="button" onClick={() => void send()} disabled={busy || !words.trim() || !picked.length}
              style={{ height: 32, padding: "0 14px", borderRadius: 3, border: "none", background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 12.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", opacity: busy || !words.trim() || !picked.length ? 0.5 : 1 }}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {msg && <div style={{ padding: "0 10px 10px", fontSize: 12, color: /not|can't|error|Who|Write/i.test(msg) ? T.red : T.green }}>{msg}</div>}
    </div>
  );
}

/** The toolbar's Ask button: a speech bubble with a pin. */
export function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h14v9H9l-4 3v-3H3z" fill="currentColor" fillOpacity=".15" />
      <path d="M8.2 7.4a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.6-.8 1.1M10 11.6v.1" />
    </svg>
  );
}

/** The middle of a shape's box, where "Ask about this" drops its pin. */
export const shapeMiddle = (pts: Pt[]): Pt => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

