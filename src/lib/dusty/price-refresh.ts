/**
 * Today's prices for Price book items from their vendors (Coy, 2026-10-10: "When I select items, for
 * example lumber. I would like to pull updated pricing from vendors that are connected to this
 * product"). The tap asks Dusty, whose web price search (WEB PRICES, priceAsk()) runs on the question;
 * he answers with each price and its link and offers vendor_price steps — Coy's Apply sets them, and
 * each one's history row keeps where it came from. Only the items' names and the vendors' names leave
 * the app.
 */
export interface RefreshItem { name: string; unit?: string | null; vendors: string[] }

export function refreshQuestion(items: RefreshItem[]): string {
  const list = items.slice(0, 8).filter((i) => i.name.trim());
  const names = list.map((i) => i.name.trim().replace(/[?!;]/g, " ")).join(", ");
  const vendors = [...new Set(list.flatMap((i) => i.vendors.map((v) => v.trim()).filter(Boolean)))];
  const lines = list.map((i) => `- ${i.name.trim()}${i.unit ? ` (per ${i.unit})` : ""}${i.vendors.length ? ` — vendors on file: ${i.vendors.join(", ")}` : " — no vendor on file"}`);
  return `Look up today's prices for ${names}${vendors.length ? ` at ${vendors.join(", ")}` : ""}.\n\n${lines.join("\n")}\n\n`
    + "For each price you find, give it with its link and date, against what the Price book has now, and end with a vendor_price step for each (marked estimate until I confirm). Say which ones you couldn't find.";
}
