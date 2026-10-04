"use client";
/**
 * Job › Proposal (migration 060, design/proposal). Under the job's own
 * address so the rail's Jobs stays lit and Dusty is HOT on this job.
 */
import { useParams } from "next/navigation";
import { Proposal } from "@/components/v34/proposal/proposal";

export default function ProposalPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <Proposal jobId={jobId} />;
}
