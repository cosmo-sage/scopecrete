-- 053 — Preferences that follow Coy across devices (2026-09-30).
--
-- "Should your menu order, dashboard tiles and Price book columns follow you
-- across devices?" — Coy: your account. One row per person per org, a JSON
-- object of named settings (menus, home tiles, price-book columns). Private to
-- the person: RLS is org member AND user_id = auth.uid(), like Dusty's saved
-- chats (migration 043). Anon has nothing.
--
-- Additive: one new table.

create table if not exists public.user_preferences (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 65536),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_own on public.user_preferences;
create policy user_preferences_own on public.user_preferences
  for all to authenticated
  using (org_id = any (get_user_org_ids()) and user_id = auth.uid())
  with check (org_id = any (get_user_org_ids()) and user_id = auth.uid());
revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;
