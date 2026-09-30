import { redirect } from "next/navigation";

/**
 * Markups & overhead is gone (Coy, 2026-09-30): the default margin, O.H., day
 * minimum and parish tax rates live in Price book → Defaults; pay-yourself and
 * the recurring overhead live on the Cash page. Old links land on the defaults.
 */
export default function CostsScreen() {
  redirect("/dashboard/price-book?tab=defaults");
}
