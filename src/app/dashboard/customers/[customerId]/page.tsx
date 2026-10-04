"use client";

/** One customer (migration 055; src/components/v34/customer-page.tsx). `?contact=` opens Threads on that person. */

import { use, useEffect, useState } from "react";
import { CustomerPage } from "@/components/v34/customer-page";

export default function CustomerScreen({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const [contact, setContact] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setContact(new URLSearchParams(window.location.search).get("contact")); });
    return () => { off = true; };
  }, []);
  if (contact === undefined) return null;
  return <CustomerPage key={customerId} customerId={customerId} focusContact={contact} />;
}
