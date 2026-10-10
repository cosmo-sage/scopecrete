"use client";

/**
 * Lines (Claude Design package 9, `Lines.dc.html` A; was "Phone lines") —
 * every number of yours, what runs it, and whether it's talking to the app.
 * A line is an org_phone_numbers row (migration 035); its events are the raw
 * log, quo_events (§2a), read by /api/lines. One person calling two of your
 * lines is still one thread; each message carries the line it came in on.
 *
 * Desktop: line cards on the left, providers on the right (360px). Phone: the
 * cards stacked, providers under them, + opens Add a line full screen.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, relTime, formatPhone } from "@/lib/v34/tokens";
import { EmptyState, Sheet } from "@/components/v34/primitives";
import { LEAD_SOURCES } from "@/lib/jobs/stages";
import { LINE_COLORS, PROVIDERS, PROVIDER_CARDS, providerCard } from "@/lib/lines";

interface Line {
  id: string; phone_e164: string; label: string | null; is_primary: boolean; active: boolean;
  provider: string | null; default_lead_source: string | null; color: string; color_token: string | null;
  today: { calls: number; texts: number }; last_event: { at: string; type: string } | null;
  events_7d: number; failed_7d: number; failure: string | null; webhook: string | null;
}
interface Provider { k: string; name: string; short: string; mark: string; built: boolean; how: string; lines: number; connected: boolean; note: string }

const colorVar = (c: string) => (T as unknown as Record<string, string>)[c] ?? T.hiviz;

export default function LinesScreen() {
  const [data, setData] = useState<{ lines: Line[]; providers: Provider[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [removing, setRemoving] = useState<Line | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/lines")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setData({ lines: b.lines ?? [], providers: b.providers ?? [] }); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const save = useCallback(async (id: string, body: Record<string, unknown>) => {
    setSaving(id); setError(null);
    try {
      const r = await fetch(`/api/lines/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setTick((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(null); }
  }, []);
  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  const btn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.xs, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" };
  const field: React.CSSProperties = { height: 32, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, padding: "0 6px", width: "100%", minWidth: 0 };
  const link: React.CSSProperties = { fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: T.chalk, whiteSpace: "nowrap" };

  return (
    <div style={{ color: T.ink }}>
      <div className="flex items-start gap-2 flex-wrap" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "12px 16px 10px" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: disp, fontSize: 26, fontWeight: 600, lineHeight: 1.05 }}>Lines</div>
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
            Every number of yours, what runs it, and whether it&apos;s talking to the app. One person calling two lines is still one thread.
          </div>
        </div>
        <Link href="/dashboard/more/logs" className="no-underline flex items-center" style={{ ...btn, border: `1px solid ${T.hairStrong}`, color: T.ink, background: T.card }}>Logs ›</Link>
        <button onClick={() => setAdding(true)} className="hidden lg:block" style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: "none" }}>+ Add a line</button>
        {error && <div style={{ fontSize: F.xs, color: T.red, width: "100%" }}>{error}</div>}
      </div>

      {data === null && !error && <div className="p-4" style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>}
      {data && (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]" style={{ padding: "14px 16px" }}>
          <div className="flex flex-col gap-3 min-w-0">
            {data.lines.length === 0 && <EmptyState title="No lines yet" detail="+ Add a line puts in a number of yours and the provider that runs it." />}
            {data.lines.map((l) => {
              const p = providerCard(l.provider);
              const failing = l.failed_7d > 0;
              return (
                <div key={l.id} className="rounded flex flex-col gap-2.5" style={{ background: T.card, border: `1px solid ${T.hair}`, borderLeft: `3px solid ${colorVar(l.color)}`, padding: "12px 14px", opacity: saving === l.id ? 0.6 : 1 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span style={{ fontFamily: disp, fontSize: 20, fontWeight: 600, ...nums }}>{formatPhone(l.phone_e164)}</span>
                    <input defaultValue={l.label ?? ""} placeholder="Name it" aria-label="Line name"
                      onBlur={(e) => { if (e.target.value.trim() !== (l.label ?? "")) void save(l.id, { label: e.target.value }); }}
                      style={{ fontFamily: "var(--sc-font-strong)", fontSize: 13.5, fontWeight: 600, color: T.ink2, border: "none", borderBottom: `1px dashed ${T.hair}`, background: "transparent", width: 150 }} />
                    {l.is_primary
                      ? <span className="rounded px-1.5" style={{ ...eyebrow, color: T.hiviz, border: `1px solid ${T.hiviz}` }}>Primary</span>
                      : <button onClick={() => void save(l.id, { is_primary: true })} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Make primary</button>}
                    {!l.active && <span style={{ ...eyebrow, color: T.ink3 }}>Inactive</span>}
                    <span className="flex-1" />
                    <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: failing ? T.red : l.events_7d ? T.green : T.ink3 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: failing ? T.red : l.events_7d ? T.green : T.hair }} />
                      {failing ? `${l.failed_7d} event${l.failed_7d === 1 ? "" : "s"} failed` : l.events_7d ? "Healthy" : "No events this week"}
                    </span>
                  </div>
                  <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                    <label className="min-w-0">
                      <div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Provider</div>
                      <div className="flex items-center gap-1.5" style={{ ...field, padding: "0 4px" }}>
                        {p && <span className="rounded flex items-center justify-center shrink-0" style={{ width: 18, height: 18, background: p.mark || T.ink, color: "#fff", fontSize: 9, fontWeight: 700 }}>{p.short}</span>}
                        <select value={l.provider ?? ""} onChange={(e) => void save(l.id, { provider: e.target.value })} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: F.sm, color: T.ink }}>
                          <option value="">Not set</option>
                          {PROVIDERS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
                        </select>
                      </div>
                    </label>
                    <label className="min-w-0">
                      <div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>A new caller here is a…</div>
                      <select value={l.default_lead_source ?? ""} onChange={(e) => void save(l.id, { default_lead_source: e.target.value })} style={field}>
                        <option value="">No default source</option>
                        {LEAD_SOURCES.map((s) => <option key={s.k} value={s.k}>{s.label} lead</option>)}
                      </select>
                    </label>
                    <div className="min-w-0">
                      <div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Today</div>
                      <div className="flex items-center" style={{ ...field, border: `1px solid ${T.hairSoft}`, background: T.slab, ...nums }}>
                        <b>{l.today.calls}</b>&nbsp;call{l.today.calls === 1 ? "" : "s"}&nbsp;&nbsp;<b>{l.today.texts}</b>&nbsp;text{l.today.texts === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Last event</div>
                      <div className="flex items-center" style={{ ...field, border: `1px solid ${T.hairSoft}`, background: T.slab, ...clip }}>
                        {l.last_event ? <>{relTime(l.last_event.at)} · <span style={{ fontFamily: "var(--sc-font-code)", fontSize: 11.5, marginLeft: 4 }}>{l.last_event.type}</span></> : "None this week"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Webhook</span>
                    {l.webhook ? (
                      <>
                        <span className="rounded flex items-center px-2" style={{ height: 28, flex: "1 1 200px", minWidth: 0, background: T.slab, border: `1px solid ${T.hairSoft}`, fontFamily: "var(--sc-font-code)", fontSize: 11.5, ...clip }}>{l.webhook}</span>
                        <button onClick={() => copy(l.webhook!, l.id)} style={{ ...btn, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink }}>{copied === l.id ? "Copied" : "Copy"}</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: T.ink3, flex: 1 }}>
                        {l.provider ? `${p?.name ?? l.provider}'s intake isn't built yet — its events can't reach the app.` : "Pick the provider that runs this number."}
                      </span>
                    )}
                    <span style={{ width: 1, height: 18, background: T.hair }} />
                    <Link href={`/dashboard/messages?t=customers`} className="no-underline" style={link} title="Threads (every thread shows which line each message came through)">Threads ›</Link>
                    <Link href={`/dashboard/more/logs?line=${l.id}`} className="no-underline" style={link}>Logs ›</Link>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Color</span>
                    {LINE_COLORS.map((c) => (
                      <button key={c} aria-label={`Color ${c}`} onClick={() => void save(l.id, { color_token: c })}
                        style={{ width: 16, height: 16, borderRadius: 8, background: colorVar(c), border: l.color === c ? `2px solid ${T.ink}` : `1px solid ${T.hair}`, cursor: "pointer" }} />
                    ))}
                    <span className="flex-1" />
                    {!l.is_primary && (
                      <button onClick={() => setRemoving(l)} style={{ ...btn, height: 28, border: `1px solid ${T.hair}`, background: T.card, color: T.red }}>Delete</button>
                    )}
                  </div>
                  {failing && (
                    <div className="rounded flex items-center gap-2" style={{ background: T.red, color: "#fff", fontSize: 12.5, padding: "8px 10px", borderRadius: 3 }}>
                      <span style={{ flex: 1 }}>{l.failed_7d} event{l.failed_7d === 1 ? "" : "s"} reached this line but not the app{l.failure ? ` — ${l.failure}` : ""}.</span>
                      <Link href={`/dashboard/more/logs?line=${l.id}&event=needs`} className="no-underline rounded px-2 flex items-center" style={{ height: 26, border: "1px solid #fff", color: "#fff", fontFamily: disp, fontSize: 11, textTransform: "uppercase" }}>Retry ›</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2.5 min-w-0">
            <div style={eyebrow}>Providers</div>
            {data.providers.map((p) => (
              <div key={p.k} className="rounded flex items-center gap-2.5" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "10px 12px" }}>
                <span className="rounded flex items-center justify-center shrink-0" style={{ width: 30, height: 30, background: p.mark || T.ink, color: "#fff", fontSize: 12, fontWeight: 700 }}>{p.short}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: T.ink3 }}>{p.note}</div>
                </div>
                {p.built
                  ? <Link href={`/dashboard/more/logs?provider=${p.k}`} className="no-underline flex items-center" style={{ ...btn, height: 28, border: `1px solid ${T.hairStrong}`, color: T.ink, background: T.card }}>Events ›</Link>
                  : <span style={{ ...btn, height: 28, display: "flex", alignItems: "center", border: `1px solid ${T.hair}`, color: T.ink3, cursor: "default" }} title="This provider's intake isn't built yet">Not built</span>}
              </div>
            ))}
            <div className="rounded" style={{ background: T.slab, padding: "10px 12px", fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
              <b>How a line reaches Threads.</b>{" "}The provider sends each call and text to the line&apos;s webhook. It is saved as it arrived, before anything reads it, then filed into Threads on the person whose number it is. Logs shows every event, so one that arrived but never reached Threads is easy to spot and replay.
            </div>
          </div>
        </div>
      )}

      {/* Phone: + opens Add a line. */}
      <button onClick={() => setAdding(true)} className="lg:hidden fixed rounded-full flex items-center justify-center" aria-label="Add a line"
        style={{ right: 16, bottom: "calc(var(--sc-foot, 58px) + 16px)", width: 52, height: 52, background: T.hiviz, color: T.onHiviz, fontSize: 26, boxShadow: "0 4px 14px rgba(0,0,0,.25)", zIndex: 20 }}>+</button>

      <DeleteLine key={removing?.id ?? "none"} line={removing} onClose={() => setRemoving(null)} onDeleted={() => { setRemoving(null); setTick((n) => n + 1); }} />
      <AddLine open={adding} onClose={() => setAdding(false)} onSaved={() => setTick((n) => n + 1)} />
    </div>
  );
}

/* --------------------------------------------------------- Delete a line */

function DeleteLine({ line, onClose, onDeleted }: { line: Line | null; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!line) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/lines/${line.id}`, { method: "DELETE" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      onDeleted();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const btn: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 4, fontFamily: disp, fontSize: F.xs, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" };
  return (
    <Sheet open={!!line} onClose={onClose} title="Delete this line?" sub={line ? `${formatPhone(line.phone_e164)}${line.label ? ` · ${line.label}` : ""}` : undefined}>
      <div className="px-4 py-3 flex flex-col gap-3" style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
        <div>It comes off your Lines. Calls and texts that already came in on it stay in Threads and Logs, still marked with this line. You can add the number back later with + Add a line.</div>
        <div style={{ fontSize: 12, color: T.ink3 }}>Point the provider&apos;s webhook away from it too, or new calls and texts on it will still arrive.</div>
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <div className="flex justify-end gap-2" style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 10 }}>
          <button onClick={onClose} style={{ ...btn, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink }}>Cancel</button>
          <button onClick={() => void go()} disabled={busy} style={{ ...btn, border: "none", background: T.red, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Deleting…" : "Delete line"}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ Add a line */

function AddLine({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState("quo");
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; webhook: string | null } | null>(null);
  const [heard, setHeard] = useState<{ at: string; type: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const p = PROVIDER_CARDS.find((x) => x.k === provider)!;

  // After saving: "Waiting for the first event…" until one arrives on this number.
  useEffect(() => {
    if (!saved) return;
    let off = false;
    const look = () => fetch("/api/lines").then((r) => (r.ok ? r.json() : null)).then((b) => {
      const l = (b?.lines ?? []).find((x: Line) => x.id === saved.id);
      if (!off && l?.last_event) setHeard(l.last_event);
    }).catch(() => {});
    void look();
    const t = setInterval(look, 10_000);
    return () => { off = true; clearInterval(t); };
  }, [saved]);

  const close = () => { setSaved(null); setHeard(null); setPhone(""); setLabel(""); setSource(""); setErr(null); onClose(); };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/lines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, label, provider, default_lead_source: source || null }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setSaved({ id: b.line.id, webhook: b.line.webhook ?? null }); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const field: React.CSSProperties = { height: 36, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, padding: "0 8px", width: "100%" };
  const step: React.CSSProperties = { ...eyebrow, color: T.ink, marginBottom: 6 };
  const webhook = saved?.webhook ?? (provider === "quo" ? "(shown once you save)" : null);

  return (
    <Sheet open={open} onClose={close} title="Add a line" sub="A number of yours and what runs it">
      <div className="px-4 py-3 flex flex-col gap-4">
        <div>
          <div style={step}>1 · Who runs the number</div>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDER_CARDS.map((x) => {
              const on = provider === x.k;
              return (
                <button key={x.k} onClick={() => !saved && setProvider(x.k)} className="text-left rounded flex flex-col gap-1"
                  style={{ padding: "8px 10px", border: `1px solid ${on ? T.hiviz : T.hair}`, background: on ? T.hivizDim : T.card, cursor: saved ? "default" : "pointer", opacity: x.built || on ? 1 : 0.7 }}>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded flex items-center justify-center" style={{ width: 18, height: 18, background: x.mark || T.ink, color: "#fff", fontSize: 9, fontWeight: 700 }}>{x.short}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{x.name}</span>
                  </span>
                  <span style={{ fontSize: 11, color: T.ink3, lineHeight: 1.35 }}>{x.how}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={step}>2 · The number</div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!saved} inputMode="tel" placeholder="(225) 555-0100" style={field} />
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
            {provider === "quo" ? "The number as it is in your Quo account. (Reading your Quo numbers needs QUO_API_KEY set — type it for now.)" : "The number this provider answers."}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label><div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>Name</div>
              <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!!saved} placeholder="Main, Website, Crew…" style={field} /></label>
            <label><div style={{ ...eyebrow, fontSize: 9.5, color: T.ink3 }}>A new caller here is a…</div>
              <select value={source} onChange={(e) => setSource(e.target.value)} disabled={!!saved} style={field}>
                <option value="">No default source</option>
                {LEAD_SOURCES.map((s) => <option key={s.k} value={s.k}>{s.label} lead</option>)}
              </select></label>
          </div>
        </div>
        <div>
          <div style={step}>3 · Point the provider here</div>
          {p.built ? (
            <>
              <div className="flex items-center gap-2">
                <span className="rounded flex items-center px-2" style={{ height: 30, flex: 1, minWidth: 0, background: T.slab, border: `1px solid ${T.hairSoft}`, fontFamily: "var(--sc-font-code)", fontSize: 11.5, ...clip }}>{webhook}</span>
                {saved?.webhook && <button onClick={() => void navigator.clipboard?.writeText(saved.webhook!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                  className="rounded px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, fontFamily: disp, fontSize: 11, textTransform: "uppercase", cursor: "pointer" }}>{copied ? "Copied" : "Copy"}</button>}
              </div>
              <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 6, lineHeight: 1.45 }}>
                In Quo → Settings → Webhooks, add this URL for calls, call summaries, transcripts, recordings and messages on this number. If your other Quo numbers already send here, there is nothing to change.
              </div>
              {saved && (
                <div className="flex items-center gap-2 mt-2 rounded px-2.5" style={{ height: 34, background: heard ? T.slab : T.hivizDim, fontSize: 12.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: heard ? T.green : T.hiviz }} className={heard ? "" : "animate-pulse"} />
                  {heard ? <>First event arrived {relTime(heard.at)} · <span style={{ fontFamily: "var(--sc-font-code)" }}>{heard.type}</span></> : "Waiting for the first event… call or text the number to test it."}
                </div>
              )}
            </>
          ) : (
            <div className="rounded" style={{ background: T.slab, padding: "8px 10px", fontSize: 12, color: T.ink2, lineHeight: 1.45 }}>
              {p.name}&apos;s intake isn&apos;t built yet, so there is no webhook to point it at. You can still save the number — its calls and texts won&apos;t reach the app until it is.
            </div>
          )}
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <div className="flex justify-end gap-2" style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 10 }}>
          <button onClick={close} className="rounded px-3" style={{ height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>{saved ? "Done" : "Cancel"}</button>
          {!saved && <button onClick={() => void submit()} disabled={busy || !phone.trim()} className="rounded px-3"
            style={{ height: 34, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer", opacity: busy || !phone.trim() ? 0.5 : 1 }}>{busy ? "Saving…" : "Save line"}</button>}
        </div>
      </div>
    </Sheet>
  );
}
