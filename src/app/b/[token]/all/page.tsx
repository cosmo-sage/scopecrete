import type { Metadata } from "next";
import { VendorPortal } from "@/components/v34/bids/vendor-portal";
import "@/styles/v34-shell.css";

/** A vendor's portal (migration 126): every bid request the org sent them. Public, no login. */
export const metadata: Metadata = { title: "Your bid requests", robots: { index: false, follow: false } };

export default async function VendorPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VendorPortal token={token} />;
}
