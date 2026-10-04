-- 048 — The job budget, with good / better / best (Coy, 2026-09-29: "a
-- spreadsheet style budget … each line item is multiplied by the unit and price
-- which creates the extended price and then Markup and margin are added. Tax
-- can be toggled on/off" — and "yes I want good/better/best options").
--
-- A job has ONE working estimate (status 'draft'); its lines are the budget.
-- Proposal versions (next step) are frozen copies of it.
--
--   * estimate_options — the tiers (Good / Better / Best, or Coy's words). A
--     line with option_id null is in every tier; a line with an option is in
--     that tier only. A tier's price = shared lines + its own.
--   * estimates gains tax_on (the budget's tax switch) and selected_option_id
--     (the tier the customer accepts).
--   * estimate_line_items gains what a card copies onto a line (so a later card
--     change never silently reprices a sent quote): org_id, option_id,
--     cost_item_id, description, qty_rule, rule_params, qty_source (rule = the
--     engine counts it from the scope; set = Coy typed it), vendor, and the
--     proposal's show switches.
--
-- quantity / unit_cost / total_cost were NOT NULL on an empty table: a
-- rule-counted line has no stored quantity (the engine computes it live) and a
-- blank unit cost must stay blank (§3: nothing assumed). They become nullable.
-- price_source learns the cost cards' words (quote, receipt, invoice, typed).
--
-- Additive, plus those relaxations on a table with 0 rows (approved in the plan).

create table if not exists public.estimate_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 40),
  description text check (description is null or length(description) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists estimate_options_est_idx on public.estimate_options (estimate_id, sort_order);
alter table public.estimate_options enable row level security;
drop policy if exists estimate_options_member on public.estimate_options;
create policy estimate_options_member on public.estimate_options
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.estimate_options from anon;
grant select, insert, update, delete on public.estimate_options to authenticated;

alter table public.estimates
  add column if not exists tax_on boolean not null default true,
  add column if not exists selected_option_id uuid references public.estimate_options(id) on delete set null;

create unique index if not exists estimates_one_working_per_job on public.estimates (job_id) where status = 'draft' and job_id is not null;

alter table public.estimate_line_items
  add column if not exists org_id uuid references public.orgs(id) on delete cascade,
  add column if not exists option_id uuid references public.estimate_options(id) on delete cascade,
  add column if not exists cost_item_id uuid references public.cost_items(id) on delete set null,
  add column if not exists description text check (description is null or length(description) <= 500),
  add column if not exists qty_rule text not null default 'manual' check (qty_rule in
    ('per_cy', 'per_sqft', 'per_lf_perimeter', 'per_sheet', 'per_stick', 'per_day', 'per_job', 'manual')),
  add column if not exists rule_params jsonb not null default '{}'::jsonb,
  add column if not exists qty_source text not null default 'rule' check (qty_source in ('rule', 'set')),
  add column if not exists vendor_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists show_on_doc boolean not null default true,
  add column if not exists show_qty boolean not null default false,
  add column if not exists show_price boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.estimate_line_items
  alter column quantity drop not null,
  alter column unit_cost drop not null,
  alter column total_cost drop not null;

alter table public.estimate_line_items drop constraint if exists estimate_line_items_price_source_check;
alter table public.estimate_line_items add constraint estimate_line_items_price_source_check
  check (price_source is null or price_source in ('org_settings', 'market', 'manual', 'vendor_quote', 'quote', 'receipt', 'invoice', 'typed'));

create index if not exists estimate_line_items_est_idx on public.estimate_line_items (estimate_id, sort_order);

-- Direct org RLS alongside the estimate-based policies: a line must carry its
-- estimate's org.
drop policy if exists estimate_line_items_org_member on public.estimate_line_items;
create policy estimate_line_items_org_member on public.estimate_line_items
  as restrictive for all to authenticated
  using (org_id is null or org_id = any (get_user_org_ids()))
  with check (org_id = any (get_user_org_ids()));
