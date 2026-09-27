import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Confirming an enrich-contacts proposal — the step that has never existed.
 *
 * `enrich-contacts` has been deployed since 24 August and writes only to
 * `contact_proposals`. It has no UPDATE path to `contacts` at all. That was
 * deliberate: the enricher it replaced wrote names straight onto `contacts`
 * with no review, which is how the owner's own name ended up on five real
 * customers and how a lead-generation service ended up filed as "Brad Chaney".
 *
 * So the proposals were always meant to wait for a human. Nothing was ever
 * built to ask the human. This route is that missing half.
 *
 * TWO DECISIONS, SEPARATELY. A proposal carries a name and a classification and
 * Coy may believe one and not the other — "yes that's Amber, no she isn't a
 * vendor" has to be expressible. Accepting them together would make the cheaper
 * judgement carry the more expensive one.
 *
 * WHAT ACCEPTING A RELATION ACTUALLY DOES. It sets `relation_confirmed_at`,
 * which is the flag `quo-intake` reads before it will suppress lead creation
 * (DECISIONS.md §2b) and the flag the Vendors chip counts. Until a human sets
 * it, a vendor is still treated as a possible customer — that asymmetry is the
 * point: a junk lead costs annoyance, a missed customer costs revenue.
 *
 * No service-role client. `contact_proposals`, `contacts` and `customers` all
 * carry `org_id = ANY (get_user_org_ids())` policies, verified 2026-09-27, so
 * RLS is the enforcement and the session client is enough.
 */

export const dynamic = "force-dynamic";

/** `customers.relation` CHECK allows only these three. */
const RELATION_VALUES = ["customer", "vendor", "sub"] as const;

/**
 * THREE VOCABULARIES. Measured 2026-09-27, after migration 026:
 *
 *   enrich-contacts emits    customer | vendor | sub | not_work | unknown
 *   contact_proposals CHECK  customer | vendor | sub | not_work | unknown
 *                            | personal | spam
 *   customers.relation CHECK customer | vendor | sub
 *
 * Before 026 the proposals CHECK allowed only customer | vendor | personal |
 * spam, so `sub`, `not_work` and `unknown` failed on INSERT and the enricher
 * could not store three of its five answers. 026 (applied 2026-09-27) widened
 * it. customers.relation stays deliberately narrow: `not_work` and `unknown`
 * are the absence of a relationship, not a kind of one, so this route refuses
 * to confirm them as a relation.
 *
 * This route has to cope with whatever is actually in the column, including
 * `personal` and `spam` which the enricher never emits but the table allows.
 */
const NOT_A_RELATION: Record<string, string> = {
  unknown: "The enricher could not see which way the ask runs, so there is nothing to confirm. Reject it, or name the contact by hand.",
  not_work: "Spam, a robocall or a wrong number. `customers.relation` only holds customer, vendor or sub, so there is nowhere to record that yet.",
  personal: "Personal, not work. `customers.relation` only holds customer, vendor or sub, so there is nowhere to record that yet.",
  spam: "Spam. `customers.relation` only holds customer, vendor or sub, so there is nowhere to record that yet.",
};

type Decision = "accept" | "reject";

interface Body {
  name?: Decision;
  name_override?: string;
  relation?: Decision;
}

function bad(applyCookies: (r: NextResponse) => NextResponse, code: string, error: string, status = 400) {
  return applyCookies(NextResponse.json({ code, error }, { status }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return bad(applyCookies, "bad_json", "Body must be JSON."); }

  const nameDecision = body.name;
  const relationDecision = body.relation;

  if (!nameDecision && !relationDecision) {
    return bad(applyCookies, "nothing_to_decide",
      'Send {"name":"accept"|"reject"} and/or {"relation":"accept"|"reject"}.');
  }
  for (const [field, v] of [["name", nameDecision], ["relation", relationDecision]] as const) {
    if (v !== undefined && v !== "accept" && v !== "reject") {
      return bad(applyCookies, "bad_decision", `${field} must be "accept" or "reject".`);
    }
  }

  // Scoped by org as well as by RLS, so a proposal from another org is a clean
  // 404 rather than a zero-row update that reads as success.
  const { data: proposal, error: pErr } = await supabase
    .from("contact_proposals")
    .select("id, contact_id, proposed_name, proposed_company, classification, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (pErr) return bad(applyCookies, "read_failed", `contact_proposals: ${pErr.message}`, 500);
  if (!proposal) return bad(applyCookies, "not_found", "No such proposal.", 404);
  if (proposal.status !== "pending") {
    return bad(applyCookies, "already_decided",
      `This proposal is already ${proposal.status}. Re-run enrich-contacts to get a fresh one.`, 409);
  }
  if (!proposal.contact_id) {
    return bad(applyCookies, "no_contact", "This proposal is not attached to a contact.");
  }

  const applied: string[] = [];

  /* ---------------------------------------------------------------- name */

  if (nameDecision === "accept") {
    // The typed override wins, then the model's proposal. If neither exists
    // there is nothing to write — and the one thing this route must never do
    // is reach for a fallback. A derived name is exactly the class of value
    // this whole review step was built to stop.
    const typed = body.name_override?.trim();
    const name = typed || proposal.proposed_name?.trim() || "";
    if (!name) {
      return bad(applyCookies, "no_name",
        "This proposal has no proposed_name. Send name_override with the name you want, or reject it.");
    }

    const { error, count } = await supabase
      .from("contacts")
      // Provenance, not just the value. `contacts` records WHO decided a name,
      // and CHECK contacts_name_confirmed_is_human requires name_source='human'
      // whenever name_confirmed_at is set. Writing `name` alone would leave a
      // name Coy confirmed labelled 'legacy' — indistinguishable from the
      // unreviewed names the old enricher wrote, which is the one distinction
      // this whole review step exists to create.
      .update({
        name,
        name_source: "human",
        name_confirmed_at: new Date().toISOString(),
        name_confirmed_by: userId,
      }, { count: "exact" })
      .eq("id", proposal.contact_id)
      .eq("org_id", orgId);

    if (error) return bad(applyCookies, "name_write_failed", `contacts: ${error.message}`, 500);
    if (!count) return bad(applyCookies, "contact_not_found", "The contact for this proposal is not in your org.", 404);
    applied.push(typed ? `name set to "${name}" (edited)` : `name set to "${name}"`);
  }

  /* ------------------------------------------------------------ relation */

  let customerCreated = false;

  if (relationDecision === "accept") {
    const cls = proposal.classification;
    if (NOT_A_RELATION[cls]) {
      return bad(applyCookies, "not_a_relation", NOT_A_RELATION[cls]);
    }
    if (!RELATION_VALUES.includes(cls as typeof RELATION_VALUES[number])) {
      return bad(applyCookies, "bad_classification",
        `classification "${cls}" is not one of ${RELATION_VALUES.join(", ")}.`);
    }

    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .select("id, customer_id, name, phone")
      .eq("id", proposal.contact_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (cErr) return bad(applyCookies, "contact_read_failed", `contacts: ${cErr.message}`, 500);
    if (!contact) return bad(applyCookies, "contact_not_found", "The contact for this proposal is not in your org.", 404);

    // 63 of 197 contacts have no customer row. A relation lives on `customers`,
    // so one has to exist before it can be recorded. Created here rather than
    // failing, and reported in the response so it is never a silent side effect.
    let customerId = contact.customer_id as string | null;
    if (!customerId) {
      const { data: created, error: insErr } = await supabase
        .from("customers")
        .insert({
          org_id: orgId,
          name: proposal.proposed_company?.trim()
            || proposal.proposed_name?.trim()
            || (contact.name as string | null)
            || (contact.phone as string | null),
          relation: cls,
          relation_source: "proposal",
          relation_confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insErr) return bad(applyCookies, "customer_create_failed", `customers: ${insErr.message}`, 500);
      customerId = created.id as string;
      customerCreated = true;

      const { error: linkErr } = await supabase
        .from("contacts")
        .update({ customer_id: customerId })
        .eq("id", contact.id)
        .eq("org_id", orgId);
      if (linkErr) return bad(applyCookies, "customer_link_failed", `contacts: ${linkErr.message}`, 500);
    } else {
      const { error: relErr, count } = await supabase
        .from("customers")
        .update({
          relation: cls,
          relation_source: "proposal",
          // The whole point. quo-intake suppresses on this, the Vendors chip
          // counts on it, and nothing but a human confirmation sets it.
          relation_confirmed_at: new Date().toISOString(),
        }, { count: "exact" })
        .eq("id", customerId)
        .eq("org_id", orgId);

      if (relErr) return bad(applyCookies, "relation_write_failed", `customers: ${relErr.message}`, 500);
      if (!count) return bad(applyCookies, "customer_not_found", "The customer for this contact is not in your org.", 404);
    }

    applied.push(`relation confirmed as ${cls}${customerCreated ? " (customer record created)" : ""}`);
  }

  /* ----------------------------------------------------------- the stamp */

  // `accepted` only when both halves are settled. A row where the name was
  // taken and the classification was not is still an open question, and
  // closing it would hide that question forever.
  const nameSettled = nameDecision !== undefined;
  const relationSettled = relationDecision !== undefined;
  const bothSettled = nameSettled && relationSettled;
  const anyAccepted = nameDecision === "accept" || relationDecision === "accept";

  let status = "pending";
  if (bothSettled) status = anyAccepted ? "accepted" : "rejected";

  const stamp: Record<string, unknown> = { status };
  if (status !== "pending") {
    stamp.decided_at = new Date().toISOString();
    stamp.decided_by = userId;
  }

  const { error: sErr } = await supabase
    .from("contact_proposals")
    .update(stamp)
    .eq("id", id)
    .eq("org_id", orgId);

  if (sErr) return bad(applyCookies, "stamp_failed", `contact_proposals: ${sErr.message}`, 500);

  if (nameDecision === "reject") applied.push("name rejected");
  if (relationDecision === "reject") applied.push("classification rejected");

  return applyCookies(NextResponse.json({
    ok: true,
    proposal_id: id,
    status,
    applied,
    customer_created: customerCreated,
    // Surfaced so a half-decided row is visible rather than looking finished.
    still_pending: status === "pending"
      ? (nameSettled ? "classification" : "name")
      : null,
  }));
}
