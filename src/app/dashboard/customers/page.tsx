import { redirect } from "next/navigation";

/**
 * Customers are a Threads bucket now (DECISIONS §6, 2026-09-28): the list is
 * Threads → Customer, and one person opens their Customer page. The old
 * relation-based list (and its Unclassified tab) is superseded by the buckets.
 */
export default function CustomersPage() {
  redirect("/dashboard/messages?f=customers");
}
