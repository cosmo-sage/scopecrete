import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { CATEGORIES } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * Documents (Coy, 2026-09-30): every uploaded file in one place — photos,
 * plans, bids, vendor quotes, receipts, contracts — searchable and filtered.
 *
 * GET ?q= (words in the name, note, Dusty's read or the document's own text —
 *         the search index from migration 054, websearch syntax)
 *     &cat= a category, or "unfiled" (no job and no person)
 *     &since= 7 | 30 | 365 (days)
 *     &job= / &contact= (uuid)
 *     &file= (uuid) — that one file, for a link from search
 *     &customer= (uuid) — its people's and its jobs' files (the customer page)
 * → { files (signed links), jobs, people } — the names for the job and person
 *   filters, from the files returned.
 *
 * Session client; org from the session; RLS on job_files (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const p = req.nextUrl.searchParams;
  const bad = (m: string) => applyCookies(NextResponse.json({ error: m }, { status: 400 }));

  let q = supabase.from("job_files").select(FILE_COLUMNS).eq("org_id", orgId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(300);
  const file = p.get("file");
  if (file) {
    if (!UUID.test(file)) return bad("Not a file id.");
    q = q.eq("id", file);
  }
  const cat = p.get("cat");
  if (cat === "unfiled") q = q.is("job_id", null).is("contact_id", null);
  else if (cat) {
    if (!(CATEGORIES as readonly string[]).includes(cat)) return bad("Unknown category.");
    q = q.eq("category", cat);
  }
  // A customer's documents: its people's files and its jobs' files (migration 055).
  const cust = p.get("customer");
  if (cust) {
    if (!UUID.test(cust)) return bad("Not a customer id.");
    const { data: cs } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", cust).is("merged_into_contact_id", null);
    const cIds = ((cs ?? []) as Array<{ id: string }>).map((c) => c.id);
    const { data: js } = await supabase.from("jobs").select("id").eq("org_id", orgId).or([`customer_id.eq.${cust}`, ...(cIds.length ? [`contact_id.in.(${cIds.join(",")})`] : [])].join(","));
    const jIds = ((js ?? []) as Array<{ id: string }>).map((j) => j.id);
    const ors = [...(cIds.length ? [`contact_id.in.(${cIds.join(",")})`] : []), ...(jIds.length ? [`job_id.in.(${jIds.join(",")})`] : [])];
    if (!ors.length) return applyCookies(NextResponse.json({ files: [], jobs: [], people: [] }));
    q = q.or(ors.join(","));
  }
  for (const [k, col] of [["job", "job_id"], ["contact", "contact_id"]] as const) {
    const v = p.get(k);
    if (!v) continue;
    if (!UUID.test(v)) return bad(`Not a ${k} id.`);
    q = q.eq(col, v);
  }
  const since = Number(p.get("since"));
  if ([7, 30, 365].includes(since)) q = q.gte("created_at", new Date(Date.now() - since * 86400_000).toISOString());
  const words = (p.get("q") ?? "").trim().slice(0, 200);
  if (words.length >= 2) q = q.textSearch("search_tsv", words, { type: "websearch", config: "english" });

  const { data, error } = await q;
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean) as string[])];
  const personIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[])];
  const [jobs, people, files] = await Promise.all([
    jobIds.length ? supabase.from("jobs").select("id, title, contact_id").eq("org_id", orgId).in("id", jobIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("contacts").select("id, name, company_name, phone").eq("org_id", orgId).in("id", personIds) : Promise.resolve({ data: [] }),
    signFiles(supabase, rows),
  ]);
  return applyCookies(NextResponse.json({
    files,
    jobs: ((jobs.data ?? []) as Array<{ id: string; title: string | null }>).map((j) => ({ id: j.id, name: j.title || "Untitled job" })),
    people: ((people.data ?? []) as Array<{ id: string; name: string | null; company_name: string | null; phone: string | null }>)
      .map((c) => ({ id: c.id, name: c.name || c.company_name || c.phone || "Unknown" })),
  }));
}
