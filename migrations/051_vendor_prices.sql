-- 051 — One item, many vendors (Coy, 2026-09-29): "naturally I would have
-- multiple vendors to choose from for concrete ready mix … still have that in
-- a unified cost book … I can select the default vendor in the cost book and
-- the vendor page. That's the price that pulls into the budget."
--
--   * cost_item_sources — one vendor's price for one item (unique per item ×
--     vendor): unit cost, their item #, when and how the price was confirmed,
--     the receipt it came from, the tax rate printed on their invoice.
--   * cost_items.default_source_id — the vendor whose price goes into budgets.
--     While it is set, a trigger keeps the item's price fields (unit_cost,
--     vendor, item #, price date / source / file) in step with that source, so
--     the budget copy, the Price book grid and the history keep working and
--     there is one writer per value. Choosing another default copies that
--     vendor's price onto the item.
--   * price history per vendor: cost_item_prices.source_id; a trigger logs
--     every price a source has had. The item's own log skips the in-step copy
--     so a vendor's price is logged once.
--   * contacts.service_area — where a vendor delivers ("Baton Rouge / north
--     Ascension"); distance to the job comes later with a maps key.
--   * estimate_line_items.source_id — which vendor's price a line carries.
--
-- Additive. No data moves: no card had a vendor on 2026-09-29.

create table if not exists public.cost_item_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  cost_item_id uuid not null references public.cost_items(id) on delete cascade,
  vendor_contact_id uuid not null references public.contacts(id) on delete cascade,
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  vendor_sku text check (vendor_sku is null or length(vendor_sku) <= 60),
  unit text check (unit is null or length(unit) <= 20),
  price_as_of date,
  price_source text check (price_source is null or price_source in ('quote', 'receipt', 'invoice', 'typed', 'import')),
  price_file_id uuid references public.job_files(id) on delete set null,
  price_import_id uuid references public.cost_imports(id) on delete set null,
  import_id uuid references public.cost_imports(id) on delete set null,
  tax_pct_seen numeric check (tax_pct_seen is null or (tax_pct_seen >= 0 and tax_pct_seen < 50)),
  note text check (note is null or length(note) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cost_item_id, vendor_contact_id)
);
create index if not exists cost_item_sources_vendor_idx on public.cost_item_sources (org_id, vendor_contact_id);
alter table public.cost_item_sources enable row level security;
drop policy if exists cost_item_sources_member on public.cost_item_sources;
create policy cost_item_sources_member on public.cost_item_sources
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_item_sources from anon;
grant select, insert, update, delete on public.cost_item_sources to authenticated;

alter table public.cost_items
  add column if not exists default_source_id uuid references public.cost_item_sources(id) on delete set null;
alter table public.cost_item_prices
  add column if not exists source_id uuid references public.cost_item_sources(id) on delete set null;
alter table public.contacts
  add column if not exists service_area text check (service_area is null or length(service_area) <= 120);
alter table public.estimate_line_items
  add column if not exists source_id uuid references public.cost_item_sources(id) on delete set null;

-- ---------------------------------------------------------------- the item follows its default vendor

-- Choosing a default copies that vendor's price onto the item; the source must be this item's.
create or replace function public.sc_cost_item_default_source() returns trigger
  language plpgsql set search_path = public as $$
declare s public.cost_item_sources;
begin
  if new.default_source_id is not null and new.default_source_id is distinct from old.default_source_id then
    select * into s from public.cost_item_sources where id = new.default_source_id;
    if s.id is null or s.cost_item_id <> new.id then
      raise exception 'that vendor price belongs to another item';
    end if;
    new.unit_cost := s.unit_cost;
    new.vendor_contact_id := s.vendor_contact_id;
    new.vendor_sku := coalesce(s.vendor_sku, new.vendor_sku);
    new.price_as_of := s.price_as_of;
    new.price_source := s.price_source;
    new.price_file_id := s.price_file_id;
    new.price_import_id := null;
  end if;
  return new;
end $$;
drop trigger if exists cost_items_default_source on public.cost_items;
create trigger cost_items_default_source before update of default_source_id on public.cost_items
  for each row execute function public.sc_cost_item_default_source();

-- A default vendor's new price is copied onto the item (flagged, so the item's
-- own history trigger does not log it a second time).
create or replace function public.sc_cost_item_source_sync() returns trigger
  language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.cost_items i where i.id = new.cost_item_id and i.default_source_id = new.id) then
    perform set_config('sc.source_sync', '1', true);
    update public.cost_items
       set unit_cost = new.unit_cost, vendor_contact_id = new.vendor_contact_id,
           vendor_sku = coalesce(new.vendor_sku, vendor_sku), price_as_of = new.price_as_of,
           price_source = new.price_source, price_file_id = new.price_file_id, price_import_id = null, updated_at = now()
     where id = new.cost_item_id;
    perform set_config('sc.source_sync', '', true);
  end if;
  return new;
end $$;
drop trigger if exists cost_item_sources_sync on public.cost_item_sources;
create trigger cost_item_sources_sync after insert or update on public.cost_item_sources
  for each row execute function public.sc_cost_item_source_sync();

-- Every price a vendor has had.
create or replace function public.sc_cost_item_source_log() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_cost is null then return new; end if;
  elsif new.unit_cost is not distinct from old.unit_cost then
    return new;
  end if;
  insert into public.cost_item_prices (org_id, cost_item_id, unit_cost, price_as_of, price_source, import_id, source_file_id, source_id)
  values (new.org_id, new.cost_item_id, new.unit_cost, new.price_as_of, new.price_source, new.price_import_id, new.price_file_id, new.id);
  return new;
end $$;
drop trigger if exists cost_item_sources_log on public.cost_item_sources;
create trigger cost_item_sources_log after insert or update of unit_cost on public.cost_item_sources
  for each row execute function public.sc_cost_item_source_log();

-- The item's own history: skip the in-step copy from a vendor (already logged
-- on the source); a default switched to another vendor is logged, with it.
create or replace function public.sc_cost_item_price_log() returns trigger
  language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('sc.source_sync', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.unit_cost is null then return new; end if;
  elsif new.unit_cost is not distinct from old.unit_cost then
    return new;
  end if;
  insert into public.cost_item_prices (org_id, cost_item_id, unit_cost, price_as_of, price_source, import_id, source_file_id, source_id)
  values (new.org_id, new.id, new.unit_cost, new.price_as_of, new.price_source, new.price_import_id, new.price_file_id, new.default_source_id);
  return new;
end $$;
