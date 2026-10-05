-- 052 — Undo for vendor prices, and "Same item as…" (Coy, 2026-09-29).
--
--   * cost_imports.undo_payload — what an import did to vendor prices (051):
--     each source it made or re-priced, the price before, and the item's
--     default vendor and price before, so Undo puts back exactly that.
--   * cost_item_merges — "3000 PSI ready mix" (Angelle's invoice) is the same
--     as "3000 psi" (the JobTread import): the vendor prices move onto one
--     item, the other is retired, its assembly rows re-pointed. undo_payload
--     records every moved id; Undo moves back those still where it left them.
--     Budget lines already made keep their own copy either way.
--   * Choosing a default vendor no longer writes a second history row: the
--     vendor's price is already in the history under that vendor (051's
--     cost_item_sources_log); switching whose price is used is not a new price.
--
--   * estimate_line_items.source_pinned — Coy chose this line's vendor himself
--     (the budget's vendor picker), so a later change of the item's default
--     vendor does not ask to update it; an unpinned line does.
--
-- Additive (two columns, one table) plus one function body. Member RLS on the
-- new table; anon revoked.

alter table public.cost_imports add column if not exists undo_payload jsonb;
alter table public.estimate_line_items add column if not exists source_pinned boolean not null default false;

create table if not exists public.cost_item_merges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  winner_id uuid not null references public.cost_items(id) on delete cascade,
  loser_id uuid not null references public.cost_items(id) on delete cascade,
  undo_payload jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  check (winner_id <> loser_id)
);
create index if not exists cost_item_merges_org_idx on public.cost_item_merges (org_id, created_at desc);
alter table public.cost_item_merges enable row level security;
drop policy if exists cost_item_merges_member on public.cost_item_merges;
create policy cost_item_merges_member on public.cost_item_merges
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_item_merges from anon;
grant select, insert, update on public.cost_item_merges to authenticated;

create or replace function public.sc_cost_item_price_log() returns trigger
  language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('sc.source_sync', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.unit_cost is null then return new; end if;
  elsif new.unit_cost is not distinct from old.unit_cost then
    return new;
  elsif new.default_source_id is not null and new.default_source_id is distinct from old.default_source_id then
    return new;  -- a vendor chosen as default: its price is logged under that vendor already
  end if;
  insert into public.cost_item_prices (org_id, cost_item_id, unit_cost, price_as_of, price_source, import_id, source_file_id, source_id)
  values (new.org_id, new.id, new.unit_cost, new.price_as_of, new.price_source, new.price_import_id, new.price_file_id, new.default_source_id);
  return new;
end $$;
