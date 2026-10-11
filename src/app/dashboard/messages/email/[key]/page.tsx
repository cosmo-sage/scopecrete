"use client";

import { useParams, useSearchParams } from "next/navigation";
import { EmailConversation } from "@/components/v34/email-client";

/** One email conversation, opened in Threads (migration 100). */
export default function EmailConversationPage() {
  const params = useParams();
  const sp = useSearchParams();
  const raw = (params?.key as string) ?? "";
  let key = raw;
  try { key = decodeURIComponent(raw); } catch { /* already plain */ }
  return <EmailConversation key={key} convKey={key} threadId={sp.get("t")} draftId={sp.get("draft")} />;
}
