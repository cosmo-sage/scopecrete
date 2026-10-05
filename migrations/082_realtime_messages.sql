-- 082 — Threads hear a text the moment it lands (Coy, 2026-10-05: "I would
-- like the webhooks to be near instant from quo").
--
-- Quo's webhook stores a text in `messages` about two seconds after it is sent
-- (measured: Bubba's text, Quo 05:55:28.2 → stored and projected 05:55:30.3).
-- The Threads screens read once when opened, so it didn't show until a reload.
-- The app now polls /api/threads/latest every 15 s (no migration needed); this
-- makes it instant: Supabase Realtime announces each new `messages` row to the
-- signed-in browsers allowed to read it (Realtime applies the table's RLS —
-- get_user_org_ids() — per subscriber, so no other org hears about it, and anon
-- reads nothing, as before). The browser only takes it as "something changed"
-- and refetches its own reads; the payload is never drawn.
--
-- Additive: no table, column, grant or policy changes. Undo:
--   alter publication supabase_realtime drop table public.messages;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
