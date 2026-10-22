"use client";
/** Job › Locations (Coy, 2026-10-18) — on the job Space's Customer Account shelf. */
import { useParams } from "next/navigation";
import { JobLocations } from "@/components/v34/job-account";

export default function JobLocationsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <JobLocations jobId={jobId} />;
}
