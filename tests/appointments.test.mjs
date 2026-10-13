import { test } from "node:test";
import assert from "node:assert/strict";
import { centralToUtc, utcToCentral, whenText, spokenWhen, confirmText, icsFor, googleCalendarUrl, cleanAppointment, upcoming, defaultTitle } from "../src/lib/appointments.ts";

test("Central time to UTC, summer and winter, and back", () => {
  assert.equal(centralToUtc("2026-10-15", "12:00"), "2026-10-15T17:00:00.000Z"); // CDT
  assert.equal(centralToUtc("2026-12-15", "12:00"), "2026-12-15T18:00:00.000Z"); // CST
  assert.equal(centralToUtc("2026-02-30", "12:00"), null);
  assert.equal(centralToUtc("2026-10-15", "25:00"), null);
  assert.equal(centralToUtc("Thursday", "12:00"), null);
  assert.deepEqual(utcToCentral("2026-10-15T17:30:00.000Z"), { day: "2026-10-15", time: "12:30" });
});

test("when it is, in words", () => {
  const s = "2026-10-15T17:00:00.000Z", e = "2026-10-15T18:00:00.000Z";
  assert.equal(whenText(s, e), "Thu, Oct 15 · 12–1 PM");
  assert.equal(whenText("2026-10-15T14:00:00.000Z", e), "Thu, Oct 15 · 9 AM–1 PM");
  assert.equal(whenText(s, null), "Thu, Oct 15 · 12 PM");
  assert.equal(spokenWhen(s, e), "Thursday, Oct 15 between 12 and 1 PM");
});

test("a confirmation text: first names, no price, the street only", () => {
  const t = confirmText({ kind: "site_visit", starts_at: "2026-10-15T17:00:00.000Z", ends_at: "2026-10-15T18:00:00.000Z", address: "14835 General Prentiss Ave, Baton Rouge, LA 70817" },
    { name: "Johnette Wilson", from: "Coy Sacco", org: "Sacco Enterprises" });
  assert.equal(t, "Hi Johnette, this is Coy with Sacco Enterprises. Just confirming our site visit Thursday, Oct 15 between 12 and 1 PM at 14835 General Prentiss Ave. Does that still work for you?");
  assert.match(confirmText({ kind: "other", starts_at: "2026-10-15T17:00:00.000Z", ends_at: null, address: null }, { name: "(225) 555-0100", from: null, org: null }), /^Hi, just confirming our appointment Thursday, Oct 15 at 12 PM\./);
});

test("an .ics file and a Google Calendar link", () => {
  const a = { id: "a1", title: "Site visit — Wilson, Driveway", starts_at: "2026-10-15T17:00:00.000Z", ends_at: null, address: "1 Main St, Baton Rouge", note: "Bring the wheel", status: "scheduled" };
  const ics = icsFor(a, { now: new Date("2026-10-13T00:00:00Z"), link: "https://sbuild.app.scopecrete.ai/dashboard/scope/j/summary" });
  assert.match(ics, /DTSTART:20261015T170000Z\r\nDTEND:20261015T180000Z/);
  assert.match(ics, /SUMMARY:Site visit — Wilson\\, Driveway/);
  assert.match(ics, /LOCATION:1 Main St\\, Baton Rouge/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
  const g = new URL(googleCalendarUrl(a));
  assert.equal(g.searchParams.get("dates"), "20261015T170000Z/20261015T180000Z");
  assert.equal(g.searchParams.get("location"), "1 Main St, Baton Rouge");
});

test("a new appointment is checked", () => {
  const job = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(cleanAppointment({ day: "2026-10-15", start: "12:00" }), { ok: false, error: "Put it on a job or a person." });
  const r = cleanAppointment({ job_id: job, kind: "site_visit", day: "2026-10-15", start: "12:00", end: "13:00", address: " 1 Main St " });
  assert.ok(r.ok);
  assert.equal(r.row.starts_at, "2026-10-15T17:00:00.000Z");
  assert.equal(r.row.ends_at, "2026-10-15T18:00:00.000Z");
  assert.equal(r.row.address, "1 Main St");
  assert.equal(cleanAppointment({ job_id: job, day: "2026-10-15", start: "13:00", end: "12:00" }).ok, false);
  assert.equal(cleanAppointment({ job_id: job, kind: "bogus", day: "2026-10-15", start: "13:00" }).row.kind, "site_visit");
  assert.equal(defaultTitle("site_visit", "Wilson Driveway"), "Site visit — Wilson Driveway");
});

test("upcoming leaves out what's over, done or canceled", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  const list = [
    { id: "b", starts_at: "2026-10-16T17:00:00Z", ends_at: null, status: "scheduled" },
    { id: "a", starts_at: "2026-10-15T17:00:00Z", ends_at: null, status: "confirmed" },
    { id: "c", starts_at: "2026-10-10T17:00:00Z", ends_at: null, status: "scheduled" },
    { id: "d", starts_at: "2026-10-17T17:00:00Z", ends_at: null, status: "canceled" },
  ];
  assert.deepEqual(upcoming(list, now).map((x) => x.id), ["a", "b"]);
});

import { cleanAction, describe as describeStep, RECORD_STEPS } from "../src/lib/dusty/plan.ts";

test("Dusty's appointment step: a real day and time, a job or a person", () => {
  const job = "22222222-2222-2222-2222-222222222222", person = "33333333-3333-3333-3333-333333333333";
  const a = cleanAction({ do: "appointment", job, contact: person, kind: "site_visit", day: "2026-10-15", start: "12:00", end: "13:00", address: "14835 General Prentiss Ave" });
  assert.equal(a.do, "appointment");
  assert.ok(RECORD_STEPS.has("appointment"));
  assert.equal(describeStep(a, { item: () => null, area: () => "" }), "Put a site visit on the schedule: Thu, Oct 15 · 12–1 PM at 14835 General Prentiss Ave");
  assert.equal(cleanAction({ do: "appointment", day: "2026-10-15", start: "12:00" }), null);
  assert.equal(cleanAction({ do: "appointment", job, day: "Thursday", start: "12:00" }), null);
  assert.equal(cleanAction({ do: "appointment", job, day: "2026-10-15", start: "13:00", end: "12:00" }), null);
  assert.equal(cleanAction({ do: "appointment", job: "job1", day: "2026-10-15", start: "09:30" }).job, "job1");
  const u = cleanAction({ do: "update_appointment", id: job, status: "canceled", reason: "rain" });
  assert.equal(describeStep(u, { item: () => null, area: () => "" }), "Appointment: cancel it — rain");
  assert.equal(cleanAction({ do: "update_appointment", id: job }), null);
});
