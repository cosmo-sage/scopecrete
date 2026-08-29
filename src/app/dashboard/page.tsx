import { redirect } from "next/navigation";

/**
 * /dashboard has no screen of its own in v34 — the four tabs are Threads,
 * Scope, Cash and More, and Threads is home. The old Home screen (invented
 * pipeline totals, "Win Rate 50%") is gone rather than restyled.
 */
export default function DashboardIndex() {
  redirect("/dashboard/messages");
}
