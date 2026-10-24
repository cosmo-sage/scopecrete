"use client";
/**
 * The chat on one vendor's bid link (migration 130; Coy, 2026-10-24: "a chat channel (which would
 * be an 'internal chat' on scopecrete) that has communications tied to each job through which i
 * would send the bid request … discuss availability on a mobile friendly page"). One thread per
 * vendor per bid request: Coy's side writes from the job's bid request or the vendor's page
 * (`/api/bid-requests/recipients/[id]/chat`, session client), the vendor from their link
 * (`/api/b/[token]/chat`, the token's door). Read again every 15 s while open and visible.
 * Nothing is texted or emailed — the vendor sees it when they open their link.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface ChatMsg { id: string; side: "org" | "vendor"; name: string | null; body: string; at: string }
export interface ChatPalette { ink: string; ink2: string; ink3: string; hair: string; card: string; mine: string; theirs: string; accent: string; onAccent: string; red: string }

const at = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export function BidChat({ url, mine, pal, empty, onLoad, disabled }: {
  url: string;
  mine: "org" | "vendor";
  pal: ChatPalette;
  empty: string;
  /** Whatever else the read returned (the vendor's availability). */
  onLoad?: (j: Record<string, unknown>) => void;
  disabled?: string | null;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoad);
  useEffect(() => { loadRef.current = onLoad; }, [onLoad]);

  const load = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r) return;
    const j = await r.json().catch(() => ({}));
    if (j?.missing) { setMissing(String(j.missing)); setMsgs([]); return; }
    if (!r.ok) { setErr(j?.error ?? "Couldn't load the messages."); return; }
    setMsgs(Array.isArray(j.messages) ? j.messages : []);
    loadRef.current?.(j);
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the read on open, then every 15 s
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setText("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (missing) return <div style={{ fontSize: 13, color: pal.ink3 }}>{missing}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {msgs === null ? <div style={{ fontSize: 13, color: pal.ink3 }}>Loading…</div>
          : msgs.length === 0 ? <div style={{ fontSize: 13, color: pal.ink3 }}>{empty}</div>
          : msgs.map((m) => {
            const me = m.side === mine;
            return (
              <div key={m.id} style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                <div style={{ background: me ? pal.mine : pal.theirs, color: pal.ink, borderRadius: 10, padding: "7px 10px", fontSize: 14.5, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
                <div style={{ fontSize: 11, color: pal.ink3, marginTop: 2, textAlign: me ? "right" : "left" }}>{m.name ? `${m.name} · ` : ""}{at(m.at)}</div>
              </div>
            );
          })}
        <div ref={end} />
      </div>
      {disabled ? <div style={{ fontSize: 13, color: pal.ink3 }}>{disabled}</div> : (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
            style={{ flex: 1, minWidth: 0, border: `1px solid ${pal.hair}`, borderRadius: 6, padding: 8, fontSize: 16, background: pal.card, color: pal.ink, resize: "vertical", fontFamily: "inherit" }} />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()}
            style={{ height: 40, padding: "0 16px", borderRadius: 6, border: "none", background: pal.accent, color: pal.onAccent, fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: busy || !text.trim() ? 0.5 : 1 }}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 13, color: pal.red }}>{err}</div>}
    </div>
  );
}
