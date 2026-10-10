/**
 * Server reads for sending proposals (src/lib/proposal-send.ts): which of a
 * person's jobs have a proposal to send and its live link, the link behind a
 * /p/ token seen in a thread, and how Coy has sent proposals before. Session
 * client — RLS decides — with the org filter explicit (§7).
 */
import type { ApiSession } from "@/lib/api-auth";
import { exampleLines, type SendExample } from "@/lib/proposal-send";
import { signedLine, viewLine } from "@/lib/proposal-links";

type Sb = ApiSession["supabase"];

export interface Sendable {
  job_id: string; job_title: string | null; contact_id: string | null; customer_id: string | null;
  number: string; version: number; status: "draft" | "final"; total: number | null;
  /** The live link for the newest final version, if one was made. */
  link: { id: string; url: string; token: string; sent_at: string | null; sent_via: string[]; view_count: number; last_viewed_at: string | null; views: string } | null;
}

/** Each job's newest proposal and its live link. */
export async function sendableProposals(sb: Sb, orgId: string, where: { contactIds?: string[]; customerIds?: string[]; jobIds?: string[]; recent?: number }, origin: string): Promise<Sendable[]> {
  let q = sb.from("jobs").select("id, title, job_number, contact_id, customer_id, updated_at").eq("org_id", orgId).is("archived_at", null);
  const ors: string[] = [];
  if (where.contactIds?.length) ors.push(`contact_id.in.(${where.contactIds.join(",")})`);
  if (where.customerIds?.length) ors.push(`customer_id.in.(${where.customerIds.join(",")})`);
  if (where.jobIds?.length) ors.push(`id.in.(${where.jobIds.join(",")})`);
  if (ors.length) q = q.or(ors.join(","));
  else if (!where.recent) return [];
  const { data: jobs } = await q.order("updated_at", { ascending: false }).limit(40);
  const jobRows = (jobs ?? []) as Array<{ id: string; title: string | null; job_number: string | null; contact_id: string | null; customer_id: string | null }>;
  if (!jobRows.length) return [];
  const ids = jobRows.map((j) => j.id);
  const [{ data: props }, { data: docs }] = await Promise.all([
    sb.from("job_proposals").select("id, job_id, version, status, snapshot->price->total, finalized_at").eq("org_id", orgId).in("job_id", ids).order("version", { ascending: false }),
    sb.from("documents").select("id, job_id, proposal_id, token, sent_at, sent_via, view_count, last_viewed_at, status, decided_name, decided_at, revoked_at, created_at")
      .eq("org_id", orgId).in("job_id", ids).not("proposal_id", "is", null).is("revoked_at", null).neq("status", "void").order("created_at", { ascending: false }),
  ]);
  const out: Sendable[] = [];
  for (const j of jobRows) {
    const ps = ((props ?? []) as Array<Record<string, unknown>>).filter((p) => p.job_id === j.id);
    if (!ps.length) continue;
    const newest = ps[0];
    const final = ps.find((p) => p.status === "final");
    const d = final ? ((docs ?? []) as Array<Record<string, unknown>>).find((x) => x.proposal_id === final.id) : undefined;
    out.push({
      job_id: j.id, job_title: j.title, contact_id: j.contact_id, customer_id: j.customer_id,
      number: `${j.job_number ?? "P"}-${newest.version}`, version: newest.version as number, status: newest.status === "final" ? "final" : "draft",
      total: typeof newest.total === "number" ? newest.total : final && typeof final.total === "number" ? final.total : null,
      link: d && final && final.version === newest.version ? {
        id: d.id as string, token: d.token as string, url: `${origin}/p/${d.token}`, sent_at: (d.sent_at as string | null) ?? null,
        sent_via: (d.sent_via as string[] | null) ?? [], view_count: (d.view_count as number | null) ?? 0, last_viewed_at: (d.last_viewed_at as string | null) ?? null,
        views: withSigned(d, viewLine({ view_count: (d.view_count as number | null) ?? 0, last_viewed_at: (d.last_viewed_at as string | null) ?? null })),
      } : null,
    });
    if (where.recent && out.length >= where.recent) break;
  }
  return out;
}

/** "Signed by … · opened 3 times …" when the customer signed it on the link (097). */
function withSigned(d: Record<string, unknown>, views: string): string {
  const signed = signedLine({ status: String(d.status ?? ""), decided_name: (d.decided_name as string | null) ?? null, decided_at: (d.decided_at as string | null) ?? null });
  return signed ? `${signed} · ${views}` : views;
}

/** The link behind a token seen in a thread — this org's only. */
export async function linkByToken(sb: Sb, orgId: string, token: string) {
  const { data: d } = await sb.from("documents").select("id, job_id, token, version, sent_at, view_count, last_viewed_at, revoked_at, status, decided_name, decided_at, job:jobs(title, job_number)")
    .eq("org_id", orgId).eq("token", token).maybeSingle();
  if (!d) return null;
  const job = (d.job ?? null) as { title?: string | null; job_number?: string | null } | null;
  return {
    id: d.id as string, job_id: d.job_id as string, job_title: job?.title ?? null, number: `${job?.job_number ?? "P"}-${d.version ?? "?"}`,
    live: !d.revoked_at && d.status !== "void", state: d.revoked_at ? "turned off" : d.status === "void" ? "replaced by a newer version" : "live",
    views: withSigned(d, viewLine({ view_count: (d.view_count as number | null) ?? 0, last_viewed_at: (d.last_viewed_at as string | null) ?? null })),
  };
}

/** Coy's own record of how he sends proposals (user_preferences, private to him). */
export async function readExamples(sb: Sb, orgId: string, userId: string): Promise<SendExample[]> {
  const { data } = await sb.from("user_preferences").select("prefs").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const v = (data?.prefs as Record<string, unknown> | null)?.proposal_sends;
  return Array.isArray(v) ? (v as SendExample[]) : [];
}

/** Texts Coy sent with a proposal link in them — by the app, by Dusty's plan or from the Quo app. */
export async function sentProposalTexts(sb: Sb, orgId: string) {
  const { data } = await sb.from("messages").select("body_text, occurred_at, contact:contacts(name)")
    .eq("org_id", orgId).eq("direction", "outbound").eq("channel", "sms").ilike("body_text", "%/p/%")
    .order("occurred_at", { ascending: false }).limit(5);
  return ((data ?? []) as Array<{ body_text: string | null; occurred_at: string; contact: { name?: string | null } | null }>)
    .filter((m) => m.body_text).map((m) => ({ body: m.body_text as string, at: m.occurred_at, to: m.contact?.name ?? null }));
}

/**
 * What Dusty is told about sending proposals: the proposals in view with their
 * links, and how Coy sends them. Lines for one CONTEXT block.
 */
export async function proposalSendLines(sb: Sb, orgId: string, userId: string, where: Parameters<typeof sendableProposals>[2], origin: string): Promise<string[]> {
  const [props, ex, texts] = await Promise.all([
    sendableProposals(sb, orgId, where, origin).catch(() => [] as Sendable[]),
    readExamples(sb, orgId, userId).catch(() => [] as SendExample[]),
    sentProposalTexts(sb, orgId).catch(() => []),
  ]);
  const out: string[] = [];
  for (const p of props) {
    const money = p.total !== null ? ` · $${p.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
    const state = p.status === "draft"
      ? `DRAFT v${p.version} — sending freezes it as v${p.version} and makes its link (refused if it can't be priced)`
      : p.link ? `FINAL v${p.version}, link ${p.link.url} — ${p.link.sent_at ? `sent ${p.link.sent_at.slice(0, 10)}${p.link.sent_via.length ? ` by ${p.link.sent_via.join(", ")}` : ""}` : "not sent yet"}, ${p.link.views}`
      : `FINAL v${p.version}, no link yet — the send step makes it`;
    out.push(`- ${p.job_title ?? "Untitled job"} (job ${p.job_id}${p.contact_id ? `, contact ${p.contact_id}` : ""}) · ${p.number}${money} · ${state}`);
  }
  if (!out.length) out.push("(no proposals for what is open — a job needs a proposal on its Proposal tab before it can be sent)");
  const how = exampleLines(ex, texts);
  if (how.length) {
    out.push("", "How Coy sends proposals (newest first; {first} = their first name, {title} = the job, {link} = the link). Write the way he does:");
    out.push(...how);
  } else out.push("", "Coy hasn't sent a proposal through the app yet: keep it short — hi, the job, the link, \"let me know if you have any questions\".");
  return out;
}
