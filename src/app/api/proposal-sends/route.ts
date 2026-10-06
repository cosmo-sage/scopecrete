import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { addExample, toTemplate, type SendExample } from "@/lib/proposal-send";
import { readExamples } from "@/lib/proposal-send-server";

/**
 * How Coy sends proposals, kept so the next one starts from his words and Dusty
 * writes the way he does (Coy, 2026-10-05: "I want him to watch how i do it and
 * learn and improve"). Called after a proposal goes out — from the Preview,
 * from a thread, or on a Dusty plan.
 *
 * GET  → { examples } — Coy's own, newest first.
 * POST { via: "text"|"email", sent, subject?, dusty?, first?, names?, title?, url? }
 *   sent   the words that went out (with the link in them)
 *   dusty  Dusty's draft, when the send came from his plan
 * Kept in Coy's own user_preferences (`proposal_sends`, migration 053: RLS
 * org member AND user_id = auth.uid()), newest first, twelve at most.
 */

export const dynamic = "force-dynamic";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  return applyCookies(NextResponse.json({ examples: await readExamples(supabase, orgId, userId) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const via = b.via === "text" || b.via === "email" ? b.via : null;
  const sent = str(b.sent, 4000).trim();
  if (!via || !sent) return bad("Say how it went and the words.");
  const names = Array.isArray(b.names) ? b.names.slice(0, 6).map((n) => str(n, 120)).filter(Boolean) : [];
  const fill = { first: str(b.first, 60), title: str(b.title, 200) || null, url: str(b.url, 300), names };
  const template = toTemplate(sent, fill);
  const dusty = str(b.dusty, 4000).trim() ? toTemplate(str(b.dusty, 4000), fill) : null;
  const ex: SendExample = {
    via, template, subject: str(b.subject, 200).trim() ? toTemplate(str(b.subject, 200), fill) : null,
    dusty, edited: dusty !== null && dusty.replace(/\s+/g, " ") !== template.replace(/\s+/g, " "),
    job: fill.title, at: new Date().toISOString(),
  };
  const { data: cur } = await supabase.from("user_preferences").select("prefs").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const prefs = (cur?.prefs as Record<string, unknown>) ?? {};
  const next = { ...prefs, proposal_sends: addExample(prefs.proposal_sends, ex) };
  const { error } = await supabase.from("user_preferences")
    .upsert({ org_id: orgId, user_id: userId, prefs: next, updated_at: new Date().toISOString() }, { onConflict: "org_id,user_id" });
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ ok: true, examples: next.proposal_sends }));
}
