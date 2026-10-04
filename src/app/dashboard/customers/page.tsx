"use client";

/** Customers — one row per customer, not per person (migration 055; src/components/v34/customers.tsx). */

import { Customers } from "@/components/v34/customers";

export default function CustomersScreen() {
  return <Customers />;
}
