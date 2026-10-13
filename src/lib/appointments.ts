/**
 * Appointments on a job and a person (migration 110; Coy, 2026-10-13: "a way
 * for Dusty to keep track of my schedule for each job and customer contact
 * lead … add that to my calendar through Scopecrete and … send confirmation
 * text messages through Scopecrete via AI").
 *
 * Times are entered and shown in Central time and stored in UTC. A calendar
 * gets an appointment one at a time: a Google Calendar link, or an .ics file a
 * phone's calendar opens. Nothing is synced back. Pure — tests/appointments.test.mjs.
 */

export const TZ = "America/Chicago";

/** Tells any appointments card on the page to read again (Dusty's plan booked or changed one). */
export const APPOINTMENTS_EVENT = "sc:appointments";

export const APPOINTMENT_KINDS = ["site_visit", "consultation", "pour", "meeting", "other"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const KIND_LABEL: Record<AppointmentKind, string> = {
  site_visit: "Site visit",
  consultation: "Consultation",
  pour: "Pour",
  meeting: "Meeting",
  other: "Appointment",
};
export const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "done", "canceled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: string;
  job_id: string | null;
  contact_id: string | null;
  customer_id: string | null;
  kind: AppointmentKind;
  title: string;
  starts_at: string;
  ends_at: string | null;
  address: string | null;
  note: string | null;
  status: AppointmentStatus;
  confirmed_at: string | null;
  canceled_reason?: string | null;
  source?: "coy" | "dusty";
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** Minutes Central time is off UTC at that instant (−300 in summer, −360 in winter). */
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A Central date ("2026-10-15") and clock time ("12:30") → the UTC ISO instant, or null when either isn't one. */
export function centralToUtc(day: string, time: string): string | null {
  const d = DAY.exec(day.trim()), t = TIME.exec(time.trim());
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(guess).getUTCDate() !== da) return null; // Feb 30
  // The offset at the guess, then again at the corrected time (DST edges).
  let at = guess - offsetMinutes(new Date(guess)) * 60000;
  at = guess - offsetMinutes(new Date(at)) * 60000;
  return new Date(at).toISOString();
}

/** An instant → its Central date and clock time, for a form's boxes. */
export function utcToCentral(iso: string): { day: string; time: string } {
  const at = new Date(iso);
  const day = at.toLocaleDateString("en-CA", { timeZone: TZ });
  const time = at.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return { day, time };
}

/** "12 PM" · "12:30 PM" */
function clock(at: Date, withMeridiem = true): string {
  const s = at.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return withMeridiem ? s : s.replace(/\s?[AP]M$/, "");
}

/** "Thu, Oct 15 · 12–1 PM" (Central). The day is left out of the end when it is the same day. */
export function whenText(startsAt: string, endsAt: string | null): string {
  const s = new Date(startsAt);
  const day = s.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  if (!endsAt) return `${day} · ${clock(s)}`;
  const e = new Date(endsAt);
  const sameDay = s.toLocaleDateString("en-CA", { timeZone: TZ }) === e.toLocaleDateString("en-CA", { timeZone: TZ });
  if (!sameDay) {
    const eDay = e.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
    return `${day} · ${clock(s)} – ${eDay} · ${clock(e)}`;
  }
  const sameHalf = clock(s).slice(-2) === clock(e).slice(-2);
  return `${day} · ${sameHalf ? clock(s, false) : clock(s)}–${clock(e)}`;
}

/** The words a confirmation text uses for the time: "Thursday, Oct 15 between 12 and 1 PM". */
export function spokenWhen(startsAt: string, endsAt: string | null): string {
  const s = new Date(startsAt);
  const day = s.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
  if (!endsAt) return `${day} at ${clock(s)}`;
  const e = new Date(endsAt);
  const sameHalf = clock(s).slice(-2) === clock(e).slice(-2);
  return `${day} between ${sameHalf ? clock(s, false) : clock(s)} and ${clock(e)}`;
}

/** Upcoming (not over, not canceled or done), soonest first. */
export function upcoming<T extends Pick<Appointment, "starts_at" | "ends_at" | "status">>(list: T[], now: Date = new Date()): T[] {
  return list
    .filter((a) => a.status !== "canceled" && a.status !== "done" && new Date(a.ends_at ?? a.starts_at).getTime() >= now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

const first = (name: string | null | undefined) => {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[A-Za-z][A-Za-z'.-]*$/.test(w) ? w : "";
};

/**
 * A confirmation text Coy can change before he taps Send: the person's first
 * name, who it's from, what, when, where. Never a price.
 */
export function confirmText(a: { kind: AppointmentKind; starts_at: string; ends_at: string | null; address: string | null },
  who: { name: string | null; from: string | null; org: string | null }): string {
  const hi = first(who.name) ? `Hi ${first(who.name)}, ` : "Hi, ";
  const me = who.from ? `this is ${first(who.from) || who.from}${who.org ? ` with ${who.org}` : ""}. ` : who.org ? `this is ${who.org}. ` : "";
  const what = a.kind === "other" ? "our appointment" : `our ${KIND_LABEL[a.kind].toLowerCase()}`;
  const where = a.address ? ` at ${a.address.split(",")[0]}` : "";
  return `${hi}${me}${me ? "Just" : "just"} confirming ${what} ${spokenWhen(a.starts_at, a.ends_at)}${where}. Does that still work for you?`;
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}
const endOf = (a: Pick<Appointment, "starts_at" | "ends_at">) => a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 3600_000).toISOString();

/** One appointment as an .ics file a phone's or a computer's calendar opens. No end → an hour. */
export function icsFor(a: Pick<Appointment, "id" | "title" | "starts_at" | "ends_at" | "address" | "note" | "status">, opts: { link?: string; now?: Date } = {}): string {
  const desc = [a.note, opts.link].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScopeCrete//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${a.id}@scopecrete.ai`,
    `DTSTAMP:${icsStamp((opts.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsStamp(a.starts_at)}`,
    `DTEND:${icsStamp(endOf(a))}`,
    `SUMMARY:${icsText(a.title)}`,
    ...(a.address ? [`LOCATION:${icsText(a.address)}`] : []),
    ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
    ...(opts.link ? [`URL:${opts.link}`] : []),
    `STATUS:${a.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(a.title)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Google Calendar's "add an event" page, filled in. */
export function googleCalendarUrl(a: Pick<Appointment, "title" | "starts_at" | "ends_at" | "address" | "note">, link?: string): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: a.title,
    dates: `${icsStamp(a.starts_at)}/${icsStamp(endOf(a))}`,
    ctz: TZ,
  });
  const details = [a.note, link].filter(Boolean).join("\n\n");
  if (details) p.set("details", details);
  if (a.address) p.set("location", a.address);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** A title when none is given: "Site visit — Wilson Driveway Repair". */
export function defaultTitle(kind: AppointmentKind, about: string | null): string {
  return about ? `${KIND_LABEL[kind]} — ${about}`.slice(0, 120) : KIND_LABEL[kind];
}

export interface AppointmentInput {
  job_id?: unknown; contact_id?: unknown; customer_id?: unknown; kind?: unknown; title?: unknown;
  day?: unknown; start?: unknown; end?: unknown; starts_at?: unknown; ends_at?: unknown; address?: unknown; note?: unknown;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

/**
 * A new appointment from a form or Dusty's plan, checked: the time as a Central day and start (and end), or
 * as ISO instants; at least a job or a person. { error } names what is wrong.
 */
export function cleanAppointment(b: AppointmentInput): { ok: true; row: Omit<Appointment, "id" | "status" | "confirmed_at" | "title"> & { title: string | null } } | { ok: false; error: string } {
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
  const job_id = id(b.job_id), contact_id = id(b.contact_id), customer_id = id(b.customer_id);
  if (!job_id && !contact_id && !customer_id) return { ok: false, error: "Put it on a job or a person." };
  const kind = (APPOINTMENT_KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as AppointmentKind) : "site_visit";
  let starts: string | null = null, ends: string | null = null;
  if (typeof b.day === "string" && typeof b.start === "string") {
    starts = centralToUtc(b.day, b.start);
    if (!starts) return { ok: false, error: "That day or time isn't one." };
    if (typeof b.end === "string" && b.end.trim()) {
      ends = centralToUtc(b.day, b.end);
      if (!ends) return { ok: false, error: "That end time isn't one." };
    }
  } else if (typeof b.starts_at === "string" && !Number.isNaN(Date.parse(b.starts_at))) {
    starts = new Date(b.starts_at).toISOString();
    if (typeof b.ends_at === "string" && b.ends_at && !Number.isNaN(Date.parse(b.ends_at))) ends = new Date(b.ends_at).toISOString();
  } else {
    return { ok: false, error: "When is it?" };
  }
  if (ends && ends <= starts) return { ok: false, error: "It has to end after it starts." };
  if (ends && Date.parse(ends) - Date.parse(starts) > 7 * 86400_000) return { ok: false, error: "That's longer than a week." };
  return { ok: true, row: { job_id, contact_id, customer_id, kind, title: s(b.title, 120), starts_at: starts, ends_at: ends,
    address: s(b.address, 200), note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 1000) : null } };
}
