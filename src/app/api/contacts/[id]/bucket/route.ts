import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Put a contact in a bucket — the one-tap sort on Threads.
 *
 * PATCH { bucket: "customer" | "vendor" | "personal" | "spam" | null, subtype?: string }
 *
 * `null` sends the contact back to Unsorted; for a contact Dusty filed on its
 * own (spam) that is the Undo, and it is never filed automatically again.
 *
 * sc_classify_contact() (migration 032) is the one writer: it sets the bucket
 * on the contact AND keeps customers.relation in step, which is what the
 * quo-intake lead guard reads — so a vendor or sub filed here stops creating
 * leads, exactly as confirming a relation on the Customers screen does.
 * Invoker function + session client: RLS decides what can be touched.
 *
 * A pending suggestion for the contact is closed when this answers everything
 * it asked: its name is already on the contact, or it proposed none.
 */

export const dynamic = "force-dynamic";

const BUCKETS = ["customer", "vendor", "personal", "spam"] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));

  let body: { bucket?: unknown; subtype?: unknown };
  try { body = await req.json(); } catch { return fail("Body must be JSON."); }
  const bucket = body.bucket ?? null;
  if (bucket !== null && !(BUCKETS as readonly unknown[]).includes(bucket)) {
    return fail(`bucket must be one of ${BUCKETS.join(", ")}, or null for Unsorted.`);
  }
  const subtype = typeof body.subtype === "string" && body.subtype.trim() ? body.subtype.trim() : null;

  const { data, error } = await supabase.rpc("sc_classify_contact", { p_contact: id, p_bucket: bucket, p_subtype: subtype });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 500;
    return fail(error.message, status);
  }
  const row = ((data ?? []) as Array<{ bucket: string | null; subtype: string | null; relation: string | null; customer_created: boolean }>)[0];

  if (bucket !== null) {
    const [{ data: contact }, { data: pend }] = await Promise.all([
      supabase.from("contacts").select("name").eq("org_id", orgId).eq("id", id).maybeSingle(),
      supabase.from("contact_proposals").select("id, proposed_name").eq("org_id", orgId).eq("contact_id", id).eq("status", "pending"),
    ]);
    const name = (contact?.name as string | null)?.trim().toLowerCase() ?? "";
    const settled = ((pend ?? []) as Array<{ id: string; proposed_name: string | null }>)
      .filter((p) => !p.proposed_name?.trim() || p.proposed_name.trim().toLowerCase() === name)
      .map((p) => p.id);
    if (settled.length) {
      await supabase.from("contact_proposals")
        .update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: userId })
        .eq("org_id", orgId).in("id", settled);
    }
  }

  return applyCookies(NextResponse.json({ ok: true, ...row }));
}
