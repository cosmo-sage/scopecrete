"use client";
/**
 * The Plan Room for one job (migration 059, design/plan-room). Under the
 * job's own address so the rail's Jobs stays lit and Dusty is HOT on this job.
 */
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PlanRoom } from "@/components/v34/plan-room/plan-room";

export default function PlanRoomPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return (
    <Suspense fallback={null}>
      <PlanRoom jobId={jobId} view="takeoff" />
    </Suspense>
  );
}
