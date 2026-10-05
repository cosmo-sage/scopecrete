"use client";
/**
 * Job › Summary (Coy, 2026-10-05). Under the job's own address so the rail's
 * Jobs stays lit and Dusty is HOT on this job.
 */
import { useParams } from "next/navigation";
import { JobSummary } from "@/components/v34/job-summary";

export default function JobSummaryPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <JobSummary jobId={jobId} />;
}
