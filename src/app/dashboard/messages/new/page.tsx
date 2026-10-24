"use client";

/**
 * New message (Coy, 2026-10-24, after Discord's DMs): find the person in Contacts, or add them if
 * they aren't in the system yet, then their thread opens with the text box ready.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/v34/tokens";
import { PageHeader } from "@/components/v34/primitives";
import { ContactPicker, NewContactForm } from "@/components/v34/contacts";

export default function NewMessagePage() {
  const router = useRouter();
  const [seed, setSeed] = useState<string | null>(null);
  const open = (id: string) => router.push(`/dashboard/messages/${id}`);
  return (
    <div style={{ background: T.slab, minHeight: "100%" }}>
      <PageHeader dusty={false} title="New message" sub="Find who to message, or add them if they aren't in Contacts yet." />
      <div className="px-3 py-3 lg:px-5" style={{ maxWidth: 720 }}>
        {seed === null ? (
          <>
            <div style={{ fontSize: 13, color: T.ink2, marginBottom: 6 }}>To:</div>
            <ContactPicker placeholder="Name, number or email" onPick={(c) => open(c.id)} onNew={(s) => setSeed(s)} />
          </>
        ) : (
          <div className="rounded p-3" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: T.ink, marginBottom: 8 }}>New contact</div>
            <NewContactForm seed={seed} onCancel={() => setSeed(null)}
              onMade={(c) => open(c.id)} onExisting={(who) => open(who.id)} />
          </div>
        )}
      </div>
    </div>
  );
}
