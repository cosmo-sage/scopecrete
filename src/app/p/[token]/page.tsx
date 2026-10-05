import type { Metadata } from "next";
import { SharedProposal } from "@/components/v34/proposal/shared-view";
import "@/styles/v34-shell.css";

/**
 * A customer's proposal link (migration 075): public, nobody signs in. Every
 * read goes through /api/p/[token] — the frozen customer copy behind a live
 * link, each opening logged for Coy.
 */
export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

export default async function SharedProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedProposal token={token} />;
}
