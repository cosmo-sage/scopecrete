import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A customer's people (migration 055).
 * GET ?q= → people who could be added: live contacts not already on this
 *   customer, by name, company, phone digits or email (10 at most).
 * POST { contact_id } → put that person under this customer
 *   (sc_attach_contact: their own jobs come with them; undoable).
 * Session client; org from the session; the RPC checks membership itself.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/[,%()*]/g, "").slice(0, 60);
  if (q.length < 2) return applyCookies(NextResponse.json({ people: [] }));
  const digits = q.replace(/\D/g, "");
  const ors = [`name.ilike.%${q}%`, `company_name.ilike.%${q}%`, `email.ilike.%${q}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])];
  const { data, error } = await sb.from("contacts").select("id, name, phone, email, contact_type, customer_id, status_summary")
    .eq("org_id", orgId).is("merged_into_contact_id", null).or(ors.join(",")).limit(20);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const people = ((data ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null; contact_type: string | null; customer_id: string | null; status_summary: string | null }>)
    .filter((p) => p.customer_id !== customerId).slice(0, 10);
  return applyCookies(NextResponse.json({ people }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, applyCookies } = result.session;
  const b = await req.json().catch(() => ({})) as { contact_id?: string };
  if (!b.contact_id || !UUID.test(b.contact_id)) return applyCookies(NextResponse.json({ error: "Pick a person." }, { status: 400 }));
  const { data, error } = await sb.rpc("sc_attach_contact", { p_contact: b.contact_id, p_customer: customerId });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 500 }));
  return applyCookies(NextResponse.json({ move_id: data ?? null }));
}
