"use client";
/**
 * Job › Files (Coy, 2026-10-10: "take the 'Files' tab out of the 'Takeoffs' page and make it it's
 * own page between Summary and Takeoffs"). The same room as Takeoffs, opened on its files.
 */
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PlanRoom } from "@/components/v34/plan-room/plan-room";

export default function JobFilesPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return (
    <Suspense fallback={null}>
      <PlanRoom jobId={jobId} view="files" />
    </Suspense>
  );
}
