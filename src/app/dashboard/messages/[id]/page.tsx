"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Phone, ArrowLeft, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Composer } from "@/components/v34/composer";
import { DA, MergeSheet, Timeline, formatPhone, type MergeInfo, type ThreadMessage } from "@/components/v34/conversation";
import { PersonView, SamePerson, type Person } from "@/components/v34/person-view";
import { NameEditor, FileAsSheet } from "@/components/v34/contact-edit";
import { useWide } from "@/lib/v34/use-wide";

/**
 * One person. A customer or a vendor gets their page (person-view.tsx) — Coy,
 * 2026-09-28: Threads is the intake, and opening someone leads to everything
 * about them. Anyone unsorted, personal or spam gets the plain conversation
 * below, as before.
 */

interface ContactJob { id: string; title: string | null; status: string | null; contact_id: string | null }

export default function ChatThreadPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params?.id as string;

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [nameSource, setNameSource] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [phones, setPhones] = useState<string[]>([]);
  const [merges, setMerges] = useState<MergeInfo[]>([]);
  const [jobs, setJobs] = useState<ContactJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Open, and optionally on a suggested match ("Also Amber").
  const [merging, setMerging] = useState<false | { preselect: string | null }>(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  // The contact rail stands beside the conversation only when there is room
  // for both — measured, since Dusty docked on the right takes 400px of it.
  const [measure, roomy] = useWide<HTMLDivElement>(920);
  // Their page, when they are a customer or a vendor (/api/people). A failure
  // here leaves the plain conversation, which still works.
  const [person, setPerson] = useState<Person | null>(null);
  useEffect(() => {
    if (!contactId) return;
    let off = false;
    fetch(`/api/people/${contactId}`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && b?.contact) setPerson(b as Person); }).catch(() => {});
    return () => { off = true; };
  }, [contactId, reload]);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    fetch(`/api/threads/${contactId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        // Merged into someone else: their thread is where this history lives.
        if (data.redirect_to) {
          router.replace(`/dashboard/messages/${data.redirect_to}`);
          return;
        }
        // The API returns newest first. A conversation reads top to bottom
        // with the composer under the latest message — v34 and the desktop
        // design both — so it is turned round here and scrolled to the end.
        setMessages(Array.isArray(data.messages) ? [...data.messages].reverse() : []);
        setPhone(data.counterparty_phone ?? null);
        setName(typeof data.name === "string" ? data.name : null);
        setNameConfirmed(data.name_confirmed === true);
        setNameSource(typeof data.name_source === "string" ? data.name_source : null);
        setAddress(typeof data.address === "string" ? data.address : null);
        setPhones(Array.isArray(data.phones) ? data.phones : []);
        setMerges(Array.isArray(data.merges) ? data.merges : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contactId, reload, router]);

  // Scope on file: this contact's jobs. /api/jobs is the org's list; `jobs` is
  // small (0 rows today), so filtering here beats a second route.
  useEffect(() => {
    if (!contactId) return;
    let off = false;
    fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (off) return;
        const all = Array.isArray(b?.jobs) ? (b.jobs as ContactJob[]) : null;
        setJobs(all ? all.filter((j) => j.contact_id === contactId) : null);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [contactId, reload]);

  useEffect(() => {
    if (!loading && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [loading, messages.length]);

  async function undo(mergeId: string) {
    setUndoing(mergeId);
    try {
      const r = await fetch(`/api/contacts/merge/${mergeId}/undo`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoing(null);
    }
  }

  async function newScope() {
    setStarting(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  // A confirmed name when there is one; the number otherwise. Never a guess —
  // an unconfirmed proposal lives in the thread list's review, not here.
  const headerTitle = name ?? formatPhone(phone);
  const otherNumbers = phones.filter((p) => p !== phone);
  const texts = messages.filter((m) => m.channel !== "call").length;
  const calls = messages.length - texts;
  const firstHeard = messages.find((m) => m.occurred_at)?.occurred_at ?? null;
  const openJob = jobs && jobs.length > 0 ? jobs[0] : null;

  const pill: React.CSSProperties = {
    height: 26, border: `1px solid ${DA.border}`, background: DA.surface, color: DA.textSecondary,
    fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer",
    alignItems: "center", textDecoration: "none",
  };

  if (person && !loading && !error && (person.contact.bucket === "customer" || person.contact.bucket === "vendor")) {
    return (
      <div className="sc-pinned overflow-y-auto flex flex-col" style={{ background: T.slab }}>
        {merges.map((m) => (
          <div key={m.id} className="px-4 py-1.5 flex items-center gap-2 text-[11px]"
            style={{ background: DA.elevated, borderBottom: `1px solid ${DA.border}`, color: DA.textSecondary }}>
            <span className="flex-1 min-w-0 truncate">{m.phone ? formatPhone(m.phone) : "Another number"} was merged into this person</span>
            <button onClick={() => void undo(m.id)} disabled={undoing === m.id}
              style={{ color: DA.accent, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>
              {undoing === m.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        ))}
        <PersonView person={person} messages={messages}
          onReload={() => setReload((n) => n + 1)} onMerge={(id) => setMerging({ preselect: id ?? null })} />
        {merging && (
          <MergeSheet contactId={contactId} keepLabel={headerTitle} keepCount={messages.length}
            preselectId={merging ? merging.preselect : null}
            onClose={() => setMerging(false)}
            onMerged={() => { setMerging(false); setLoading(true); setReload((n) => n + 1); }} />
        )}
      </div>
    );
  }

  return (
    <div ref={measure} className="flex sc-pinned">
      {/* ================= the conversation ================= */}
      {/* Pinned between the header and the footer (.sc-pinned): only the
          messages scroll, so this name bar never slides under the header. */}
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: DA.bg }}>
        {/* Three rows (Coy, 2026-09-28: "the name needs to fit"): who, then the
            facts at full width so nothing cuts them off, then the actions. */}
        <div className="px-3 pt-2 pb-2 flex-shrink-0" style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}>
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="lg:hidden shrink-0"
              style={{ background: "none", border: "none", cursor: "pointer", color: DA.textMuted, padding: 0 }}
              aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              {loading ? (
                <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, color: DA.textPrimary }}>{headerTitle}</div>
              ) : (
                <NameEditor contactId={contactId} name={name} fallback={formatPhone(phone)}
                  onSaved={(v) => { setName(v); setNameConfirmed(true); setNameSource("human"); }}
                  style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, lineHeight: 1.1, color: DA.textPrimary }} />
              )}
            </div>
            {person && (
              <span className="shrink-0 rounded px-1.5" style={{ ...eyebrow, fontSize: F.micro, lineHeight: "18px",
                border: `1px ${person.contact.bucket ? "solid" : "dashed"} ${DA.border}`, color: DA.textSecondary }}>
                {person.contact.bucket ?? "Unsorted"}
              </span>
            )}
          </div>
          <div style={{ fontSize: F.xs, color: DA.textMuted, lineHeight: 1.35, marginTop: 1, ...nums }}>
            {loading ? "Loading…" : [
              name && phone ? formatPhone(phone) : null,
              otherNumbers.length ? `also ${otherNumbers.map(formatPhone).join(", ")}` : null,
              firstHeard ? `first heard ${new Date(firstHeard).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
              `${texts} text${texts === 1 ? "" : "s"} · ${calls} call${calls === 1 ? "" : "s"}`,
            ].filter(Boolean).join(" · ")}
          </div>
          {!loading && !error && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {phone && (
                <a href={`tel:${phone}`} className="rounded px-2 inline-flex gap-1" style={pill}>
                  <Phone size={12} weight="fill" color={DA.textPrimary} /> Call
                </a>
              )}
              <button onClick={() => setFiling(true)} className="rounded px-2 inline-flex" style={pill}>
                {person?.contact.bucket ? "Change bucket" : "File as…"}
              </button>
              <button onClick={() => setMerging({ preselect: null })} className="rounded px-2 inline-flex" style={pill}>
                Same as…
              </button>
              {openJob ? (
                <Link href={`/dashboard/scope/${openJob.id}`} className="rounded px-2 inline-flex"
                  style={{ ...pill, background: DA.accent, color: "#fff", border: "none" }}>Open scope</Link>
              ) : (
                <button onClick={() => void newScope()} disabled={starting || jobs === null} className="rounded px-2 inline-flex"
                  style={{ ...pill, background: DA.accent, color: "#fff", border: "none", opacity: jobs === null ? 0.5 : 1 }}>
                  {starting ? "Starting…" : "New scope"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Every merge still in force, with its way back. */}
        {!loading && merges.map((m) => (
          <div key={m.id} className="px-4 py-1.5 flex items-center gap-2 text-[11px] flex-shrink-0"
            style={{ background: DA.elevated, borderBottom: `1px solid ${DA.border}`, color: DA.textSecondary }}>
            <span className="flex-1 min-w-0 truncate">
              {m.phone ? formatPhone(m.phone) : "Another number"} was merged into this thread
            </span>
            <button onClick={() => void undo(m.id)} disabled={undoing === m.id}
              style={{ color: DA.accent, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>
              {undoing === m.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        ))}

        {person && <SamePerson person={person} onMerge={(id) => setMerging({ preselect: id ?? null })} />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: DA.surface }} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <WarningCircle size={32} color={DA.error} />
              <p className="text-sm mt-2 font-semibold" style={{ color: DA.textPrimary }}>
                Couldn&apos;t load this thread
              </p>
              <p className="text-xs mt-1 break-words" style={{ color: DA.textMuted }}>{error}</p>
            </div>
          ) : (
            <Timeline messages={messages} notes={person?.notes ?? []} phone={phone} />
          )}
        </div>

        {/* Rendered only once the thread has loaded — the composer reads a saved
            draft from this device, which the server cannot see, so rendering it
            during the server pass would mismatch on hydration. */}
        {!loading && !error && (
          <Composer contactId={contactId} phone={phone} name={name} onNoteSaved={() => setReload((n) => n + 1)} />
        )}
      </div>

      {/* ================= the contact rail (desktop, 1d) ================= */}
      {!loading && !error && (
        <aside className={`${roomy ? "hidden lg:block" : "hidden"} shrink-0 overflow-y-auto h-full`}
          style={{ width: 300, background: DA.surface, borderLeft: `1px solid ${DA.border}` }}>
          <RailSection title="Contact">
            <RailRow k="Name" v={name ?? null} missing="Not recorded"
              note={name ? (nameConfirmed ? "confirmed by you" : nameSource === "machine" ? "they introduced themselves — keep or undo it in Threads" : "not confirmed") : undefined} />
            <RailRow k={phones.length > 1 ? "Numbers" : "Number"}
              v={(phones.length ? phones : phone ? [phone] : []).map(formatPhone).join(", ") || null} missing="Unknown" />
            <RailRow k="Address" v={address} missing="Not recorded" />
            <RailRow k="First heard" v={firstHeard ? new Date(firstHeard).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} missing="—" />
            <RailRow k="Messages" v={`${texts} texts · ${calls} calls`} missing="" />
          </RailSection>

          <RailSection title="Scope on file">
            {jobs === null ? (
              <div style={{ fontSize: F.xs, color: DA.textMuted }}>Couldn&apos;t read jobs.</div>
            ) : jobs.length === 0 ? (
              <div className="rounded px-2.5 py-2" style={{ border: `1px solid ${DA.border}` }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>None</div>
                <div style={{ fontSize: F.xs, color: DA.textMuted, lineHeight: 1.4 }}>
                  No scope has been started for this contact.
                </div>
              </div>
            ) : jobs.map((j) => (
              <Link key={j.id} href={`/dashboard/scope/${j.id}`} className="block rounded px-2.5 py-2 mb-1.5 no-underline"
                style={{ border: `1px solid ${DA.border}`, color: DA.textPrimary }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{j.title || "Untitled scope"} ›</div>
                <div style={{ ...eyebrow }}>{j.status ?? ""}</div>
              </Link>
            ))}
          </RailSection>

          <RailSection title="Money">
            <div style={{ fontSize: F.xs, color: DA.textMuted, lineHeight: 1.45 }}>
              Nothing recorded. Invoices and payments hang off a job, and none exist yet.
            </div>
          </RailSection>

          <RailSection title="Dusty">
            <div style={{ fontSize: F.xs, color: person?.contact.status_summary ? DA.textPrimary : DA.textMuted, lineHeight: 1.45 }}>
              {person?.contact.status_summary ?? "Not read yet — Dusty reads a contact a few minutes after they say something."}
            </div>
            <button onClick={() => window.dispatchEvent(new Event("sc:dusty-open"))} className="mt-2 rounded px-2.5"
              style={{ height: 28, border: `1px solid ${T.hiviz}`, color: T.hiviz, background: "transparent", cursor: "pointer",
                       fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase" }}>Ask Dusty</button>
          </RailSection>
        </aside>
      )}

      {merging && (
        <MergeSheet contactId={contactId} keepLabel={headerTitle} keepCount={messages.length}
          preselectId={merging ? merging.preselect : null}
          onClose={() => setMerging(false)}
          onMerged={() => { setMerging(false); setLoading(true); setReload((n) => n + 1); }} />
      )}

      {/* Filed customer or vendor → their page takes over on the reload. */}
      <FileAsSheet open={filing} onClose={() => setFiling(false)} contactId={contactId}
        target={{ bucket: person?.contact.bucket ?? null, subtype: person?.contact.subtype ?? null,
                  bucket_auto: person?.contact.bucket_state === "auto" ? { reason: null } : null,
                  proposal: person?.contact.guess ? { classification: person.contact.guess } : null }}
        subtypes={person?.subtypes}
        onFiled={() => { setFiling(false); setReload((n) => n + 1); }} />
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${DA.border}` }}>
      <div style={{ ...eyebrow, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function RailRow({ k, v, missing, note }: { k: string; v: string | null; missing: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5" style={{ borderTop: `1px solid ${DA.elevated}` }}>
      <span style={{ fontSize: F.xs, color: DA.textSecondary }}>{k}</span>
      <span className="flex-1" />
      <span className="text-right" style={{ fontSize: F.xs, fontWeight: 600, color: v ? DA.textPrimary : DA.accent,
        textTransform: v ? "none" : "uppercase", letterSpacing: v ? 0 : ".06em", minWidth: 0 }}>
        {v ?? missing}
        {note && <span style={{ display: "block", fontWeight: 400, color: DA.textMuted }}>{note}</span>}
      </span>
    </div>
  );
}
