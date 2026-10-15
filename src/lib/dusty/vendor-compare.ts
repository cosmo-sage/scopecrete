/**
 * The vendor panel's Dusty button (Coy, 2026-10-15: "a vendor options list in the Vendor column that opens a
 * vendor intelligence panel in the budget … Dusty can pull the cost data from my phone conversation with the
 * vendor or pull it from the vendor website and update the cost items per vendor").
 * Fixed words sent as Coy's question; Dusty answers with vendor_price / new_vendor steps Coy applies.
 */
export interface CompareVendor { name: string; price: number | null; website?: string | null }

export function vendorCompareQuestion(item: string, unit: string | null, vendors: CompareVendor[], extra = ""): string {
  const u = (unit ?? "").trim() || "unit";
  const list = vendors.length
    ? vendors.map((v) => `- ${v.name}: ${v.price === null ? "no price yet" : `$${v.price.toFixed(2)}/${u}`}${v.website ? ` · ${v.website}` : ""}`).join("\n")
    : "- none on file yet";
  return [
    `Compare vendors for the Price book item "${item.trim() || "this item"}" (per ${u}).`,
    "Vendors pricing it now:",
    list,
    ...(extra.trim() ? [`Also look at: ${extra.trim()}.`] : []),
    "For each vendor, find their current price from my calls and texts with them, a quote or invoice they sent, or their website. Search the web for local vendors in my area that sell it too.",
    "Give a vendor_price step for each price you find, with where it came from, marked as an estimate until I confirm. Add a vendor I don't have with a new_vendor step first. Say which is cheapest. End with one plan I can apply.",
  ].join("\n");
}
