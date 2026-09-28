-- 043 — Dusty's conversations, kept (Coy, 2026-09-28: "reference older
-- conversations in a side project panel to select and continue older
-- conversations"). DECISIONS §6 said channels per job/customer "are still to
-- come and need a table" — these are the tables.
--
--   * dusty_conversations — one chat, private to the person who had it
--     (user_id), with what it is about (context_kind/id/label) so continuing
--     it later brings the same facts back, whatever screen it is opened from.
--   * dusty_messages — its turns. Written only by /api/dusty under the
--     session: the question before the model is asked, the answer when the
--     stream ends.
--
-- Additive: two tables. RLS: an org member AND the owner — nobody else in the
-- org reads your chats. Anon refused.

create table if not exists public.dusty_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  context_kind text not null check (context_kind in ('thread', 'scope', 'customer', 'cash', 'cold')),
  context_id uuid,
  context_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dusty_conversations_owner_idx on public.dusty_conversations (org_id, user_id, updated_at desc);
create index if not exists dusty_conversations_context_idx on public.dusty_conversations (org_id, context_kind, context_id);

create table if not exists public.dusty_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dusty_conversations(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 40000),
  created_at timestamptz not null default now()
);
create index if not exists dusty_messages_conv_idx on public.dusty_messages (conversation_id, created_at);

alter table public.dusty_conversations enable row level security;
alter table public.dusty_messages enable row level security;

drop policy if exists dusty_conversations_owner on public.dusty_conversations;
create policy dusty_conversations_owner on public.dusty_conversations
  for all to authenticated
  using (org_id = any (get_user_org_ids()) and user_id = auth.uid())
  with check (org_id = any (get_user_org_ids()) and user_id = auth.uid());

drop policy if exists dusty_messages_owner on public.dusty_messages;
create policy dusty_messages_owner on public.dusty_messages
  for all to authenticated
  using (org_id = any (get_user_org_ids()) and exists (
    select 1 from public.dusty_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (org_id = any (get_user_org_ids()) and exists (
    select 1 from public.dusty_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

revoke all on public.dusty_conversations, public.dusty_messages from anon;
grant select, insert, update, delete on public.dusty_conversations, public.dusty_messages to authenticated;
