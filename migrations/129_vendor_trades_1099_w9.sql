-- 129 — vendor trades you edit, 1099 contractors, and W-9s (Coy, 2026-10-24, toolbar
-- notes on Luis's vendor page and Vendors):
--   "I need vendor groups or types; like buckets inside of buckets. Figure out the
--    hierarchy." · "I need a place to quickly and easily modify, edit, rearrange this
--    lists of groups and kinds … so that dusty can find the correct vendor easily."
--   "I should be able to toggle 1099 on/off so I know I need to send them a 1099."
--   "send a w9 and store access the w9 here … a new folder in the files pages called w9"
--
-- The hierarchy is Vendor (bucket) → Kind (org_contact_subtypes, already the org's own
-- rows) → Trade (this table). A vendor has one kind and any trades; a trade sits under
-- one kind (or none). Until now trades were a list in code (TRADES, src/lib/bids.ts)
-- and `contacts.trades` held the words; the words stay on the contact, this table is
-- the org's list, its order and which kind each sits under.
--
-- Additive except one line: the files category check is dropped and made again with
-- 'w9' added (nothing else changes in it). If the connector's gate refuses the drop,
-- run this file in the Supabase SQL Editor.

create table if not exists public.org_vendor_trades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  kind text check (kind is null or length(kind) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists org_vendor_trades_name on public.org_vendor_trades (org_id, lower(name));
create index if not exists org_vendor_trades_org on public.org_vendor_trades (org_id, sort_order);

alter table public.org_vendor_trades enable row level security;
revoke all on public.org_vendor_trades from anon;
grant select, insert, update, delete on public.org_vendor_trades to authenticated;
-- Supabase's default grants also give truncate (which skips RLS), references and trigger.
revoke truncate, references, trigger on public.org_vendor_trades from authenticated;
create policy org_vendor_trades_member on public.org_vendor_trades for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));

-- Seed each org with the trades the app offered, under the kind they belong to, then
-- any other trade already typed on one of its vendors (no kind — Coy places them).
insert into public.org_vendor_trades (org_id, name, kind, sort_order)
select o.id, t.name, t.kind, t.ord * 10
from public.orgs o
cross join (values
  ('Labor', 'subcontractor', 1), ('Flatwork', 'subcontractor', 2), ('Finishing', 'subcontractor', 3),
  ('Stamping', 'subcontractor', 4), ('Curb & gutter', 'subcontractor', 5), ('Foundations', 'subcontractor', 6),
  ('Pumping', 'subcontractor', 7), ('Excavation & grading', 'subcontractor', 8), ('Demolition', 'subcontractor', 9),
  ('Ready-mix', 'supplier', 10), ('Rebar & steel', 'supplier', 11), ('Lumber & forms', 'supplier', 12),
  ('Equipment rental', 'equipment', 13), ('Disposal', 'services', 14)
) as t(name, kind, ord)
on conflict do nothing;

insert into public.org_vendor_trades (org_id, name, kind, sort_order)
select c.org_id, min(btrim(t)), null, 1000
from public.contacts c, unnest(c.trades) as t
where c.trades is not null and length(btrim(t)) between 1 and 40
group by c.org_id, lower(btrim(t))
on conflict do nothing;

-- A vendor you send a 1099 to, and when you last asked them for a W-9.
alter table public.contacts add column if not exists is_1099 boolean not null default false;
alter table public.contacts add column if not exists w9_requested_at timestamptz;

-- A W-9 is its own kind of file (its own folder in Files).
alter table public.files drop constraint if exists job_files_category_check;
alter table public.files add constraint job_files_category_check check (
  category is null or category = any (array['photo','plan','spec','bid','vendor_quote','receipt','contract','w9','other'])
);
