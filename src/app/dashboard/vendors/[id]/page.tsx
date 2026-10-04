"use client";

/** One vendor: their prices (★ = the one budgets use), receipts, jobs (migration 051). */

import { use } from "react";
import { VendorPage } from "@/components/v34/vendors";

export default function VendorScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VendorPage id={id} />;
}
