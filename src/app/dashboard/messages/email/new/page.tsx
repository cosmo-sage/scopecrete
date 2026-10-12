"use client";

import { useSearchParams } from "next/navigation";
import { NewEmail } from "@/components/v34/email-client";

/** A new email — from Compose, a person's Email channel (?contact=, ?to=, ?subject=, ?body= — a proposal sent from its Preview) or a saved draft (?draft=). */
export default function NewEmailPage() {
  const sp = useSearchParams();
  return <NewEmail threadId={sp.get("t")} to={sp.get("to")} contactId={sp.get("contact")} draftId={sp.get("draft")} body={sp.get("body")} subject={sp.get("subject")} />;
}
