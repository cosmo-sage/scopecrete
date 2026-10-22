-- 119 — Sample data for a new company (applied 2026-10-22 on Coy's "Apply 119"; Gulfline seeded the same day).
--
-- Coy: "can we seed a new org with a little sample data in Gulfline Pavings company dashboard
-- along with some kind of Tour … so he's not confused when he first logs in?"
--
-- sc_seed_sample_data(org) puts in, for that org only:
--   · a sample customer, "Dana Kessler (sample)" (residential), with one contact, a phone in the
--     555-01xx range (never a real number), filed customer by "Dusty" (auto, reason "Sample data");
--   · a sample GC, "Bayou Medical Plaza (sample)" (commercial), with its estimator;
--   · a sample vendor, "Sample Ready Mix Co.";
--   · seven Price book items in three groups (concrete, labor, equipment), priced, "Sample" in the
--     description, the ready mix on the sample vendor;
--   · "Kessler Driveway Replacement (sample)": Estimating, a 24 × 40 ft driveway section at 4" and
--     3000 psi, its open budget (15% O.H., 25% margin, tax off) with five lines from those items,
--     2 days, an open next step and a note;
--   · "Bayou Medical Plaza Parking Lot (sample)": a bid invite due in a week, two sections from
--     the bid (1,800 SF of 6" paving; 120 LF of curb), no budget yet — something to price;
--   · a site visit appointment on the driveway job, three days out.
-- Every row it makes is listed in sample_records, so it is told apart from the company's own and
-- taken out together.
--
-- sc_remove_sample_data(org) takes it out without deleting anything (DECISIONS §2: never wiped):
-- the jobs, customers and contacts archived with reason "sample data" (out of every list, Restore
-- brings one back), the items retired, the appointment canceled, the next step dismissed, and the
-- records stamped removed_at. A company's own rows are never touched — only the ids listed.
--
-- Who may run them: an owner of that org, a platform admin (084), or no signed-in user at all
-- (the SQL editor / this migration's connector, to seed Gulfline on Coy's word). Execute for
-- authenticated only. sc_seed_sample_data refuses an org that already has sample data in.
--
-- Additive: one new table (RLS by get_user_org_ids(), members read, nobody writes but the
-- functions), two SECURITY DEFINER functions. No change to any existing table, function or grant.
-- Inserts go through the existing triggers as any other insert does (job_contacts follow, the job
-- name prefix is set here so the titles stay as written).

create table if not exists public.sample_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  kind text not null check (kind in ('contact', 'customer', 'job', 'section', 'estimate', 'line', 'cost_group', 'cost_item', 'task', 'note', 'appointment')),
  row_id uuid not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (org_id, kind, row_id)
);
create index if not exists sample_records_org on public.sample_records (org_id) where removed_at is null;

alter table public.sample_records enable row level security;
create policy sample_records_member_read on public.sample_records
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
revoke all on public.sample_records from anon, authenticated;
grant select on public.sample_records to authenticated;

create or replace function public.sc_sample_allowed(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or p_org = any (public.get_user_owner_org_ids())
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;
revoke all on function public.sc_sample_allowed(uuid) from public, anon, authenticated;

create or replace function public.sc_seed_sample_data(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid; v_dana uuid; v_gc uuid; v_est uuid; v_vendor uuid;
  g_conc uuid; g_lab uuid; g_eq uuid;
  i_mix uuid; i_base uuid; i_ff uuid; i_tear uuid; i_skid uuid; i_mob uuid; i_curb uuid;
  j_drive uuid; j_lot uuid; s_drive uuid; s_pave uuid; s_curb uuid; e_drive uuid;
  v_id uuid; v_note text := 'Sample — taken out with Remove sample data in Settings → Account.';
begin
  if p_org is null or not exists (select 1 from orgs where id = p_org) then raise exception 'org not found'; end if;
  if not public.sc_sample_allowed(p_org) then raise exception 'only an owner can add sample data'; end if;
  if exists (select 1 from sample_records where org_id = p_org and removed_at is null) then
    raise exception 'this company already has sample data in';
  end if;

  -- The vendor.
  insert into contacts (org_id, name, company_name, phone, contact_type, classification_source, auto_classified_at, auto_classified_reason, name_source, trades, notes)
  values (p_org, 'Sample Ready Mix Co.', 'Sample Ready Mix Co.', '+12255550190', 'vendor', 'machine', now(), 'Sample data', 'import', array['Ready-mix'], v_note)
  returning id into v_vendor;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'contact', v_vendor);

  -- The homeowner.
  insert into customers (org_id, name, kind, relation, relation_source, customer_type, lead_source, status, address_line1, city, state, zip, address_formatted, address_source, notes)
  values (p_org, 'Dana Kessler (sample)', 'person', 'customer', 'default', 'residential', 'website', 'active',
          '1200 Sample Oak Dr', 'Baton Rouge', 'LA', '70810', '1200 Sample Oak Dr, Baton Rouge, LA 70810', 'coy', v_note)
  returning id into v_cust;
  insert into contacts (org_id, name, first_name, last_name, phone, email, contact_type, classification_source, auto_classified_at, auto_classified_reason, name_source,
                        customer_id, is_primary, address, city, state, zip, address_source, job_type_hint, status_summary, notes)
  values (p_org, 'Dana Kessler (sample)', 'Dana', 'Kessler', '+12255550142', 'dana.kessler@example.com', 'customer', 'machine', now(), 'Sample data', 'import',
          v_cust, true, '1200 Sample Oak Dr', 'Baton Rouge', 'LA', '70810', 'coy', 'residential',
          'Wants her cracked driveway torn out and poured back; waiting on a price.', v_note)
  returning id into v_dana;
  update customers set primary_contact_id = v_dana where id = v_cust;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'customer', v_cust), (p_org, 'contact', v_dana);

  -- The GC and its estimator.
  insert into customers (org_id, name, kind, relation, relation_source, customer_type, lead_source, status, address_line1, city, state, zip, address_formatted, address_source, notes)
  values (p_org, 'Bayou Medical Plaza (sample)', 'company', 'customer', 'default', 'commercial', 'gc_invite', 'active',
          '4500 Sample Bluebonnet Blvd', 'Baton Rouge', 'LA', '70809', '4500 Sample Bluebonnet Blvd, Baton Rouge, LA 70809', 'coy', v_note)
  returning id into v_gc;
  insert into contacts (org_id, name, first_name, last_name, phone, email, company_name, contact_type, classification_source, auto_classified_at, auto_classified_reason, name_source,
                        customer_id, is_primary, role, job_type_hint, notes)
  values (p_org, 'Morgan Reyes (sample)', 'Morgan', 'Reyes', '+12255550177', 'morgan.reyes@example.com', 'Bayou Medical Plaza (sample)', 'customer', 'machine', now(), 'Sample data', 'import',
          v_gc, true, 'Estimator', 'commercial', v_note)
  returning id into v_est;
  update customers set primary_contact_id = v_est where id = v_gc;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'customer', v_gc), (p_org, 'contact', v_est);

  -- The Price book.
  insert into cost_groups (org_id, name, cost_type, sort_order) values (p_org, 'Concrete (sample)', 'material', 900) returning id into g_conc;
  insert into cost_groups (org_id, name, cost_type, sort_order) values (p_org, 'Labor (sample)', 'labor', 901) returning id into g_lab;
  insert into cost_groups (org_id, name, cost_type, sort_order) values (p_org, 'Equipment (sample)', 'equipment', 902) returning id into g_eq;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'cost_group', g_conc), (p_org, 'cost_group', g_lab), (p_org, 'cost_group', g_eq);

  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, vendor_contact_id, price_as_of, price_source, qty_rule, rule_params, sort_order)
  values (p_org, g_conc, '3000 psi ready mix', 'Sample price', 'material', 'CuYd', 165, true, v_vendor, current_date, 'typed', 'per_cy', '{"waste_pct": 5}', 1)
  returning id into i_mix;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_conc, 'Crushed limestone base, 4"', 'Sample price', 'material', 'SqFt', 0.45, true, current_date, 'typed', 'per_sqft', 2)
  returning id into i_base;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_lab, 'Form up and finish', 'Sample price', 'labor', 'SqFt', 1.45, false, current_date, 'typed', 'per_sqft', 3)
  returning id into i_ff;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_lab, 'Tear out and haul off', 'Sample price', 'labor', 'SqFt', 2.00, false, current_date, 'typed', 'per_sqft', 4)
  returning id into i_tear;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_lab, 'Curb and gutter, formed', 'Sample price', 'labor', 'LnFt', 18, false, current_date, 'typed', 'per_lf_perimeter', 5)
  returning id into i_curb;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_eq, 'Skid steer with breaker', 'Sample price', 'equipment', 'Days', 325, true, current_date, 'typed', 'per_day', 6)
  returning id into i_skid;
  insert into cost_items (org_id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, price_as_of, price_source, qty_rule, sort_order)
  values (p_org, g_eq, 'Mobilization', 'Sample price', 'other', 'Lump Sum', 350, false, current_date, 'typed', 'per_job', 7)
  returning id into i_mob;
  insert into sample_records (org_id, kind, row_id)
  values (p_org, 'cost_item', i_mix), (p_org, 'cost_item', i_base), (p_org, 'cost_item', i_ff), (p_org, 'cost_item', i_tear),
         (p_org, 'cost_item', i_curb), (p_org, 'cost_item', i_skid), (p_org, 'cost_item', i_mob);

  -- The driveway job, priced.
  insert into jobs (org_id, customer_id, contact_id, title, name_prefix, job_type, address, city, state, zip, status, origin, lead_source, description, duration_days, crew_size, confirmed_at, stage_changed_at)
  values (p_org, v_cust, v_dana, 'Kessler Driveway Replacement (sample)', 'Kessler', 'residential', '1200 Sample Oak Dr', 'Baton Rouge', 'LA', '70810',
          'scoping', 'manual', 'website', 'Tear out the cracked 24 × 40 driveway and pour it back 4" on a new base. A sample job to click around in.', 2, 4, now(), now())
  returning id into j_drive;
  insert into job_sections (org_id, job_id, name, work_type, length_ft, width_ft, depth_in, psi, sort_order, prep_notes, access_notes)
  values (p_org, j_drive, 'Driveway', 'driveway', 40, 24, 4, 3000, 0,
          E'Saw cut at the street and the garage\nBreak out and haul off the old slab\nGrade and compact 4" of limestone base\nForm, pour 3000 psi, broom finish\nCut control joints, strip forms, clean up',
          'Gate is 10 ft wide; trucks can back in from the street.')
  returning id into s_drive;
  insert into estimates (org_id, job_id, status, margin_pct, overhead_pct, tax_on)
  values (p_org, j_drive, 'draft', 25, 15, false)
  returning id into e_drive;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'job', j_drive), (p_org, 'section', s_drive), (p_org, 'estimate', e_drive);

  for v_id in
    insert into estimate_line_items (org_id, estimate_id, section_id, cost_item_id, cost_group_id, name, unit, unit_cost, cost_type, taxable, qty_rule, rule_params, qty_source, price_as_of, price_source, vendor_contact_id, sort_order)
    select p_org, e_drive, case when ci.qty_rule in ('per_day', 'per_job') then null else s_drive end, ci.id, ci.cost_group_id, ci.name, ci.unit, ci.unit_cost, ci.cost_type, ci.taxable,
           ci.qty_rule, ci.rule_params, 'rule', ci.price_as_of, ci.price_source, ci.vendor_contact_id, ci.sort_order
      from cost_items ci where ci.id in (i_tear, i_base, i_mix, i_ff, i_skid, i_mob)
    returning id
  loop
    insert into sample_records (org_id, kind, row_id) values (p_org, 'line', v_id);
  end loop;

  insert into contact_tasks (org_id, contact_id, job_id, title, due_on, source, status)
  values (p_org, v_dana, j_drive, 'Send Dana the driveway price', current_date + 1, 'coy', 'open') returning id into v_id;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'task', v_id);
  insert into contact_notes (org_id, contact_id, job_id, body)
  values (p_org, v_dana, j_drive, 'Sample note: she wants it done before her daughter''s graduation party in four weeks. Broom finish, no stamp.') returning id into v_id;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'note', v_id);
  insert into appointments (org_id, job_id, contact_id, customer_id, kind, title, starts_at, ends_at, address, note, source)
  values (p_org, j_drive, v_dana, v_cust, 'site_visit', 'Measure the Kessler driveway (sample)',
          ((current_date + 3)::timestamp + interval '9 hours') at time zone 'America/Chicago',
          ((current_date + 3)::timestamp + interval '10 hours') at time zone 'America/Chicago',
          '1200 Sample Oak Dr, Baton Rouge, LA 70810', 'Sample appointment.', 'coy') returning id into v_id;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'appointment', v_id);

  -- The commercial bid, waiting to be priced.
  insert into jobs (org_id, customer_id, contact_id, title, name_prefix, job_type, address, city, state, zip, status, origin, lead_source, description, bid_due_at, itb_received_at, confirmed_at, stage_changed_at)
  values (p_org, v_gc, v_est, 'Bayou Medical Plaza Parking Lot (sample)', 'Bayou Medical Plaza', 'commercial', '4500 Sample Bluebonnet Blvd', 'Baton Rouge', 'LA', '70809',
          'invited', 'manual', 'gc_invite', 'Remove and replace failed paving at the east entrance and 120 LF of curb. A sample bid with no prices yet: add items from the Price book or ask Dusty.',
          ((current_date + 7)::timestamp + interval '14 hours') at time zone 'America/Chicago', now(), now(), now())
  returning id into j_lot;
  insert into job_sections (org_id, job_id, name, work_type, sqft_override, depth_in, psi, sort_order, origin, source_ref)
  values (p_org, j_lot, 'Remove and replace 6" paving', 'slab', 1800, 6, 4000, 0, 'bid', 'Sample bid · item 3 · 200 SY remove and replace 6" concrete pavement')
  returning id into s_pave;
  insert into job_sections (org_id, job_id, name, work_type, count_qty, count_unit, width_ft, sort_order, origin, source_ref)
  values (p_org, j_lot, 'Curb and gutter', 'curb', 120, 'LF', 24, 1, 'bid', 'Sample bid · item 5 · 120 LF 24" curb and gutter')
  returning id into s_curb;
  insert into sample_records (org_id, kind, row_id) values (p_org, 'job', j_lot), (p_org, 'section', s_pave), (p_org, 'section', s_curb);

  return jsonb_build_object('ok', true, 'job_id', j_drive, 'bid_job_id', j_lot,
    'rows', (select count(*) from sample_records where org_id = p_org and removed_at is null));
end;
$$;

create or replace function public.sc_remove_sample_data(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.sc_sample_allowed(p_org) then raise exception 'only an owner can remove sample data'; end if;
  update jobs set archived_at = now(), archived_by = auth.uid(), archived_reason = 'sample data'
   where org_id = p_org and archived_at is null
     and id in (select row_id from sample_records where org_id = p_org and kind = 'job' and removed_at is null);
  update customers set archived_at = now(), archived_by = auth.uid(), archived_reason = 'sample data'
   where org_id = p_org and archived_at is null
     and id in (select row_id from sample_records where org_id = p_org and kind = 'customer' and removed_at is null);
  update contacts set archived_at = now(), archived_by = auth.uid(), archived_reason = 'sample data'
   where org_id = p_org and archived_at is null
     and id in (select row_id from sample_records where org_id = p_org and kind = 'contact' and removed_at is null);
  update cost_items set active = false
   where org_id = p_org and id in (select row_id from sample_records where org_id = p_org and kind = 'cost_item' and removed_at is null);
  update contact_tasks set status = 'dismissed'
   where org_id = p_org and status = 'open' and id in (select row_id from sample_records where org_id = p_org and kind = 'task' and removed_at is null);
  update appointments set status = 'canceled', canceled_reason = 'sample data'
   where org_id = p_org and status in ('scheduled', 'confirmed')
     and id in (select row_id from sample_records where org_id = p_org and kind = 'appointment' and removed_at is null);
  update sample_records set removed_at = now() where org_id = p_org and removed_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end;
$$;

revoke all on function public.sc_seed_sample_data(uuid) from public, anon;
revoke all on function public.sc_remove_sample_data(uuid) from public, anon;
grant execute on function public.sc_seed_sample_data(uuid) to authenticated;
grant execute on function public.sc_remove_sample_data(uuid) to authenticated;
