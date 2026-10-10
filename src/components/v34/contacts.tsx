"use client";

/**
 * Contacts — the book (Coy, 2026-10-05: "a Rolodex or contacts book of some
 * kind for pure contact info that can be pulled into any thread and any
 * channel and any vendor contact and any customer contact" — "Call it
 * contacts"). Everyone, in every bucket, with every number and email. The
 * book is the `contacts` table itself (src/lib/contacts-book.ts), so a person
 * added here is the same person Threads, Quo and email filing see.
 *
 * ContactsPage   the page: search, role chips with counts, A–Z / Recent, + Contact.
 * NewContactForm someone who hasn't called yet — name, company, numbers, emails,
 *                address, and (optionally) what they are.
 * ContactPicker  the one "pick a contact" search, used wherever a person is
 *                chosen; "+ New contact" at its foot.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IdentificationCard } from "@phosphor-icons/react";
import type { CardRead } from "@/lib/business-card";
import { T, F, BUCKET, disp, eyebrow, clip, nums, relTime } from "@/lib/v34/tokens";
import { PageHeader, SearchBubble, SearchToggle, Sheet } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import { Emblem } from "@/components/site/marks";
import { initials, ROLE_LABEL, type ContactRole } from "@/lib/v34/threads";
import { BOOK_ROLES, formatNumber, matchesBook, sortBook, type BookEntry, type BookSort } from "@/lib/contacts-book";

const ROLE_COLOR: Record<ContactRole, string> = {
  customer: BUCKET.customer, contact: BUCKET.customer, vendor: BUCKET.vendor, sub: BUCKET.vendor,
  personal: BUCKET.personal, spam: BUCKET.spam, unsorted: BUCKET.unsorted, other: T.ink2,
};

export function BookTag({ role }: { role: ContactRole }) {
  const c = ROLE_COLOR[role];
  return (
    <span className="shrink-0" style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: "15px",
      padding: "0 4px", border: `1px solid ${c}`, color: c, whiteSpace: "nowrap", borderRadius: 2 }}>{ROLE_LABEL[role]}</span>
  );
}

const Initials = ({ name, size = 30 }: { name: string | null; size?: number }) => (
  <span className="shrink-0 flex items-center justify-center" aria-hidden="true"
    style={{ width: size, height: size, borderRadius: 3, background: T.slab, color: T.ink3, border: `1px ${name ? "solid" : "dashed"} ${T.hairStrong}`,
      fontFamily: "var(--sc-font-strong)", fontWeight: 600, fontSize: 12 }}>{name ? initials(name) : "#"}</span>
);

export const bookName = (e: Pick<BookEntry, "name" | "company" | "phones" | "emails">) =>
  e.name || e.company || (e.phones[0] ? formatNumber(e.phones[0].number) : e.emails[0]?.address ?? "No name");

/** Their page: a vendor's is the vendor page; everyone else's is their contact page. */
export const bookHref = (e: Pick<BookEntry, "id" | "role">) =>
  e.role === "vendor" || e.role === "sub" ? `/dashboard/vendors/${e.id}` : `/dashboard/messages/${e.id}?person=1`;

async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b?.error || `HTTP ${r.status}`), { status: r.status, body: b });
  return b;
}

const btn = (primary: boolean): React.CSSProperties => ({ height: 36, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
  letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });
const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };

const FILTERS: Array<{ k: "all" | ContactRole; label: string }> = [
  { k: "all", label: "All" }, ...BOOK_ROLES.map((r) => ({ k: r, label: r === "contact" ? "Cust. contacts" : r === "sub" ? "Subs" : `${ROLE_LABEL[r]}${r === "personal" || r === "unsorted" ? "" : "s"}` })),
];
const SORT_KEY = "sc:contacts-sort";

// ------------------------------------------------------------------ the page

export function ContactsPage() {
  const [rows, setRows] = useState<BookEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [finding, setFinding] = useState(false);
  const [role, setRole] = useState<"all" | ContactRole>("all");
  const [sort, setSort] = useState<BookSort>("az");
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const [measure, wide] = useWide<HTMLDivElement>(900);

  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      try { if (localStorage.getItem(SORT_KEY) === "recent") setSort("recent"); } catch { /* no storage */ }
      // Dusty's + menu, or a link: ?new=1 opens + Contact.
      if (new URLSearchParams(window.location.search).get("new") === "1") setAdding(true);
    });
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "contact") setAdding(true); };
    window.addEventListener("sc:create", on);
    return () => { off = true; window.removeEventListener("sc:create", on); };
  }, []);
  useEffect(() => {
    let off = false;
    call("/api/contacts").then((b) => { if (!off) { setRows(b.contacts as BookEntry[]); setErr(null); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (matchesBook(r, q)) { m.set(r.role, (m.get(r.role) ?? 0) + 1); m.set("all", (m.get("all") ?? 0) + 1); }
    return m;
  }, [rows, q]);
  const shown = useMemo(() => sortBook((rows ?? []).filter((r) => (role === "all" || r.role === role) && matchesBook(r, q)), sort), [rows, role, q, sort]);
  const setSortSaved = (s: BookSort) => { setSort(s); try { localStorage.setItem(SORT_KEY, s); } catch { /* no storage */ } };

  return (
    <>
    <PageHeader title="Contacts" count={rows ? rows.length : null}
      sub="Every person's numbers, emails and address in one book — whoever they are to you."
      actions={<>
        <select value={sort} onChange={(e) => setSortSaved(e.target.value as BookSort)} aria-label="Sort" style={{ ...field, width: "auto", height: 30 }}>
          <option value="az">A–Z</option><option value="recent">Recent</option>
        </select>
        <SearchToggle open={finding || !!q} onToggle={() => { if (finding || q) { setQ(""); setFinding(false); } else setFinding(true); }} label="Find a contact" />
        {/* The ScopeCrete emblem: Dusty offers "Add contact" (Coy, 2026-10-10), as on Jobs. */}
        <button onClick={() => { window.dispatchEvent(new Event("sc:dusty-open")); window.dispatchEvent(new Event("sc:dusty-contacts")); }}
          className="shrink-0 flex items-center justify-center rounded" aria-label="Add a contact — ask Dusty" title="Add a contact"
          style={{ width: 34, height: 34, border: `1px solid ${T.hiviz}`, background: T.card, cursor: "pointer" }}>
          <Emblem size={22} spin />
        </button>
      </>}>
      {(finding || q) && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setFinding(false)} placeholder="Find a name, company, number, email, address…" /></div>}
    </PageHeader>
    <div ref={measure} className="px-3 pb-3 lg:px-5">
      <div className="flex gap-1 flex-wrap mb-2" role="tablist" aria-label="What they are">
        {FILTERS.map((f) => {
          const on = role === f.k, n = counts.get(f.k) ?? 0;
          if (!n && f.k !== "all" && !on) return null;
          return (
            <button key={f.k} role="tab" aria-selected={on} onClick={() => setRole(f.k)} className="rounded px-2.5"
              style={{ height: 30, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: `1px solid ${on ? T.ink : T.hair}`,
                fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
              {f.label} <span style={nums}>{n}</span>
            </button>
          );
        })}
      </div>
      {err && <div role="alert" className="mb-2 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>Couldn&apos;t load contacts: {err}</div>}

      {rows === null && !err ? <div className="animate-pulse rounded" style={{ height: 120, background: T.hairSoft }} />
        : shown.length === 0 ? (
          <div className="rounded px-3 py-4" style={{ background: T.card, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
            {rows?.length ? "Nobody matches." : "No contacts yet. Everyone who calls or texts lands here, and + Contact adds someone who hasn't."}
          </div>
        ) : wide ? (
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, background: T.card }}>
            <thead><tr style={{ background: T.slab }}>
              {["Name", "What", "Phone", "Email", "Address", "Last in touch"].map((h) => (
                <th key={h} style={{ ...eyebrow, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                  <td style={{ padding: "6px 8px", maxWidth: 260 }}>
                    <Link href={bookHref(c)} className="flex items-center gap-2" style={{ color: T.ink }}>
                      <Initials name={c.name ?? c.company} size={26} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, ...clip }}>{bookName(c)}</span>
                        {(c.company || c.customer_name) && <span style={{ display: "block", fontSize: 10.5, color: T.ink3, ...clip }}>{c.company ?? c.customer_name}</span>}
                      </span>
                    </Link>
                  </td>
                  <td style={{ padding: "6px 8px" }}><BookTag role={c.role} /></td>
                  <td style={{ padding: "6px 8px", ...nums }}>
                    {c.phones.length ? <a href={`tel:${c.phones[0].number}`} style={{ color: T.ink }}>{formatNumber(c.phones[0].number)}</a> : <span style={{ color: T.ink3 }}>—</span>}
                    {c.phones.length > 1 && <span style={{ fontSize: 10.5, color: T.ink3 }}> +{c.phones.length - 1}</span>}
                  </td>
                  <td style={{ padding: "6px 8px", maxWidth: 220, ...clip }}>
                    {c.emails.length ? <a href={`mailto:${c.emails[0].address}`} style={{ color: T.chalk }}>{c.emails[0].address}</a> : <span style={{ color: T.ink3 }}>—</span>}
                    {c.emails.length > 1 && <span style={{ fontSize: 10.5, color: T.ink3 }}> +{c.emails.length - 1}</span>}
                  </td>
                  <td style={{ padding: "6px 8px", maxWidth: 240, color: c.address ? T.ink2 : T.ink3, ...clip }}>{c.address ?? "—"}</td>
                  <td style={{ padding: "6px 8px", color: T.ink3, ...nums }}>{relTime(c.last_contacted) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col" style={{ background: T.card }}>
            {shown.map((c) => (
              <Link key={c.id} href={bookHref(c)} className="px-3 py-2 flex items-center gap-2.5" style={{ borderTop: `1px solid ${T.hairSoft}`, color: T.ink }}>
                <Initials name={c.name ?? c.company} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="flex items-center gap-2">
                    <span style={{ fontWeight: 600, fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{bookName(c)}</span>
                    <BookTag role={c.role} />
                  </span>
                  <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>
                    {[c.company ?? c.customer_name, c.phones[0] && c.name ? formatNumber(c.phones[0].number) : null, c.emails[0]?.address].filter(Boolean).join(" · ") || "No number or email"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

      <Sheet open={adding} cover onClose={() => setAdding(false)} title="New contact" sub="Someone who hasn't called or texted yet">
        <div className="px-4 py-3">
          {adding && <NewContactForm onCancel={() => setAdding(false)} onMade={(c) => { setAdding(false); setTick((n) => n + 1); window.location.href = bookHref(c); }} />}
        </div>
      </Sheet>
    </div>
    </>
  );
}

// ------------------------------------------------------------- new contact

type Pair = { v: string; label: string };
const guessSeed = (seed: string) => {
  const s = seed.trim();
  if (!s) return {};
  if (/@/.test(s)) return { email: s };
  if (/^[\d\s().+-]{7,}$/.test(s)) return { phone: s };
  return { name: s };
};

/**
 * Someone who hasn't called yet. `seed` fills the name, number or email from
 * what was typed in a picker; `bucket` files them on the way in (a vendor from
 * the job's crew, say). A number or email that's already someone offers them.
 */
export function NewContactForm({ seed = "", bucket: fixedBucket, onMade, onCancel, onExisting }: {
  seed?: string; bucket?: "customer" | "vendor" | "personal";
  onMade: (c: BookEntry) => void; onCancel: () => void;
  /** Offered when the number or email is already someone — "Use them". */
  onExisting?: (who: { id: string; name: string | null }) => void;
}) {
  const g = guessSeed(seed);
  const [name, setName] = useState(g.name ?? "");
  const [company, setCompany] = useState("");
  const [phones, setPhones] = useState<Pair[]>([{ v: g.phone ?? "", label: "" }]);
  const [emails, setEmails] = useState<Pair[]>([{ v: g.email ?? "", label: "" }]);
  const [addr, setAddr] = useState({ address: "", city: "", state: "", zip: "" });
  const [bucket, setBucket] = useState<string>(fixedBucket ?? "");
  const [subtype, setSubtype] = useState("supplier");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string | null } | null>(null);

  const save = async () => {
    setBusy(true); setErr(null); setExisting(null);
    try {
      const b = await call("/api/contacts", "POST", {
        name, company, ...addr, bucket: bucket || null, subtype: bucket === "vendor" ? subtype : null,
        phones: phones.filter((p) => p.v.trim()).map((p) => ({ number: p.v, label: p.label })),
        emails: emails.filter((p) => p.v.trim()).map((p) => ({ address: p.v, label: p.label })),
      });
      onMade(b.contact as BookEntry);
    } catch (e) {
      const x = e as Error & { status?: number; body?: { existing?: { id: string; name: string | null } } };
      setErr(x.message);
      if (x.status === 409 && x.body?.existing) setExisting(x.body.existing);
    } finally { setBusy(false); }
  };
  const empty = !name.trim() && !company.trim() && !phones.some((p) => p.v.trim()) && !emails.some((p) => p.v.trim());

  // Scan a business card (Coy, 2026-10-09): the photo is shrunk here, read by the model, and fills the form to check.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const scan = async (f: File | undefined) => {
    if (!f) return;
    setScanning(true); setErr(null); setScanNote(null);
    try {
      const fd = new FormData();
      fd.append("image", await shrinkPhoto(f), "card.jpg");
      const r = await fetch("/api/contacts/scan", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      const c = b.card as CardRead;
      if (c.name) setName(c.name);
      if (c.company) setCompany(c.company);
      if (c.phones.length) setPhones(c.phones.map((p) => ({ v: p.number, label: p.label })));
      if (c.emails.length) setEmails(c.emails.map((e) => ({ v: e.address, label: e.label })));
      if (c.address || c.city) setAddr({ address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "" });
      setScanNote(c.name || c.company || c.phones.length || c.emails.length
        ? `Read from the card${c.title ? ` (${c.title})` : ""} — check it, then Add contact.` : "Nothing readable on that photo. Try again closer, in good light.");
    } catch (e) { setErr(`Card: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setScanning(false); }
  };

  const list = (what: "phone" | "email", rows: Pair[], set: (r: Pair[]) => void) => (
    <div className="flex flex-col gap-1.5">
      <span style={eyebrow}>{what === "phone" ? "Numbers" : "Emails"}</span>
      {rows.map((p, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={p.v} onChange={(e) => set(rows.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} aria-label={what === "phone" ? `Number ${i + 1}` : `Email ${i + 1}`}
            inputMode={what === "phone" ? "tel" : "email"} placeholder={what === "phone" ? "(225) 555-0100" : "name@company.com"} style={{ ...field, flex: 2 }} />
          <input value={p.label} onChange={(e) => set(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} aria-label="Label"
            placeholder={what === "phone" ? "Mobile, Office…" : "Work, Home…"} maxLength={30} style={{ ...field, flex: 1 }} />
          {rows.length > 1 && <button onClick={() => set(rows.filter((_, j) => j !== i))} aria-label="Remove" style={{ width: 28, color: T.ink3 }}>×</button>}
        </div>
      ))}
      {rows.length < 6 && <button onClick={() => set([...rows, { v: "", label: "" }])} className="self-start" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>+ Another {what === "phone" ? "number" : "email"}</button>}
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!busy && !empty) void save(); }} className="flex flex-col gap-2.5">
      <label className="inline-flex items-center gap-2 self-start rounded" style={{ ...btn(false), cursor: scanning ? "wait" : "pointer", opacity: scanning ? 0.6 : 1 }}>
        <IdentificationCard size={16} /> {scanning ? "Reading the card…" : "Scan a business card"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={scanning}
          onChange={(e) => { void scan(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {scanNote && <div style={{ fontSize: F.sm, color: T.ink2 }}>{scanNote}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="block"><span style={eyebrow}>Name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={120} style={field} /></label>
        <label className="block"><span style={eyebrow}>Company</span><input value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company" maxLength={120} style={field} /></label>
      </div>
      {list("phone", phones, setPhones)}
      {list("email", emails, setEmails)}
      <div className="flex flex-col gap-1.5">
        <span style={eyebrow}>Address</span>
        <input value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} aria-label="Street" placeholder="Street" style={field} />
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
          <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} aria-label="City" placeholder="City" style={field} />
          <input value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} aria-label="State" placeholder="LA" maxLength={20} style={field} />
          <input value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} aria-label="Zip" placeholder="Zip" maxLength={12} style={field} />
        </div>
      </div>
      {!fixedBucket && (
        <label className="block"><span style={eyebrow}>What are they?</span>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="What are they" style={field}>
            <option value="">Not sure yet (Unsorted)</option>
            <option value="customer">Customer</option><option value="vendor">Vendor</option><option value="personal">Personal</option>
          </select>
        </label>
      )}
      {bucket === "vendor" && (
        <label className="block"><span style={eyebrow}>Kind</span>
          <select value={subtype} onChange={(e) => setSubtype(e.target.value)} aria-label="Kind" style={field}>
            <option value="supplier">Supplier</option><option value="equipment">Equipment rental</option><option value="subcontractor">Subcontractor</option>
          </select>
        </label>
      )}
      {err && (
        <div role="alert" style={{ fontSize: F.sm, color: T.red }}>
          {err}{existing && <> {onExisting
            ? <button type="button" onClick={() => onExisting(existing)} style={{ color: T.chalk, textDecoration: "underline" }}>Use {existing.name ?? "them"}</button>
            : <Link href={`/dashboard/messages/${existing.id}?person=1`} style={{ color: T.chalk }}>Open {existing.name ?? "them"}</Link>}</>}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
        <button type="submit" disabled={busy || empty} style={{ ...btn(true), opacity: busy || empty ? 0.5 : 1 }}>{busy ? "Adding…" : "Add contact"}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ picker

/**
 * Pick a contact — the one search wherever a person is chosen (a thread, a
 * customer, a job's crew, an email's filing). Searches the whole book by name,
 * company, number, email or address; `roles` narrows it (vendors only for a
 * job's crew); `exclude` leaves out who is already there. "+ New contact"
 * opens the form inline, seeded with what was typed, and picks who it makes.
 */
export function ContactPicker({ onPick, exclude, roles, bucket, placeholder = "Find a contact: name, number, email…", busy, autoFocus = true }: {
  onPick: (c: BookEntry) => void; exclude?: string[]; roles?: ContactRole[];
  /** What a contact made here is filed as. */
  bucket?: "customer" | "vendor" | "personal";
  placeholder?: string; busy?: boolean; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [book, setBook] = useState<BookEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => {
    let off = false;
    call("/api/contacts").then((b) => { if (!off) setBook(b.contacts as BookEntry[]); }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);
  const skip = useMemo(() => new Set(exclude ?? []), [exclude]);
  const hits = useMemo(() => {
    if (!book) return [];
    const s = q.trim();
    const rows = book.filter((c) => !skip.has(c.id) && (!roles || roles.includes(c.role)) && matchesBook(c, s));
    return sortBook(rows, s ? "az" : "recent").slice(0, 30);
  }, [book, q, skip, roles]);

  if (making) {
    return (
      <div className="rounded p-3" style={{ border: `1px solid ${T.hair}`, background: T.slab }}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>New contact</div>
        <NewContactForm seed={q} bucket={bucket} onCancel={() => setMaking(false)}
          onMade={(c) => { setMaking(false); setBook((b) => (b ? [c, ...b] : b)); onPick(c); }}
          onExisting={(who) => { const c = book?.find((x) => x.id === who.id); setMaking(false); if (c) onPick(c); else setQ(who.name ?? ""); }} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Find a contact"
        style={{ ...field, height: 38, border: `1px solid ${T.hairStrong}` }} />
      <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${T.hairSoft}`, borderRadius: 4, background: T.card }}>
        {err && <div className="px-3 py-2" style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t load contacts: {err}</div>}
        {!book && !err && <div className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>}
        {book && hits.map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => onPick(c)} className="w-full flex items-center gap-2 px-3 text-left"
            style={{ minHeight: 42, borderBottom: `1px solid ${T.hairSoft}`, cursor: busy ? "default" : "pointer", color: T.ink }}>
            <Initials name={c.name ?? c.company} size={26} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: F.sm, fontWeight: 600, ...clip }}>{bookName(c)}</span>
              <span style={{ display: "block", fontSize: 10.5, color: T.ink3, ...clip }}>
                {[c.company ?? c.customer_name, c.phones[0] ? formatNumber(c.phones[0].number) : null, c.emails[0]?.address].filter(Boolean).join(" · ") || "No number or email"}
              </span>
            </span>
            <BookTag role={c.role} />
          </button>
        ))}
        {book && !hits.length && <div className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink3 }}>{q.trim() ? "Nobody matches." : "Nobody to add."}</div>}
        <button type="button" onClick={() => setMaking(true)} className="w-full text-left px-3" style={{ minHeight: 40, color: T.chalk, fontFamily: disp, fontSize: F.xs, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
          + New contact{q.trim() ? ` "${q.trim().slice(0, 40)}"` : ""}
        </button>
      </div>
    </div>
  );
}

/** A camera photo made small enough to send (1,600px on its long side, JPEG) — the card's words stay readable. */
async function shrinkPhoto(f: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    img.close();
    return await new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("couldn't read the photo"))), "image/jpeg", 0.85));
  } catch { return f; }
}
