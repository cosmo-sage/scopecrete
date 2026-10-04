import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { messageType, type SearchType } from "@/lib/v34/threads";

/**
 * Search inside Threads (Threads v2): words, photos, files, links, calls and
 * voicemails, across one number, one person, or every person in a thread.
 *
 * GET ?contacts=<id,id,…> (or bucket=customer|vendor|personal|spam|unsorted)&q=&number=<e164>&type=all|msg|photo|file|link|call|vm
 *   → { results: [...newest first, ≤ 80], counts: { all, msg, photo, … } }
 * The counts are for the current words and scope, whatever type is picked, so
 * the chips show what each filter would find. No words: everything, newest first.
 *
 * Session client, org from the session; at most 400 people per search.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const sp = req.nextUrl.searchParams;
  let ids = (sp.get("contacts") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 400);
  // A system thread (Customer, Vendor, …) has no saved list: its people are worked
  // out here the way Threads files them — Coy confirmed the bucket, or Dusty filed it.
  const bucket = sp.get("bucket");
  if (!ids.length && bucket && ["customer", "vendor", "personal", "spam", "unsorted"].includes(bucket)) {
    let cq = sb.from("contacts").select("id").eq("org_id", orgId).is("merged_into_contact_id", null).order("updated_at", { ascending: false }).limit(400);
    cq = bucket === "unsorted"
      ? cq.is("classification_confirmed_at", null).is("auto_classified_at", null)
      : cq.eq("contact_type", bucket).or("classification_confirmed_at.not.is.null,auto_classified_at.not.is.null");
    const { data: people } = await cq;
    ids = ((people ?? []) as Array<{ id: string }>).map((c) => c.id);
  }
  if (!ids.length) return applyCookies(NextResponse.json({ results: [], counts: { all: 0 } }));
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const number = sp.get("number");
  const type = (sp.get("type") ?? "all") as "all" | SearchType;

  const { data: lines } = await sb.from("org_phone_numbers").select("phone_e164").eq("org_id", orgId);
  const ours = new Set(((lines ?? []) as Array<{ phone_e164: string }>).map((l) => l.phone_e164));
  let mq = sb.from("messages").select("id, contact_id, channel, direction, occurred_at, body_text, summary, summary_source, duration_seconds, from_address, to_address")
    .eq("org_id", orgId).in("contact_id", ids).order("occurred_at", { ascending: false }).limit(1500);
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, " ")}%`;
    mq = mq.or(`body_text.ilike.${like},summary.ilike.${like}`);
  }
  const [{ data: msgs }, { data: people }] = await Promise.all([
    mq, sb.from("contacts").select("id, name, phone").eq("org_id", orgId).in("id", ids),
  ]);
  type M = { id: string; contact_id: string; channel: string | null; direction: string | null; occurred_at: string | null; body_text: string | null; summary: string | null; summary_source: string | null; duration_seconds: number | null; from_address: string | null; to_address: string | null };
  let rows = (msgs ?? []) as M[];
  const cp = (m: M) => (m.from_address && !ours.has(m.from_address) ? m.from_address : m.to_address && !ours.has(m.to_address) ? m.to_address : null);
  if (number) rows = rows.filter((m) => cp(m) === number || !cp(m));
  const msgIds = rows.map((m) => m.id).slice(0, 1000);
  const { data: media } = msgIds.length ? await sb.from("message_media").select("message_id, kind").eq("org_id", orgId).in("message_id", msgIds) : { data: [] };
  const kinds = new Map<string, string[]>();
  for (const r of (media ?? []) as Array<{ message_id: string; kind: string | null }>) kinds.set(r.message_id, [...(kinds.get(r.message_id) ?? []), r.kind ?? "file"]);
  const who = new Map(((people ?? []) as Array<{ id: string; name: string | null; phone: string | null }>).map((c) => [c.id, c]));
  const fmt = (p: string | null) => { const d = (p ?? "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? ""; };
  const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

  const counts: Record<string, number> = { all: 0, msg: 0, photo: 0, file: 0, link: 0, call: 0, vm: 0 };
  const results = [];
  for (const m of rows) {
    const t = messageType({ ...m, media_kinds: kinds.get(m.id) });
    counts.all++; counts[t]++;
    if (type !== "all" && t !== type) continue;
    if (results.length >= 80) continue;
    const c = who.get(m.contact_id);
    const name = c?.name?.trim() || fmt(c?.phone ?? cp(m));
    const dir = m.direction === "outbound" ? "out" : "in";
    results.push({
      id: m.id, type: t, contact_id: m.contact_id, at: m.occurred_at, channel: cp(m) ? `phone:${cp(m)}` : null,
      title: t === "call" || t === "vm" ? `${t === "vm" ? "Voicemail" : "Call"} · ${dir}${m.duration_seconds ? ` · ${mmss(m.duration_seconds)}` : ""}` : dir === "out" ? `You → ${name}` : name,
      snippet: (m.body_text?.trim() || m.summary?.trim() || (t === "photo" ? "Photo" : t === "file" ? "File" : "")).slice(0, 240),
      where: [name, fmt(cp(m))].filter(Boolean).join(" · "),
    });
  }
  return applyCookies(NextResponse.json({ results, counts }));
}
