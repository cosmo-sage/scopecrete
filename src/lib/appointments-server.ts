import type { ApiSession } from "@/lib/api-auth";
import { KIND_LABEL, whenText, type Appointment } from "@/lib/appointments";

type Db = ApiSession["supabase"];

/** True when migration 110 isn't applied yet (the table is missing). */
export const appointmentsMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || (/appointments/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? "")));

export const APPT_COLS = "id, job_id, contact_id, customer_id, kind, title, starts_at, ends_at, address, note, status, confirmed_at, canceled_reason, source, created_at";

export interface AppointmentRow extends Appointment {
  job_title: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  /** The person it is with: its own, else its job's. */
  person_id: string | null;
}

/**
 * Appointments of an org under RLS, with their job's title and their person's name and phone — by job, by
 * person (a person's own, and those on jobs of theirs), by customer, or every one from `since`.
 * { supported: false } until 110 is applied.
 */
export async function listAppointments(supabase: Db, orgId: string, f: { job?: string | null; contact?: string | null; customer?: string | null; since?: string | null; limit?: number }):
  Promise<{ supported: boolean; appointments: AppointmentRow[] }> {
  let q = supabase.from("appointments").select(APPT_COLS).eq("org_id", orgId);
  if (f.job) q = q.eq("job_id", f.job);
  if (f.contact) {
    const { data: jobs } = await supabase.from("jobs").select("id").eq("org_id", orgId).eq("contact_id", f.contact).is("archived_at", null).limit(50);
    const ids = ((jobs ?? []) as Array<{ id: string }>).map((j) => j.id);
    q = ids.length ? q.or(`contact_id.eq.${f.contact},job_id.in.(${ids.join(",")})`) : q.eq("contact_id", f.contact);
  }
  if (f.customer) q = q.eq("customer_id", f.customer);
  if (f.since) q = q.gte("starts_at", f.since);
  const { data, error } = await q.order("starts_at", { ascending: true }).limit(f.limit ?? 100);
  if (error) {
    if (appointmentsMissing(error)) return { supported: false, appointments: [] };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as Appointment[];
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];
  type J = { id: string; title: string | null; contact_id: string | null };
  const { data: jobs } = jobIds.length ? await supabase.from("jobs").select("id, title, contact_id").in("id", jobIds) : { data: [] };
  const jobBy = new Map(((jobs ?? []) as J[]).map((j) => [j.id, j]));
  const personOf = (r: Appointment) => r.contact_id ?? (r.job_id ? jobBy.get(r.job_id)?.contact_id ?? null : null);
  const contactIds = [...new Set(rows.map(personOf).filter(Boolean))] as string[];
  const { data: people } = contactIds.length ? await supabase.from("contacts").select("id, name, phone").in("id", contactIds) : { data: [] };
  type P = { id: string; name: string | null; phone: string | null };
  const personBy = new Map(((people ?? []) as P[]).map((p) => [p.id, p]));
  return {
    supported: true,
    appointments: rows.map((r) => {
      const pid = personOf(r);
      const p = pid ? personBy.get(pid) : undefined;
      return { ...r, person_id: pid, job_title: r.job_id ? jobBy.get(r.job_id)?.title ?? null : null,
        contact_name: p?.name ?? null, contact_phone: p?.phone ?? null };
    }),
  };
}

/**
 * Dusty's view of the schedule, in every chat: today in Central time (so "this Thursday" is a date he can work
 * out), and every appointment from a week back to 60 days ahead with its full id, job and person — so he can
 * book one without doubling it, move, confirm or cancel one, and answer "what do I have this week?".
 */
export async function appointmentsForDusty(supabase: Db, orgId: string, now: Date = new Date()): Promise<string> {
  const today = now.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const head = `## Appointments (Central time)\nToday is ${today}.`;
  let out: { supported: boolean; appointments: AppointmentRow[] };
  try {
    out = await listAppointments(supabase, orgId, { since: new Date(now.getTime() - 7 * 86400_000).toISOString(), limit: 60 });
  } catch { return head; }
  if (!out.supported) return `${head}\nThe schedule isn't switched on yet (migration 110) — say so if Coy asks to book one; a booking step will fail until then.`;
  const ahead = out.appointments.filter((a) => Date.parse(a.starts_at) <= now.getTime() + 60 * 86400_000);
  if (!ahead.length) return `${head}\nNothing booked from a week ago to 60 days out.`;
  return [head, ...ahead.map((a) => `- appointment ${a.id} · ${whenText(a.starts_at, a.ends_at)} · ${KIND_LABEL[a.kind]}: ${a.title} · ${a.status}${a.status === "confirmed" ? "" : a.status === "scheduled" ? " (not confirmed by them yet)" : ""}`
    + `${a.address ? ` · at ${a.address}` : ""}${a.job_id ? ` · job ${a.job_id}${a.job_title ? ` (${a.job_title})` : ""}` : ""}${a.person_id ? ` · with ${a.contact_name ?? "contact"} (contact ${a.person_id})` : ""}${a.note ? ` · note: ${a.note.slice(0, 160)}` : ""}`)].join("\n");
}
