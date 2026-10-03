import { redirect } from "next/navigation";

/** Documents is Files now (Coy, 2026-10-03) — old links land there, ?file= and all. */
export default async function DocumentsMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const q = new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])) as Array<[string, string]>);
  redirect(`/dashboard/files${q.size ? `?${q}` : ""}`);
}
