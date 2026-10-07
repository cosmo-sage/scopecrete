"use client";

import { useParams } from "next/navigation";
import { ThreadView } from "@/components/v34/thread-view";

/** One person, opened in Threads — the view itself is shared with the customer page's Threads tab. */
export default function ChatThreadPage() {
  const params = useParams();
  return <ThreadView contactId={params?.id as string} />;
}
