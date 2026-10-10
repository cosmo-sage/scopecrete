import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { PROPOSAL_COLS, priceBundle, proposalBundle } from "@/lib/proposal-server";
import { formatProposalNumber } from "@/lib/proposal-number";
import { priceChoices, termsText, warrantyText, type DocTemplate, type DraftInput, type ProposalDisplay } from "@/lib/proposal";

/**
 * Mark the proposal final (migration 060): the server prices it again with the
 * same functions the page uses, refuses while the draws don't add up to the
 * total, and freezes the priced document in `snapshot` — what the customer
 * was shown. The database refuses any later change to a final proposal.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = await proposalBundle(supabase, orgId, id);
  if (!b || !b.proposal) return bad("No such job.", 404);
  const p = b.proposal as Record<string, unknown>;
  if (p.status !== "draft") return bad("Already final.", 409);
  const { priced, check, tier, input } = priceBundle(b);
  const options = b.options as Array<{ id: string; label: string }>;
  // "Every option — the customer picks": each option must price, and the draws are percentages that reach 100.
  const many = (p.display as ProposalDisplay | null)?.all_options === true && options.length > 1;
  const picks = many ? priceChoices(input as DraftInput, options) : null;
  if (picks) {
    const stuck = picks.choices.find((c) => c.total === null);
    if (stuck) return bad(`${stuck.label} can't be priced yet: ${stuck.blocked}`);
    if (!picks.check.ok) return bad(`With every option offered, the draws must be percentages that add up to 100% (now ${picks.check.pct}%).`);
  } else {
    if (!priced.ok) return bad(`The budget can't be priced yet: ${priced.blocked.slice(0, 3).join("; ")}`);
    if (!check?.ok) return bad(`The draws come to $${check?.sum.toFixed(2)} against a $${priced.total.toFixed(2)} proposal — make them add up first.`);
  }
  const orgName = ((b.org as { name?: string } | null)?.name) ?? "";
  // SE-26-0001-A (src/lib/proposal-number.ts), frozen with the rest of what the customer is shown.
  const number = formatProposalNumber(b.number_base, Number(p.version));
  const snapshot = {
    number, made_at: new Date().toISOString(), option_id: tier.option_id,
    job: { title: b.job.title, address: b.job.address, job_type: b.job.job_type },
    customer: b.customer, contact: b.contact, org: b.org, prepared_by: b.preparer,
    display: p.display, draws: p.draws, warranty: p.warranty, terms: p.terms, scope_intro: p.scope_intro, cover_file_id: p.cover_file_id,
    // The words as shown, not a pointer to a template that may change later.
    warranty_text: warrantyText(p.warranty as never, b.templates as DocTemplate[], orgName),
    terms_text: termsText(p.terms as never, b.templates as DocTemplate[], orgName),
    sections: b.sections, photo: (b.photos as Array<{ id: string; name: string | null }>).find((f) => f.id === p.cover_file_id) ?? null,
    price: priced,
    // Every option, priced, when the customer picks.
    choices: picks ? { list: picks.choices, shared: picks.shared } : null,
  };
  const { data, error } = await supabase.from("job_proposals")
    .update({ status: "final", snapshot, finalized_at: new Date().toISOString(), finalized_by: userId })
    .eq("id", p.id as string).eq("org_id", orgId).select(PROPOSAL_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ proposal: data }));
}
