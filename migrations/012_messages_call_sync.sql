-- 012_messages_call_sync.sql — ScopeCrete.ai
--
-- Additive only. Supports quo-intake v7 mirroring calls into public.messages.
--
-- NOT YET APPLIED. Per DECISIONS.md §7, schema changes need confirmation.

-- One messages row per legacy record. Without this, syncCallToMessages has to
-- read-then-write and two webhooks arriving for the same call within the same
-- moment could both miss the read and insert twice. The index makes the
-- relationship an invariant rather than a convention, and lets the function
-- become a true upsert later.
--
-- Partial: rows composed in the app (not imported) have legacy_id NULL and are
-- not constrained by this.
create unique index if not exists messages_legacy_source_uniq
  on public.messages (import_source, legacy_id)
  where legacy_id is not null;

-- The common read path: "every message for this contact, newest first".
create index if not exists messages_contact_occurred_idx
  on public.messages (contact_id, occurred_at desc);

-- quo_events already carries UNIQUE (org_id, event_id) as
-- idx_quo_events_org_event_id. That index is correct and stays. The bug it
-- exposed was in the FUNCTION, which keyed three distinct follow-up webhooks
-- (call.recording.completed / call.transcript.completed /
-- call.summary.completed) on the shared CALL id, so all three collided with
-- the call.completed row. Fixed in quo-intake v7 by keying on the webhook
-- envelope id instead. No schema change needed here — recording it so the
-- next person reading these migrations knows the index was not at fault.
