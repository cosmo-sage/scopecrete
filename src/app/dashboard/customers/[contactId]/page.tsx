import { redirect } from "next/navigation";

/** One customer's page lives at the person's own route (DECISIONS §6, 2026-09-28). */
export default async function CustomerPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  redirect(`/dashboard/messages/${contactId}`);
}
