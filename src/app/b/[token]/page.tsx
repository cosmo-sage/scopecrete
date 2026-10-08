import type { Metadata } from "next";
import { SharedBid } from "@/components/v34/bids/shared-bid";
import "@/styles/v34-shell.css";

/**
 * A vendor's bid request link (migration 091): public, nobody signs in. Every
 * read and the answer go through /api/b/[token].
 */
export const metadata: Metadata = { title: "Bid request", robots: { index: false, follow: false } };

export default async function SharedBidPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedBid token={token} />;
}
