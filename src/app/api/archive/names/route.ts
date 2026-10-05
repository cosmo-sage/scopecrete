import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanIds } from "@/lib/archive";

/**
 * The real names behind the ids in a Dusty plan (migration 066), so the card Coy
 * taps Apply on shows who and what it touches — never only Dusty's own label.
 * GET ?kind=contact|customer|job|file|email&ids=a,b,… → { names: { id: name } }. Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const kind = req.nextUrl.searchParams.get("kind");
  const ids = cleanIds((req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids || !["contact", "customer", "job", "file", "email"].includes(kind ?? "")) return applyCookies(NextResponse.json({ names: {} }));
  const names: Record<string, string> = {};
  if (kind === "contact") {
    const { data } = await sb.from("contacts").select("id, name, phone, contact_type").eq("org_id", orgId).in("id", ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>) names[c.id] = c.name?.trim() || c.phone || "unknown";
  } else if (kind === "customer") {
    const { data } = await sb.from("customers").select("id, name").eq("org_id", orgId).in("id", ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) names[c.id] = c.name || "unnamed customer";
  } else if (kind === "file") {
    // Files a plan files somewhere (Dusty's "file" step).
    const { data } = await sb.from("files").select("id, name").eq("org_id", orgId).in("id", ids).is("deleted_at", null);
    for (const f of (data ?? []) as Array<{ id: string; name: string }>) names[f.id] = f.name;
  } else if (kind === "email") {
    // An email a plan files (Dusty's "file_email" step): its subject, who wrote it, and the files with it.
    const [{ data }, { data: files }] = await Promise.all([
      sb.from("emails").select("id, subject, original_from_name, original_from_address, from_name").eq("org_id", orgId).in("id", ids),
      sb.from("files").select("email_id, name").eq("org_id", orgId).in("email_id", ids).is("deleted_at", null),
    ]);
    for (const e of (data ?? []) as Array<{ id: string; subject: string | null; original_from_name: string | null; original_from_address: string | null; from_name: string | null }>) {
      const att = ((files ?? []) as Array<{ email_id: string; name: string }>).filter((f) => f.email_id === e.id).map((f) => f.name);
      names[e.id] = `“${e.subject || "(no subject)"}” from ${e.original_from_name || e.original_from_address || e.from_name || "unknown"}${att.length ? ` — ${att.join(" · ")}` : " — no files"}`;
    }
  } else {
    const { data } = await sb.from("jobs").select("id, title").eq("org_id", orgId).in("id", ids);
    for (const j of (data ?? []) as Array<{ id: string; title: string | null }>) names[j.id] = j.title || "untitled job";
  }
  return applyCookies(NextResponse.json({ names }));
}
