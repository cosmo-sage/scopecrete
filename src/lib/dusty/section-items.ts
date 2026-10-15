/**
 * The section's emblem on its Budget row (Coy, 2026-10-15: "an AI emblem specifically to add budget items
 * into the section based on the dimensions/takeoffs … find the psi for the concrete and add the ready mix
 * per cubic yard with the fuel-surcharges … find the steel requirements … add the wire mesh or rebar. And if
 * it's not in the cost book, it can create it … suggest edits to the cost item").
 * Fixed words sent as Coy's question; Dusty answers with a plan Coy applies.
 */
export function sectionItemsQuestion(section: string, ref: string | null): string {
  const name = section.trim() || "this section";
  return [
    `Build the budget items for the section "${name}"${ref ? ` (area ${ref})` : ""} from its size and takeoffs, the specs (Specs - read by Dusty, the plan notes) and the plans.`,
    "- Concrete: find the psi and thickness the specs or plans call for, and add ready mix by the cubic yard counted from the area, with its fuel surcharge and any other per-yard or per-load fees as their own items.",
    "- Steel: find what the specs or plans require for this section's thickness, and add the wire mesh or rebar.",
    "- Anything else the scope of work needs (base, forming, finishing, labor, pump, equipment).",
    "Use my Price book items first. If none fits, make a new item. If one is close but missing information (no price, the wrong unit, no vendor), add it and give update_item steps for the edits.",
    "Say where each psi, thickness and steel spec comes from (sheet or spec page). Mark any price or quantity you estimate as an estimate with its basis. End with one plan I can apply.",
  ].join("\n");
}
