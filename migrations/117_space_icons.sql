-- 117 — An icon per Work Space, drawn by Dusty (2026-10-21).
--
-- Coy: "I'm leaning away from the 4 different silhouette space shapes and want to look at
-- generating custom space icons/images for new and existing spaces in the rail." He picked
-- option 1 of the mockup: Dusty draws each Space a small flat SVG icon from what it is (the
-- trade, the work, the place).
--
-- One row per Space per org: `space_key` is the rail's own key — job:<jobs.id>,
-- customer:<customers.id>, vendor:<contacts.id>, col:<threads.id> — so the icon follows the
-- Space whoever's rail it is on (one company, one look). `svg` is the drawing as cleaned by
-- src/lib/dusty/drawing.ts (parseDrawing → drawingSvg) on the server; the rail parses it again
-- before drawing it with React elements, so nothing in it is ever put on the page as markup.
-- `source` 'dusty' = drawn by Dusty, 'shape' = Coy chose the old silhouette (svg null, never
-- redrawn on its own). A Space taken off the rail keeps its row; nothing references it.
--
-- Additive: one new table, RLS by get_user_org_ids(), members read and write their org's
-- rows, anon nothing. No change to any existing table, function or grant.
--
-- Rehearsed 2026-10-21 (rolled back) as Sacco's owner: two rows written and read; a row for another
-- org refused; a Dusty row with no svg refused; a signed-in stranger sees 0; anon refused.

create table if not exists public.space_icons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  space_key text not null check (space_key ~ '^(job|customer|vendor|col):[0-9a-fA-F-]{36}$'),
  source text not null default 'dusty' check (source in ('dusty', 'shape')),
  svg text check (svg is null or char_length(svg) <= 20000),
  about text check (about is null or char_length(about) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, space_key),
  check (source = 'shape' or svg is not null)
);

alter table public.space_icons enable row level security;

create policy space_icons_member on public.space_icons
  for all to authenticated
  using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

revoke all on public.space_icons from anon;
grant select, insert, update, delete on public.space_icons to authenticated;
