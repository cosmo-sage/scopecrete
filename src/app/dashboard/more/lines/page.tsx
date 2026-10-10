import { redirect } from "next/navigation";

/** Lines is a page of Settings now (2026-10-10) — old links land there. */
export default function LinesMoved() {
  redirect("/dashboard/settings/lines");
}
