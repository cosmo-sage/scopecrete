-- 057 — How a job is priced, as Coy prices it (Vercel notes, 2026-09-30).
--
--   "All the markup and margin exists only per job in the budget … There can
--    be default margin settings applied across any new job budget."
--   "This is really considered Overhead (O.H.). 15% overhead can be applied
--    to every job … an editable setting in the price book page along with the
--    default margin setting."
--   "Sales tax should be calculated from the job location."
--   "There are no default crew days … There is only a minimum of $ per day
--    that people require to show up and work. And therefore there is a
--    minimum for a job."
--
-- price = cost × (1 + O.H.) ÷ (1 − margin)   (Coy's pick of three, 2026-09-30)
--
--   * org_money_settings — one row per org: default margin %, default O.H. %
--     (15 on Coy's word), the day minimum, and pay-yourself (moved here from
--     org_cost_settings, whose Gulfline COLUMN DEFAULTS made a first save
--     pull numbers nobody entered — this table has no such defaults).
--   * estimates.margin_pct / overhead_pct — the job's own, copied from the
--     defaults when a budget is made; estimate_line_items.margin_pct — one
--     line's override. Card and group markups are no longer read.
--   * tax_parishes — the org's rate for each parish it works in (Coy enters
--     them; nothing is loaded from an unverified source). jobs.tax_parish,
--     tax_rate_pct, tax_rate_source ('parish' | 'override').
--   * org_cost_settings (waste, short load, markups per type, sales tax,
--     off-the-top, crew-days, pay-yourself) is no longer read. Nothing is
--     dropped.
--
-- Additive: one table for settings, one for parish rates, nullable columns.

create table if not exists public.org_money_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  default_margin_pct numeric check (default_margin_pct is null or (default_margin_pct >= 0 and default_margin_pct < 100)),
  default_overhead_pct numeric check (default_overhead_pct is null or (default_overhead_pct >= 0 and default_overhead_pct <= 200)),
  day_minimum numeric check (day_minimum is null or day_minimum >= 0),
  comp_mode text check (comp_mode is null or comp_mode in ('fixed_draw', 'pct_profit')),
  comp_monthly_draw numeric check (comp_monthly_draw is null or comp_monthly_draw >= 0),
  comp_profit_pct numeric check (comp_profit_pct is null or (comp_profit_pct >= 0 and comp_profit_pct <= 100)),
  updated_at timestamptz not null default now()
);
alter table public.org_money_settings enable row level security;
revoke all on public.org_money_settings from anon;
grant select, insert, update on public.org_money_settings to authenticated;
drop policy if exists org_money_settings_member on public.org_money_settings;
create policy org_money_settings_member on public.org_money_settings for all to authenticated
  using (org_id = any (public.get_user_org_ids())) with check (org_id = any (public.get_user_org_ids()));

-- Coy: 15% O.H. on every job. Pay-yourself carries over what was recorded.
insert into public.org_money_settings (org_id, default_overhead_pct, comp_mode, comp_monthly_draw, comp_profit_pct)
select o.id, 15, s.comp_mode, s.comp_monthly_draw, s.comp_profit_pct
from public.orgs o left join public.org_cost_settings s on s.org_id = o.id
on conflict (org_id) do nothing;

create table if not exists public.tax_parishes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  state text not null default 'LA',
  parish text not null,
  rate_pct numeric not null check (rate_pct >= 0 and rate_pct < 30),
  note text,
  updated_at timestamptz not null default now(),
  unique (org_id, state, parish)
);
alter table public.tax_parishes enable row level security;
revoke all on public.tax_parishes from anon;
grant select, insert, update, delete on public.tax_parishes to authenticated;
drop policy if exists tax_parishes_member on public.tax_parishes;
create policy tax_parishes_member on public.tax_parishes for all to authenticated
  using (org_id = any (public.get_user_org_ids())) with check (org_id = any (public.get_user_org_ids()));

alter table public.jobs
  add column if not exists tax_parish text,
  add column if not exists tax_rate_pct numeric check (tax_rate_pct is null or (tax_rate_pct >= 0 and tax_rate_pct < 30)),
  add column if not exists tax_rate_source text check (tax_rate_source is null or tax_rate_source in ('parish', 'override'));

alter table public.estimates
  add column if not exists margin_pct numeric check (margin_pct is null or (margin_pct >= 0 and margin_pct < 100)),
  add column if not exists overhead_pct numeric check (overhead_pct is null or (overhead_pct >= 0 and overhead_pct <= 200));

alter table public.estimate_line_items
  add column if not exists margin_pct numeric check (margin_pct is null or (margin_pct >= 0 and margin_pct < 100));
