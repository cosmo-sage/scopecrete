import { redirect } from "next/navigation";

/**
 * More is gone (Coy, 2026-09-30). Its entries live elsewhere: Customers,
 * Price book, Vendors and Logs in the Toolbox / rail, Phone lines under
 * Settings in the header (pricing defaults in Price book). Old links land on the
 * Dashboard. Lines and Logs keep their addresses under /dashboard/more.
 */
export default function MoreIndex() {
  redirect("/dashboard");
}
