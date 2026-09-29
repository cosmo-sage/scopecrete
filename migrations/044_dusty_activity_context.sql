-- 044 — Dusty's catch-up conversations (Coy, 2026-09-29: "clicking on the
-- dusty emblem triggers an automatic review of the latest activity").
--
-- A tap on the emblem starts a conversation about the latest activity rather
-- than about one person, job or screen. context_kind gains 'activity'.
--
-- Additive: one CHECK constraint accepts one more value. No policy, grant or
-- column changes; RLS stays owner-only (migration 043).

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.dusty_conversations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%context_kind%'
  loop
    execute format('alter table public.dusty_conversations drop constraint %I', c);
  end loop;
end $$;

alter table public.dusty_conversations
  add constraint dusty_conversations_context_kind_check
  check (context_kind in ('thread', 'scope', 'customer', 'cash', 'activity', 'cold'));
