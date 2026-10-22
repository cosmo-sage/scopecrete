"use client";
/** Job › Schedule (Coy, 2026-10-18) — on the job Space's Customer Account shelf. */
import { useParams } from "next/navigation";
import { JobSchedule } from "@/components/v34/job-account";

export default function JobSchedulePage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <JobSchedule jobId={jobId} />;
}
