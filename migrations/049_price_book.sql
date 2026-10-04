-- 049 — The Price book (Coy, 2026-09-29: a dedicated page for the cost
-- catalog, "Price book"; price history; import Excel/CSV from JobTread and
-- other CRMs; import a vendor quote Dusty reads).
--
--   * cost_item_prices — every price a card has had. Written by a trigger on
--     cost_items whenever unit_cost is set or changes, so no code path can
--     change a price without leaving history. It copies where the price came
--     from off the card: price_as_of, price_source, and — new on cost_items —
--     price_import_id (the import that set it) and price_file_id (the vendor
--     quote it was read from). Routes that set a price by hand clear both.
--   * cost_imports — one row per import (spreadsheet or vendor quote), with
--     its counts, so an import can be undone: cost_items.import_id marks the
--     cards it created.
--   * price_source learns 'import'.
--
-- Additive. The trigger runs as the caller (not SECURITY DEFINER), so RLS on
-- cost_item_prices applies to what it writes.

create table if not exists public.cost_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('csv', 'xlsx', 'vendor_quote')),
  file_name text check (file_name is null or length(file_name) <= 200),
  source text check (source is null or length(source) <= 60),
  vendor_contact_id uuid references public.contacts(id) on delete set null,
  source_file_id uuid references public.job_files(id) on delete set null,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists cost_imports_org_idx on public.cost_imports (org_id, created_at desc);
alter table public.cost_imports enable row level security;
drop policy if exists cost_imports_member on public.cost_imports;
create policy cost_imports_member on public.cost_imports
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_imports from anon;
grant select, insert, update on public.cost_imports to authenticated;

alter table public.cost_items
  add column if not exists import_id uuid references public.cost_imports(id) on delete set null,
  add column if not exists price_import_id uuid references public.cost_imports(id) on delete set null,
  add column if not exists price_file_id uuid references public.job_files(id) on delete set null;

alter table public.cost_items drop constraint if exists cost_items_price_source_check;
alter table public.cost_items add constraint cost_items_price_source_check
  check (price_source is null or price_source in ('quote', 'receipt', 'invoice', 'typed', 'import'));

create table if not exists public.cost_item_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  cost_item_id uuid not null references public.cost_items(id) on delete cascade,
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  price_as_of date,
  price_source text,
  import_id uuid references public.cost_imports(id) on delete set null,
  source_file_id uuid references public.job_files(id) on delete set null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid()
);
create index if not exists cost_item_prices_item_idx on public.cost_item_prices (cost_item_id, recorded_at desc);
create index if not exists cost_item_prices_import_idx on public.cost_item_prices (import_id) where import_id is not null;
alter table public.cost_item_prices enable row level security;
drop policy if exists cost_item_prices_member on public.cost_item_prices;
create policy cost_item_prices_member on public.cost_item_prices
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_item_prices from anon;
grant select, insert on public.cost_item_prices to authenticated;

create or replace function public.sc_cost_item_price_log() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_cost is null then return new; end if;
  elsif new.unit_cost is not distinct from old.unit_cost then
    return new;
  end if;
  insert into public.cost_item_prices (org_id, cost_item_id, unit_cost, price_as_of, price_source, import_id, source_file_id)
  values (new.org_id, new.id, new.unit_cost, new.price_as_of, new.price_source, new.price_import_id, new.price_file_id);
  return new;
end $$;

drop trigger if exists cost_items_price_log on public.cost_items;
create trigger cost_items_price_log after insert or update of unit_cost on public.cost_items
  for each row execute function public.sc_cost_item_price_log();

-- The first history row: each card's price as it stands today.
insert into public.cost_item_prices (org_id, cost_item_id, unit_cost, price_as_of, price_source, recorded_at, recorded_by)
select ci.org_id, ci.id, ci.unit_cost, ci.price_as_of, ci.price_source, ci.updated_at, null
from public.cost_items ci
where ci.unit_cost is not null
  and not exists (select 1 from public.cost_item_prices p where p.cost_item_id = ci.id);
