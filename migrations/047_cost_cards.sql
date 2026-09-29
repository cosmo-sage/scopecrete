-- 047 — Cost cards: Coy's catalog of what he buys and charges for, each tied
-- to the vendor it comes from (Coy, 2026-09-29: "The costs are associated with
-- the vendor also… cost cards that are loadable when working on a job scope").
--
--   * cost_items — one card: its group, type, unit, unit cost, whether it is
--     taxed, an optional markup, the vendor (a contact) and their SKU, when and
--     how the price was confirmed, and the rule that turns a scope into a
--     quantity (per yard, per sq ft, per foot of perimeter, per sheet, per
--     stick, per day, per job, or typed by hand). Nothing is assumed: a card
--     with no unit cost blocks the price that uses it, by name.
--   * cost_groups already existed (0 rows) and is reused as the card groups.
--
-- The engine keeps pricing from Cost settings until the job budget lands (the
-- next step); then the rate fields and reinforcement types fold into cards.
--
-- Additive: one table with member policies. RESTRICTIVE: anon's grants are
-- revoked on the money tables it never needed (RLS already refused it).

create table if not exists public.cost_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  cost_group_id uuid references public.cost_groups(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  cost_type text not null check (cost_type in ('material', 'labor', 'equipment', 'subcontract', 'other')),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  taxable boolean not null default false,
  markup_pct numeric check (markup_pct is null or (markup_pct >= 0 and markup_pct <= 500)),
  vendor_contact_id uuid references public.contacts(id) on delete set null,
  vendor_sku text check (vendor_sku is null or length(vendor_sku) <= 60),
  price_as_of date,
  price_source text check (price_source is null or price_source in ('quote', 'receipt', 'invoice', 'typed')),
  qty_rule text not null default 'manual' check (qty_rule in
    ('per_cy', 'per_sqft', 'per_lf_perimeter', 'per_sheet', 'per_stick', 'per_day', 'per_job', 'manual')),
  rule_params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cost_items_org_idx on public.cost_items (org_id, active, cost_group_id, sort_order);
create index if not exists cost_items_vendor_idx on public.cost_items (org_id, vendor_contact_id) where vendor_contact_id is not null;

alter table public.cost_items enable row level security;
drop policy if exists cost_items_member on public.cost_items;
create policy cost_items_member on public.cost_items
  for all to authenticated
  using (org_id = any (get_user_org_ids()))
  with check (org_id = any (get_user_org_ids()));

revoke all on public.cost_items from anon;
grant select, insert, update, delete on public.cost_items to authenticated;

revoke all on public.cost_groups, public.estimates, public.estimate_line_items,
  public.documents, public.document_events, public.invoices, public.payments from anon;
