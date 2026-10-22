import type { Metadata } from "next";
import { PortalPage } from "@/components/v34/portal/portal-page";
import "@/styles/v34-shell.css";

/**
 * A customer's portal (migration 123): public, nobody signs in. Every read and
 * a new bid request go through /api/c/[token].
 */
export const metadata: Metadata = { title: "Your proposals and bid requests", robots: { index: false, follow: false } };

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalPage token={token} />;
}
