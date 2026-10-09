import { call } from "@/components/v34/cost-cards";

/**
 * Quo taking a text isn't it arriving (2026-10-09): wait for Quo's delivery to
 * come back through its webhook (`message.delivered` → messages), by Quo's id.
 * True once it is in; false if it hasn't come in about 40 s.
 */
export async function waitForDelivery(quoId: string): Promise<boolean> {
  for (const wait of [4000, 6000, 10000, 20000]) {
    await new Promise((ok) => setTimeout(ok, wait));
    const d = await call(`/api/texts?quo_id=${encodeURIComponent(quoId)}`, "GET").catch(() => null);
    if (d?.delivered) return true;
  }
  return false;
}
