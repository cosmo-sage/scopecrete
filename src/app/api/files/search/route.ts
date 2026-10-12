import { NextRequest, NextResponse } from "next/server";
import { getApiSession, type ApiSession } from "@/lib/api-auth";
import { viewAsFor } from "@/lib/access-server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { CATEGORIES } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { dateWindow, namePattern, readFilter } from "@/lib/files-filter";
import { proposalNumbers } from "@/lib/proposal-number-server";

/**
 * Files (renamed from Documents 2026-10-03; Coy, 2026-09-30): every uploaded file in one place — photos,
 * plans, bids, vendor quotes, receipts, contracts — searchable and filtered.
 *
 * GET ?q= words in the file (name, note, Dusty's read or its own text — the
 *         search index from migration 054, websearch syntax) AND any name typed:
 *         a person, vendor, customer or job by that name brings its files
 *         (each says why it matched)
 *     &kind= image | pdf | other   &source= upload | email | text
 *     &vendor= (uuid)   &from= / &to= (YYYY-MM-DD)   &facets=1 (the filter lists)
 *     &cat= a category, or "unfiled" (no job and no person)
 *     &since= 7 | 30 | 365 (days)
 *     &job= / &contact= (uuid)
 *     &file= (uuid) — that one file, for a link from search
 *     &customer= (uuid) — its people's and its jobs' files (the customer page)
 * → { files (signed links), jobs, people } — the names for the job and person
 *   filters, from the files returned.
 *
 * Session client; org from the session; RLS on files (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = `${FILE_COLUMNS}, customer_id`;
type Row = Record<string, unknown> & { id: string; created_at: string };

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const p = req.nextUrl.searchParams;
  const bad = (m: string) => applyCookies(NextResponse.json({ error: m }, { status: 400 }));
  const f = readFilter(p);
  const cat = f.cat;
  if (cat && cat !== "unfiled" && cat !== "proposal" && !(CATEGORIES as readonly string[]).includes(cat)) return bad("Unknown category.");
  const file = p.get("file");
  if (file && !UUID.test(file)) return bad("Not a file id.");

  // Final proposals (migration 060) join the list: what each customer was sent, by job.
  const wantProposals = !file && (!cat || cat === "proposal") && !f.contact && !f.vendor && !f.kind && !f.source;
  const proposals = wantProposals ? await finalProposals(supabase, orgId, p) : [];
  if (cat === "proposal") return applyCookies(NextResponse.json({ files: [], jobs: [], people: [], proposals, facets: p.get("facets") ? await facets(supabase, orgId) : undefined }));

  // A customer's files: its people's and its jobs' (migration 055), and those filed on it.
  let custOr: string | null = null;
  if (f.customer) {
    const { cIds, jIds } = await customerReach(supabase, orgId, [f.customer]);
    custOr = [`customer_id.eq.${f.customer}`, ...(cIds.length ? [`contact_id.in.(${cIds.join(",")})`] : []), ...(jIds.length ? [`job_id.in.(${jIds.join(",")})`] : [])].join(",");
  }
  const { from, to } = dateWindow(f);
  // Everything but the words, applied to each query the same way.
  const base = () => {
    let q = supabase.from("files").select(COLS).eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
    if (file) q = q.eq("id", file);
    if (cat === "unfiled") q = q.is("job_id", null).is("contact_id", null).is("customer_id", null);
    else if (cat) q = q.eq("category", cat);
    if (f.kind === "other") q = q.not("kind", "in", "(image,pdf)");
    else if (f.kind) q = q.eq("kind", f.kind);
    if (f.source) q = q.eq("source", f.source);
    if (f.job) q = q.eq("job_id", f.job);
    if (f.contact) q = q.eq("contact_id", f.contact);
    if (f.vendor) q = q.eq("contact_id", f.vendor);
    if (custOr) q = q.or(custOr);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return q;
  };

  let rows: Row[];
  const why: Record<string, string> = {};
  const words = f.q.length >= 2 ? f.q : "";
  if (!words) {
    const { data, error } = await base();
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
    rows = (data ?? []) as unknown as Row[];
  } else {
    // The words in the files, AND any name typed: a person, vendor, customer or job by that name brings its files.
    const named = await namesLike(supabase, orgId, words);
    const ors = [
      ...(named.contacts.length ? [`contact_id.in.(${named.contacts.map((x) => x.id).join(",")})`] : []),
      ...(named.customers.length ? [`customer_id.in.(${named.customers.map((x) => x.id).join(",")})`] : []),
      ...(named.jobs.length ? [`job_id.in.(${named.jobs.map((x) => x.id).join(",")})`] : []),
    ];
    const [byWords, byName] = await Promise.all([
      base().textSearch("search_tsv", words, { type: "websearch", config: "english" }),
      ors.length ? base().or(ors.join(",")) : Promise.resolve({ data: [], error: null }),
    ]);
    if (byWords.error) return applyCookies(NextResponse.json({ error: byWords.error.message }, { status: 500 }));
    const seen = new Map<string, Row>();
    for (const r of (byWords.data ?? []) as unknown as Row[]) { seen.set(r.id, r); why[r.id] = "words"; }
    const nameOf = (r: Row) => named.contacts.find((x) => x.id === r.contact_id)?.name ?? named.customers.find((x) => x.id === r.customer_id)?.name ?? named.jobs.find((x) => x.id === r.job_id)?.name ?? null;
    for (const r of (byName.data ?? []) as unknown as Row[]) {
      if (!seen.has(r.id)) { seen.set(r.id, r); why[r.id] = `filed on ${nameOf(r) ?? "a match"}`; }
    }
    rows = [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300);
  }

  // Viewing as an estimator (src/lib/view-as.ts): only files on the jobs they were given — what RLS shows them.
  const viewAs = req.cookies.get(VIEW_AS_COOKIE) ? await viewAsFor(req, result.session) : null;
  if (viewAs?.access.limited) {
    const ok = new Set(viewAs.access.job_ids);
    rows = rows.filter((r) => typeof r.job_id === "string" && (viewAs.access.all_jobs || ok.has(r.job_id)));
  }
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean) as string[])];
  const personIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[])];
  const [jobs, people, files, fac] = await Promise.all([
    jobIds.length ? supabase.from("jobs").select("id, title, contact_id").eq("org_id", orgId).in("id", jobIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("contacts").select("id, name, company_name, phone, customer_id").eq("org_id", orgId).in("id", personIds) : Promise.resolve({ data: [] }),
    signFiles(supabase, rows),
    p.get("facets") ? facets(supabase, orgId, custOr) : Promise.resolve(undefined),
  ]);
  // The customers the files sit on, by their own customer or their person's —
  // the preview names "Customer page: Icon Technologies" (Coy, 2026-10-09).
  const peopleRows = (people.data ?? []) as Array<{ id: string; name: string | null; company_name: string | null; phone: string | null; customer_id: string | null }>;
  const custIds = [...new Set([...rows.map((r) => (r as unknown as { customer_id: string | null }).customer_id), ...peopleRows.map((c) => c.customer_id)].filter(Boolean) as string[])];
  const { data: custs } = custIds.length ? await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", custIds) : { data: [] };
  return applyCookies(NextResponse.json({
    files: (files as unknown as Row[]).map((r) => ({ ...r, matched: why[r.id] ?? null })), proposals, facets: fac,
    customers: ((custs ?? []) as Array<{ id: string; name: string | null }>).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name as string })),
    jobs: ((jobs.data ?? []) as Array<{ id: string; title: string | null }>).map((j) => ({ id: j.id, name: j.title || "Untitled job" })),
    people: peopleRows.map((c) => ({ id: c.id, name: c.name || c.company_name || c.phone || "Unknown", customer_id: c.customer_id })),
  }));
}

/** A customer's people and jobs, for "files on this customer". */
async function customerReach(sb: ApiSession["supabase"], orgId: string, custIds: string[]) {
  const { data: cs } = await sb.from("contacts").select("id").eq("org_id", orgId).in("customer_id", custIds).is("merged_into_contact_id", null);
  const cIds = ((cs ?? []) as Array<{ id: string }>).map((c) => c.id);
  const { data: js } = await sb.from("jobs").select("id").eq("org_id", orgId)
    .or([`customer_id.in.(${custIds.join(",")})`, ...(cIds.length ? [`contact_id.in.(${cIds.join(",")})`] : [])].join(","));
  return { cIds, jIds: ((js ?? []) as Array<{ id: string }>).map((j) => j.id) };
}

/** People, vendors, customers and jobs whose name holds the typed words — and, for a customer, its people and jobs too. */
async function namesLike(sb: ApiSession["supabase"], orgId: string, q: string) {
  const pat = namePattern(q);
  const empty = { contacts: [] as Array<{ id: string; name: string }>, customers: [] as Array<{ id: string; name: string }>, jobs: [] as Array<{ id: string; name: string }> };
  if (!pat) return empty;
  const [c, cu, j] = await Promise.all([
    sb.from("contacts").select("id, name, company_name").eq("org_id", orgId).is("merged_into_contact_id", null).or(`name.ilike.${pat},company_name.ilike.${pat}`).limit(40),
    sb.from("customers").select("id, name").eq("org_id", orgId).ilike("name", pat).limit(40),
    sb.from("jobs").select("id, title").eq("org_id", orgId).ilike("title", pat).limit(40),
  ]);
  const contacts = ((c.data ?? []) as Array<{ id: string; name: string | null; company_name: string | null }>).map((x) => ({ id: x.id, name: x.name || x.company_name || "a person" }));
  const customers = ((cu.data ?? []) as Array<{ id: string; name: string | null }>).map((x) => ({ id: x.id, name: x.name || "a customer" }));
  const jobs = ((j.data ?? []) as Array<{ id: string; title: string | null }>).map((x) => ({ id: x.id, name: x.title || "a job" }));
  if (customers.length) {
    const { cIds, jIds } = await customerReach(sb, orgId, customers.map((x) => x.id));
    const nm = customers[0].name;
    for (const id of cIds) if (!contacts.some((x) => x.id === id)) contacts.push({ id, name: nm });
    for (const id of jIds) if (!jobs.some((x) => x.id === id)) jobs.push({ id, name: nm });
  }
  return { contacts: contacts.slice(0, 120), customers, jobs: jobs.slice(0, 120) };
}

/**
 * What the filters can offer: every job, customer, vendor and person that has
 * files, with how many — so a list never shrinks to the one picked. On a
 * customer's Files tab (`custOr`), only what is filed on that customer.
 */
async function facets(sb: ApiSession["supabase"], orgId: string, custOr: string | null = null) {
  let fq = sb.from("files").select("job_id, contact_id, customer_id").eq("org_id", orgId).is("deleted_at", null);
  if (custOr) fq = fq.or(custOr);
  const { data } = await fq.limit(5000);
  const rows = (data ?? []) as Array<{ job_id: string | null; contact_id: string | null; customer_id: string | null }>;
  const count = (k: "job_id" | "contact_id" | "customer_id") => {
    const m = new Map<string, number>();
    for (const r of rows) if (r[k]) m.set(r[k] as string, (m.get(r[k] as string) ?? 0) + 1);
    return m;
  };
  const jc = count("job_id"), pc = count("contact_id"), cc = count("customer_id");
  const [jobs, people] = await Promise.all([
    jc.size ? sb.from("jobs").select("id, title, customer_id").eq("org_id", orgId).in("id", [...jc.keys()]) : Promise.resolve({ data: [] }),
    pc.size ? sb.from("contacts").select("id, name, company_name, phone, contact_type, customer_id").eq("org_id", orgId).in("id", [...pc.keys()]) : Promise.resolve({ data: [] }),
  ]);
  // A customer's files count everything on its people and jobs too.
  const custOf = new Map<string, number>(cc);
  for (const j of (jobs.data ?? []) as Array<{ id: string; customer_id: string | null }>) if (j.customer_id) custOf.set(j.customer_id, (custOf.get(j.customer_id) ?? 0) + (jc.get(j.id) ?? 0));
  for (const c of (people.data ?? []) as Array<{ id: string; customer_id: string | null; contact_type: string | null }>) if (c.customer_id && c.contact_type !== "vendor") custOf.set(c.customer_id, (custOf.get(c.customer_id) ?? 0) + (pc.get(c.id) ?? 0));
  const { data: cn } = custOf.size ? await sb.from("customers").select("id, name").eq("org_id", orgId).in("id", [...custOf.keys()]) : { data: [] };
  const name = (x: { name?: string | null; company_name?: string | null; phone?: string | null }) => x.name || x.company_name || x.phone || "Unknown";
  const ppl = (people.data ?? []) as Array<{ id: string; name: string | null; company_name: string | null; phone: string | null; contact_type: string | null }>;
  const by = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    jobs: ((jobs.data ?? []) as Array<{ id: string; title: string | null }>).map((j) => ({ id: j.id, name: j.title || "Untitled job", n: jc.get(j.id) ?? 0 })).sort(by),
    customers: ((cn ?? []) as Array<{ id: string; name: string | null }>).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name as string, n: custOf.get(c.id) ?? 0 })).sort(by),
    vendors: ppl.filter((c) => c.contact_type === "vendor").map((c) => ({ id: c.id, name: name(c), n: pc.get(c.id) ?? 0 })).sort(by),
    people: ppl.filter((c) => c.contact_type !== "vendor").map((c) => ({ id: c.id, name: name(c), n: pc.get(c.id) ?? 0 })).sort(by),
  };
}

/** The org's final proposals, newest first — number, job, total — filtered like the files (job, customer, since, words in the job's title). */
async function finalProposals(sb: ApiSession["supabase"], orgId: string, p: URLSearchParams) {
  let q = sb.from("job_proposals").select("id, job_id, version, finalized_at, snapshot->>number, snapshot->price->>total, snapshot->job->>title, snapshot->customer->>name")
    .eq("org_id", orgId).eq("status", "final").is("deleted_at", null).order("finalized_at", { ascending: false }).limit(100);
  const job = p.get("job");
  if (job && UUID.test(job)) q = q.eq("job_id", job);
  const cust = p.get("customer");
  if (cust && UUID.test(cust)) {
    const { data: js } = await sb.from("jobs").select("id").eq("org_id", orgId).eq("customer_id", cust);
    const ids = ((js ?? []) as Array<{ id: string }>).map((j) => j.id);
    if (!ids.length) return [];
    q = q.in("job_id", ids);
  }
  const since = Number(p.get("since"));
  if ([7, 30, 365].includes(since)) q = q.gte("finalized_at", new Date(Date.now() - since * 86400_000).toISOString());
  const [{ data }, numbers] = await Promise.all([q, proposalNumbers(sb, orgId)]);
  const words = (p.get("q") ?? "").trim().toLowerCase();
  // The number as SE-26-0001-A (src/lib/proposal-number.ts); `sent_as` is the one frozen in the snapshot when it differs (an older "P-2").
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({ id: r.id as string, job_id: r.job_id as string, version: r.version as number, finalized_at: r.finalized_at as string,
      number: numbers.number(r.job_id as string, Number(r.version)),
      sent_as: (r.number as string | null) && r.number !== numbers.number(r.job_id as string, Number(r.version)) ? r.number as string : null, total: r.total === null || r.total === undefined ? null : Number(r.total),
      title: (r.title as string | null) ?? null, customer: (r.name as string | null) ?? null }))
    .filter((r) => words.length < 2 || [r.number, r.sent_as, r.title, r.customer].some((x) => x?.toLowerCase().includes(words)));
}
