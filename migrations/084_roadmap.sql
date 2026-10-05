-- 084 — Feedback and the Roadmap (Coy, 2026-10-05: "I need to have a place
-- for internal users and other orgs to give feedback on the app and we need a
-- pipeline page somewhere in the app where people can see … what features are
-- recommended and then people can vote on those recommended features and
-- comment on them and see what's being worked on similar to how JobTread does
-- it I like their Roadmap page").
--
-- PLATFORM data, not an org's: every org sees the same roadmap. So these
-- tables are NOT under get_user_org_ids(). They have RLS on and NO policies and
-- no grants — nobody reads or writes them directly. Everything goes through
-- the SECURITY DEFINER functions below, each checking who is calling:
--
-- * Anyone signed in who belongs to an org (estimators included) may send
--   feedback (sc_roadmap_submit). It lands as status 'new': seen ONLY by its
--   writer and the platform admins. Feedback can name an org's customers or
--   jobs, so nothing anyone writes is shown to another org until Coy publishes
--   it (and he can reword it first).
-- * Published items (considering · planned · in_progress · released) are on
--   everyone's Roadmap, with vote counts and comments. Votes and comments only
--   on published items. 'declined' is hidden again, like 'new'.
-- * Only a platform admin (platform_admins: Coy's two accounts, seeded by
--   email) sets status, rewords an item, or removes any comment. A writer may
--   remove their own comment.
-- * A comment shows its writer's name and their org's name, read at write time.
--
-- Additive only: four new tables, ten functions. Execute for authenticated
-- only; anon nothing. Undo: remove the ten functions and the four tables.

set lock_timeout = '8s';

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 4000),
  kind text not null default 'idea' check (kind in ('idea', 'bug', 'other')),
  status text not null default 'new'
    check (status in ('new', 'considering', 'planned', 'in_progress', 'released', 'declined')),
  -- what the writer sent, kept when Coy rewords the published title / body
  original_title text,
  original_body text,
  page text check (char_length(page) <= 200),        -- the page they were on when they wrote it
  created_by uuid references auth.users(id) on delete set null,
  created_org_id uuid references public.orgs(id) on delete set null,
  author_name text,
  org_name text,
  admin_note text check (char_length(admin_note) <= 1000),  -- shown on the item ("Coming in the next update")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists roadmap_items_status_idx on public.roadmap_items (status, status_at desc);

create table if not exists public.roadmap_votes (
  item_id uuid not null references public.roadmap_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists public.roadmap_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.roadmap_items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  org_id uuid references public.orgs(id) on delete set null,
  author_name text,
  org_name text,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists roadmap_comments_item_idx on public.roadmap_comments (item_id, created_at);

alter table public.platform_admins enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.roadmap_votes enable row level security;
alter table public.roadmap_comments enable row level security;
revoke all on public.platform_admins, public.roadmap_items, public.roadmap_votes, public.roadmap_comments from public, anon, authenticated;

insert into public.platform_admins (user_id)
  select id from auth.users where lower(email) in ('admin@saccobuilt.com', 'coysacco@gmail.com')
  on conflict do nothing;

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.sc_is_platform_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- The writer's name and org, read once when they write (their own membership only).
create or replace function public.sc_roadmap_who(p_org uuid)
returns table (org_id uuid, author_name text, org_name text)
language sql stable security definer set search_path to 'public' as $$
  select m.org_id,
         coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
         o.name
    from org_members m
    join orgs o on o.id = m.org_id
    join auth.users u on u.id = m.user_id
   where m.user_id = auth.uid() and (p_org is null or m.org_id = p_org)
   order by (m.org_id = p_org) desc nulls last, o.created_at
   limit 1;
$$;

create or replace function public.sc_roadmap_public(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('considering', 'planned', 'in_progress', 'released');
$$;

-- ── The list ───────────────────────────────────────────────────────────────
-- Published items for everyone; plus your own 'new' / 'declined' ones; plus all of them for an admin.
create or replace function public.sc_roadmap_list()
returns table (id uuid, title text, body text, kind text, status text, admin_note text,
               author_name text, org_name text, mine boolean,
               votes int, voted boolean, comments int,
               created_at timestamptz, status_at timestamptz, published_at timestamptz,
               page text, original_title text, original_body text)
language sql stable security definer set search_path to 'public' as $$
  with me as (select auth.uid() as uid, public.sc_is_platform_admin() as admin)
  select i.id, i.title, i.body, i.kind, i.status, i.admin_note,
         -- another org's writer is shown only once published
         case when me.admin or i.created_by = me.uid or public.sc_roadmap_public(i.status) then i.author_name end,
         case when me.admin or i.created_by = me.uid or public.sc_roadmap_public(i.status) then i.org_name end,
         i.created_by = me.uid,
         (select count(*)::int from roadmap_votes v where v.item_id = i.id),
         exists (select 1 from roadmap_votes v where v.item_id = i.id and v.user_id = me.uid),
         (select count(*)::int from roadmap_comments c where c.item_id = i.id and c.deleted_at is null),
         i.created_at, i.status_at, i.published_at,
         case when me.admin or i.created_by = me.uid then i.page end,
         case when me.admin then i.original_title end,
         case when me.admin then i.original_body end
    from roadmap_items i, me
   where me.uid is not null
     and cardinality(public.sc_member_org_ids()) > 0
     and (public.sc_roadmap_public(i.status) or i.created_by = me.uid or me.admin)
   order by i.status_at desc;
$$;

create or replace function public.sc_roadmap_comments(p_item uuid)
returns table (id uuid, author_name text, org_name text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.author_name, c.org_name, c.body, c.created_at, c.user_id = auth.uid()
    from roadmap_comments c join roadmap_items i on i.id = c.item_id
   where c.item_id = p_item and c.deleted_at is null
     and auth.uid() is not null and cardinality(public.sc_member_org_ids()) > 0
     and (public.sc_roadmap_public(i.status) or i.created_by = auth.uid() or public.sc_is_platform_admin())
   order by c.created_at;
$$;

-- ── Writing ────────────────────────────────────────────────────────────────
create or replace function public.sc_roadmap_submit(p_org uuid, p_title text, p_body text, p_kind text, p_page text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare w record; v_id uuid;
begin
  select * into w from public.sc_roadmap_who(p_org);
  if w.org_id is null then raise exception 'not a member of any org'; end if;
  -- ten a day is plenty for a person; stops a stuck button from flooding the inbox
  if (select count(*) from roadmap_items where created_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'that''s ten today — thanks! Send more tomorrow';
  end if;
  insert into roadmap_items (title, body, kind, page, created_by, created_org_id, author_name, org_name)
  values (trim(p_title), coalesce(trim(p_body), ''), coalesce(nullif(p_kind, ''), 'idea'), nullif(trim(p_page), ''),
          auth.uid(), w.org_id, w.author_name, w.org_name)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.sc_roadmap_vote(p_item uuid, p_on boolean)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_status text; w record;
begin
  select status into v_status from roadmap_items where id = p_item;
  if v_status is null or not public.sc_roadmap_public(v_status) or v_status = 'released' then
    raise exception 'item not open for votes';
  end if;
  select * into w from public.sc_roadmap_who(null);
  if w.org_id is null then raise exception 'not a member of any org'; end if;
  if p_on then
    insert into roadmap_votes (item_id, user_id, org_id) values (p_item, auth.uid(), w.org_id) on conflict do nothing;
  else
    delete from roadmap_votes where item_id = p_item and user_id = auth.uid();
  end if;
  return (select count(*)::int from roadmap_votes where item_id = p_item);
end $$;

create or replace function public.sc_roadmap_comment(p_item uuid, p_org uuid, p_body text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_status text; v_by uuid; w record; v_id uuid;
begin
  select status, created_by into v_status, v_by from roadmap_items where id = p_item;
  if v_status is null or not (public.sc_roadmap_public(v_status) or v_by = auth.uid() or public.sc_is_platform_admin()) then
    raise exception 'item not found';
  end if;
  select * into w from public.sc_roadmap_who(p_org);
  if w.org_id is null then raise exception 'not a member of any org'; end if;
  insert into roadmap_comments (item_id, user_id, org_id, author_name, org_name, body)
  values (p_item, auth.uid(), w.org_id, w.author_name, w.org_name, trim(p_body))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.sc_roadmap_uncomment(p_comment uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update roadmap_comments set deleted_at = now()
   where id = p_comment and deleted_at is null
     and (user_id = auth.uid() or public.sc_is_platform_admin());
  if not found then raise exception 'comment not found'; end if;
end $$;

-- Coy only: status, rewording, a note. A blank title / body leaves it as is.
create or replace function public.sc_roadmap_admin(p_item uuid, p_status text, p_title text, p_body text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r roadmap_items;
begin
  if not public.sc_is_platform_admin() then raise exception 'only the platform admin can change the roadmap'; end if;
  select * into r from roadmap_items where id = p_item;
  if r.id is null then raise exception 'item not found'; end if;
  update roadmap_items set
    status = coalesce(nullif(p_status, ''), status),
    status_at = case when coalesce(nullif(p_status, ''), status) <> status then now() else status_at end,
    published_at = case when published_at is null and public.sc_roadmap_public(coalesce(nullif(p_status, ''), status)) then now() else published_at end,
    original_title = case when nullif(trim(p_title), '') is not null and trim(p_title) <> title and original_title is null then title else original_title end,
    original_body = case when p_body is not null and trim(p_body) <> body and original_body is null then body else original_body end,
    title = coalesce(nullif(trim(p_title), ''), title),
    body = coalesce(trim(p_body), body),
    admin_note = case when p_note is null then admin_note else nullif(trim(p_note), '') end,
    updated_at = now()
   where id = p_item;
end $$;

-- Coy only: a roadmap item of his own, straight onto the board.
create or replace function public.sc_roadmap_add(p_title text, p_body text, p_status text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare w record; v_id uuid;
begin
  if not public.sc_is_platform_admin() then raise exception 'only the platform admin can add to the roadmap'; end if;
  select * into w from public.sc_roadmap_who(null);
  insert into roadmap_items (title, body, kind, status, created_by, created_org_id, author_name, org_name, published_at)
  values (trim(p_title), coalesce(trim(p_body), ''), 'idea', coalesce(nullif(p_status, ''), 'considering'), auth.uid(), w.org_id,
          w.author_name, w.org_name, case when public.sc_roadmap_public(coalesce(nullif(p_status, ''), 'considering')) then now() end)
  returning id into v_id;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sc_is_platform_admin()', 'sc_roadmap_who(uuid)', 'sc_roadmap_list()', 'sc_roadmap_comments(uuid)',
    'sc_roadmap_submit(uuid,text,text,text,text)', 'sc_roadmap_vote(uuid,boolean)', 'sc_roadmap_comment(uuid,uuid,text)',
    'sc_roadmap_uncomment(uuid)', 'sc_roadmap_admin(uuid,text,text,text,text)', 'sc_roadmap_add(text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- the writer lookup is internal
revoke execute on function public.sc_roadmap_who(uuid) from authenticated;
