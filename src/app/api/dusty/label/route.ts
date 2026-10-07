import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { formatPhone } from "@/lib/v34/tokens";

/**
 * What Dusty's header names before a chat starts (Coy, 2026-10-07: "instead
 * of saying 'this person', say the person's actual name, or the phone number
 * if there is no name. Or say the job name"). `?kind=thread|scope|customer&id=`.
 * Session client: RLS decides, the org comes from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return applyCookies(NextResponse.json({ label: null }));
  let label: string | null = null;
  if (kind === "thread") {
    const { data } = await supabase.from("contacts").select("name, phone").eq("org_id", orgId).eq("id", id).maybeSingle();
    const c = data as { name: string | null; phone: string | null } | null;
    label = c ? (c.name?.trim() || (c.phone ? formatPhone(c.phone) : null)) : null;
  } else if (kind === "scope") {
    const { data } = await supabase.from("jobs").select("title").eq("org_id", orgId).eq("id", id).maybeSingle();
    label = (data as { title: string | null } | null)?.title?.trim() || null;
  } else if (kind === "customer") {
    const { data } = await supabase.from("customers").select("name").eq("org_id", orgId).eq("id", id).maybeSingle();
    label = (data as { name: string | null } | null)?.name?.trim() || null;
  }
  return applyCookies(NextResponse.json({ label }));
}
