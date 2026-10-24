"use client";
/**
 * Appointments on a job or a person (migration 110; Coy, 2026-10-13: "a way for Dusty to keep track of my
 * schedule for each job and customer contact lead … add that to my calendar through Scopecrete and … send
 * confirmation text messages through Scopecrete via AI").
 *
 * Upcoming ones first: what, when (Central), where and whether they confirmed. Each one goes onto a calendar
 * one at a time — Google Calendar's own page, or an .ics file the phone's calendar opens — and Dusty drafts its
 * confirmation text, which goes through Quo on Coy's Send. "+ Schedule" adds one by hand; Dusty adds them from
 * the chat ("I have an appointment with … Thursday 12 to 1").
 */
import { useDismiss } from "@/lib/v34/use-dismiss";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { T, F, eyebrow, nums } from "@/lib/v34/tokens";
import { Emblem } from "@/components/site/marks";
import { askDusty } from "@/components/v34/budget-tabs";
import { OrgNameContext } from "@/components/v34/primitives";
import { useMe } from "@/lib/v34/me-ctx";
import { draftKey } from "@/lib/v34/send-proposal";
import {
  APPOINTMENTS_EVENT, APPOINTMENT_KINDS, KIND_LABEL, confirmText, googleCalendarUrl, spokenWhen, upcoming, utcToCentral, whenText,
  type AppointmentKind,
} from "@/lib/appointments";
import type { AppointmentRow } from "@/lib/appointments-server";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Not confirmed", color: T.hivizText },
  confirmed: { label: "✓ Confirmed", color: T.green },
  done: { label: "Done", color: T.ink3 },
  canceled: { label: "Canceled", color: T.red },
};

export function AppointmentsCard({ jobId, contactId, card, about, address }: {
  jobId?: string; contactId?: string; card: React.CSSProperties;
  /** What it's about, for a new one's title: the job's name or the person's. */
  about?: string | null;
  /** The job's (or person's) address, the default for a new one. */
  address?: string | null;
}) {
  const [list, setList] = useState<AppointmentRow[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const qs = jobId ? `job=${jobId}` : `contact=${contactId}`;
  const load = useCallback(() => call(`/api/appointments?${qs}`, "GET")
    .then((b) => { setSupported(b.supported !== false); setList(b.appointments ?? []); })
    .catch(() => setList([])), [qs]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = () => void load();
    window.addEventListener(APPOINTMENTS_EVENT, on);
    return () => window.removeEventListener(APPOINTMENTS_EVENT, on);
  }, [load]);

  if (!list) return null;
  const next = upcoming(list);
  const past = list.filter((a) => !next.includes(a)).reverse();
  const patch = (id: string, body: Record<string, unknown>) => {
    setErr(null);
    return call(`/api/appointments/${id}`, "PATCH", body).then(load).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  return (
    <section aria-label="Appointments" className="px-3 py-2.5" style={card}>
      <div className="flex items-center gap-2">
        <div style={{ ...eyebrow, flex: 1 }}>Appointments</div>
        {supported && !adding && (
          <button onClick={() => setAdding(true)} className="rounded px-2.5"
            style={{ height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.xs, fontWeight: 600, cursor: "pointer" }}>+ Schedule</button>
        )}
      </div>
      {!supported && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>Appointments switch on with migration 110.</div>}
      {supported && adding && (
        <AppointmentForm jobId={jobId} contactId={contactId} about={about ?? null} address={address ?? null}
          onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />
      )}
      {supported && !adding && !next.length && (
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>
          Nothing booked. + Schedule, or tell Dusty — &ldquo;site visit Thursday 12 to 1&rdquo;.
        </div>
      )}
      {next.map((a) => <Row key={a.id} a={a} patch={patch} />)}
      {past.length > 0 && (
        <button onClick={() => setShowPast((v) => !v)} style={{ border: "none", background: "none", color: T.chalk, fontSize: F.xs, padding: 0, marginTop: 8, cursor: "pointer" }}>
          {showPast ? "Hide" : "Show"} past and canceled ({past.length})
        </button>
      )}
      {showPast && past.map((a) => <Row key={a.id} a={a} patch={patch} past />)}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </section>
  );
}

function Row({ a, patch, past }: { a: AppointmentRow; patch: (id: string, b: Record<string, unknown>) => Promise<unknown>; past?: boolean }) {
  const [now] = useState(() => Date.now());
  const me = useMe().me;
  const org = useContext(OrgNameContext) ?? me?.org_name ?? null;
  const [moving, setMoving] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useDismiss(calOpen, () => setCalOpen(false));
  const st = STATUS[a.status] ?? STATUS.scheduled;
  const live = a.status === "scheduled" || a.status === "confirmed";
  const btn: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.xs, fontWeight: 600, cursor: "pointer" };
  const linkBtn: React.CSSProperties = { border: "none", background: "none", padding: 0, fontSize: F.xs, cursor: "pointer" };
  const who = a.contact_name ?? null;

  // Dusty drafts it as a text plan; Coy changes the words and taps Send (it goes through Quo).
  const askConfirm = () => askDusty(
    `Draft a short text to ${who ?? "them"} confirming the ${KIND_LABEL[a.kind].toLowerCase()} ${spokenWhen(a.starts_at, a.ends_at)}${a.address ? ` at ${a.address}` : ""}${a.job_title ? ` (${a.job_title})` : ""}, as a text step I can send. No prices.`);
  // Or the words straight into their thread's text box.
  const inThread = () => {
    if (!a.person_id) return;
    const words = confirmText(a, { name: who, from: me?.name ?? null, org });
    try { window.localStorage.setItem(draftKey(a.person_id), JSON.stringify({ channel: "text", text: words })); } catch { /* the thread opens empty */ }
    window.location.href = `/dashboard/messages/${a.person_id}`;
  };

  return (
    <div style={{ borderTop: `1px solid ${T.hairSoft}`, marginTop: 8, paddingTop: 8, opacity: past ? 0.75 : 1 }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...nums }}>{whenText(a.starts_at, a.ends_at)}</span>
        <span style={{ fontSize: F.xs, color: st.color, fontWeight: 600 }}>{st.label}</span>
        {a.source === "dusty" && <span style={{ fontSize: F.xs, color: T.ink3 }}>· from Dusty</span>}
      </div>
      <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 2 }}>
        {a.title}{who && !a.title.includes(who) ? <span style={{ color: T.ink3 }}> · with {who}</span> : null}
      </div>
      {a.address && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`} target="_blank" rel="noreferrer"
          style={{ fontSize: F.xs, color: T.chalk, display: "inline-block", marginTop: 2 }}>{a.address}</a>
      )}
      {a.note && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, whiteSpace: "pre-wrap" }}>{a.note}</div>}
      {a.status === "canceled" && a.canceled_reason && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>Why: {a.canceled_reason}</div>}

      {live && !moving && (
        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 6 }}>
          <div style={{ position: "relative" }} ref={calRef}>
            <button onClick={() => setCalOpen((v) => !v)} style={btn} aria-expanded={calOpen}>Add to calendar ▾</button>
            {calOpen && (
              <div className="flex flex-col" style={{ position: "absolute", top: 32, left: 0, zIndex: 20, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.12)", minWidth: 200 }}>
                <a href={googleCalendarUrl(a, typeof window !== "undefined" ? window.location.href : undefined)} target="_blank" rel="noreferrer" onClick={() => setCalOpen(false)}
                  style={{ padding: "9px 12px", fontSize: F.sm, color: T.ink, textDecoration: "none" }}>Google Calendar</a>
                <a href={`/api/appointments/${a.id}/ics`} onClick={() => setCalOpen(false)}
                  style={{ padding: "9px 12px", fontSize: F.sm, color: T.ink, textDecoration: "none", borderTop: `1px solid ${T.hairSoft}` }}>Phone or Outlook calendar (.ics)</a>
              </div>
            )}
          </div>
          {a.person_id && a.status === "scheduled" && (
            <button onClick={askConfirm} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6 }} title="Dusty drafts the text; you send it">
              <Emblem size={14} spin={false} /> Confirm by text
            </button>
          )}
          {a.status === "scheduled" && <button onClick={() => void patch(a.id, { status: "confirmed" })} style={btn}>They confirmed</button>}
          <span className="flex-1" />
          {a.person_id && <button onClick={inThread} style={{ ...linkBtn, color: T.chalk }}>Write it in their thread</button>}
          <button onClick={() => setMoving(true)} style={{ ...linkBtn, color: T.chalk }}>Change</button>
          {new Date(a.starts_at).getTime() < now && <button onClick={() => void patch(a.id, { status: "done" })} style={{ ...linkBtn, color: T.chalk }}>Done</button>}
          <button onClick={() => { const why = window.prompt("Cancel it — why? (optional)"); if (why !== null) void patch(a.id, { status: "canceled", canceled_reason: why }); }}
            style={{ ...linkBtn, color: T.red }}>Cancel</button>
        </div>
      )}
      {moving && <MoveForm a={a} onSave={(b) => patch(a.id, b).then(() => setMoving(false))} onCancel={() => setMoving(false)} />}
      {!live && past && a.status !== "done" && (
        <button onClick={() => void patch(a.id, { status: "scheduled" })} style={{ ...linkBtn, color: T.chalk, marginTop: 4 }}>Put it back on</button>
      )}
    </div>
  );
}

const input: React.CSSProperties = { height: 30, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 6px", background: T.card, color: T.ink, minWidth: 0 };
const plusHour = (t: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return "";
  const h = Math.min(23, Number(m[1]) + 1);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

function AppointmentForm({ jobId, contactId, about, address, onDone, onCancel }: {
  jobId?: string; contactId?: string; about: string | null; address: string | null; onDone: () => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<AppointmentKind>("site_visit");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [where, setWhere] = useState(address ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (!day || !start) { setErr("Pick the day and the time."); return; }
    setBusy(true); setErr(null);
    call("/api/appointments", "POST", { job_id: jobId, contact_id: contactId, kind, day, start, end: end || undefined, address: where || undefined, note: note || undefined })
      .then(onDone).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
      <div className="flex gap-2 flex-wrap items-end">
        <label style={{ fontSize: F.xs, color: T.ink2 }}><div>What</div>
          <select value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)} style={input}>
            {APPOINTMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: F.xs, color: T.ink2 }}><div>Day</div>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={input} aria-label="Day" />
        </label>
        <label style={{ fontSize: F.xs, color: T.ink2 }}><div>From</div>
          <input type="time" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end <= e.target.value) setEnd(plusHour(e.target.value)); }} style={input} aria-label="From" />
        </label>
        <label style={{ fontSize: F.xs, color: T.ink2 }}><div>To</div>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={input} aria-label="To" />
        </label>
      </div>
      <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Where" aria-label="Where" style={{ ...input, width: "100%" }} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (bring the measuring wheel …)" aria-label="Note" style={{ ...input, width: "100%" }} />
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={save} className="rounded px-3" style={{ height: 30, background: T.ink, color: T.card, border: "none", fontSize: F.xs, fontWeight: 600, cursor: "pointer" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} style={{ border: "none", background: "none", color: T.ink2, fontSize: F.xs, cursor: "pointer" }}>Cancel</button>
        <span className="flex-1" />
        {about && <span style={{ fontSize: F.xs, color: T.ink3 }}>{KIND_LABEL[kind]} — {about}</span>}
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}

function MoveForm({ a, onSave, onCancel }: { a: AppointmentRow; onSave: (b: Record<string, unknown>) => Promise<unknown>; onCancel: () => void }) {
  const s = utcToCentral(a.starts_at);
  const [day, setDay] = useState(s.day);
  const [start, setStart] = useState(s.time);
  const [end, setEnd] = useState(a.ends_at ? utcToCentral(a.ends_at).time : "");
  const [where, setWhere] = useState(a.address ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2" style={{ marginTop: 6 }}>
      <div className="flex gap-2 flex-wrap">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={input} aria-label="Day" />
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={input} aria-label="From" />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={input} aria-label="To" />
      </div>
      <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Where" aria-label="Where" style={{ ...input, width: "100%" }} />
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={() => { setBusy(true); const e0 = a.ends_at ? utcToCentral(a.ends_at).time : ""; const moved = day !== s.day || start !== s.time || end !== e0; void onSave({ ...(moved ? { day, start, end } : {}), address: where }).finally(() => setBusy(false)); }}
          className="rounded px-3" style={{ height: 30, background: T.ink, color: T.card, border: "none", fontSize: F.xs, fontWeight: 600, cursor: "pointer" }}>Save</button>
        <button onClick={onCancel} style={{ border: "none", background: "none", color: T.ink2, fontSize: F.xs, cursor: "pointer" }}>Cancel</button>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>A new time needs confirming again.</span>
      </div>
    </div>
  );
}
