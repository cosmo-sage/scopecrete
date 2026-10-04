-- 059 — The Plan Room: manual takeoff (Coy, 2026-09-30: "scopecrete.ai will
-- be a tool for me to do takeoffs manually"; Claude Design, design/plan-room).
--
--   * plan_sheets — one row per page of a plan PDF on a job: its number,
--     title and discipline as read from the title block (a first reading,
--     Coy's to correct), the printed scale, and the scale actually in use —
--     feet per PDF point, set by Coy (from the title block, or measured on a
--     known dimension). No scale → no quantity (src/lib/takeoff.ts).
--   * takeoff_parameters — the groups (Slab on grade, Curb …): area | linear |
--     count, colour, optional depth for yards.
--   * takeoff_measurements — the shapes, in page points. Quantities are worked
--     out from geometry × the sheet's scale and never stored.
--   * job_files.in_plan_room — which of a job's files are plans.
--   * estimate_line_items.takeoff_parameter_id + qty_rule 'from_takeoff' — a
--     budget line whose quantity is a group's measured total, so re-measuring
--     moves it.
--
-- Additive. Member RLS by get_user_org_ids(); anon has nothing.

create table if not exists public.plan_sheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  file_id uuid not null references public.job_files(id) on delete cascade,
  page integer not null check (page >= 1),
  page_w real not null check (page_w > 0),
  page_h real not null check (page_h > 0),
  number text check (number is null or length(number) <= 20),
  title text check (title is null or length(title) <= 120),
  discipline text check (discipline is null or length(discipline) <= 12),
  -- What the sheet prints ("1/8\" = 1'-0\"", "NTS") and what that works out to.
  scale_text text check (scale_text is null or length(scale_text) <= 60),
  printed_ft_per_pt double precision check (printed_ft_per_pt is null or printed_ft_per_pt > 0),
  -- The scale in use: null until Coy sets it.
  scale_ft_per_pt double precision check (scale_ft_per_pt is null or scale_ft_per_pt > 0),
  scale_method text check (scale_method is null or scale_method in ('title_block', 'manual', 'none')),
  scale_set_at timestamptz,
  scale_set_by uuid references auth.users(id) on delete set null,
  -- Coy's own corrections to the reading are kept apart from it.
  number_source text not null default 'read' check (number_source in ('read', 'coy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, page)
);
create index if not exists plan_sheets_job_idx on public.plan_sheets (job_id, file_id, page);

create table if not exists public.takeoff_parameters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('area', 'linear', 'count')),
  color text not null default '#D97757' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  depth_in numeric check (depth_in is null or (depth_in > 0 and depth_in <= 120)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists takeoff_parameters_job_idx on public.takeoff_parameters (job_id, sort_order);

create table if not exists public.takeoff_measurements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parameter_id uuid not null references public.takeoff_parameters(id) on delete cascade,
  sheet_id uuid not null references public.plan_sheets(id) on delete cascade,
  name text check (name is null or length(name) <= 80),
  -- [[x, y], …] in PDF points on the page as shown; cutouts: [[[x, y], …], …].
  geometry jsonb not null check (jsonb_typeof(geometry) = 'array' and jsonb_array_length(geometry) between 1 and 2000),
  cutouts jsonb not null default '[]'::jsonb check (jsonb_typeof(cutouts) = 'array' and jsonb_array_length(cutouts) <= 100),
  method text not null default 'area' check (method in ('area', 'rect', 'linear', 'count')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists takeoff_measurements_param_idx on public.takeoff_measurements (parameter_id, sort_order);
create index if not exists takeoff_measurements_sheet_idx on public.takeoff_measurements (sheet_id);

-- A shape's group and sheet belong to the same job and org.
create or replace function public.sc_takeoff_measurement_same_job()
returns trigger language plpgsql set search_path = public as $$
declare pj uuid; po uuid; sj uuid; so uuid;
begin
  select job_id, org_id into pj, po from takeoff_parameters where id = new.parameter_id;
  select job_id, org_id into sj, so from plan_sheets where id = new.sheet_id;
  if pj is null or sj is null or pj <> sj or po <> new.org_id or so <> new.org_id then
    raise exception 'measurement must be on a sheet of the same job as its group';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists takeoff_measurements_same_job on public.takeoff_measurements;
create trigger takeoff_measurements_same_job before insert or update on public.takeoff_measurements
  for each row execute function public.sc_takeoff_measurement_same_job();

-- A sheet's file is on its job.
create or replace function public.sc_plan_sheet_same_job()
returns trigger language plpgsql set search_path = public as $$
declare fj uuid; fo uuid;
begin
  select job_id, org_id into fj, fo from job_files where id = new.file_id;
  if fj is null or fj <> new.job_id or fo <> new.org_id then
    raise exception 'sheet must come from a file on its job';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists plan_sheets_same_job on public.plan_sheets;
create trigger plan_sheets_same_job before insert or update on public.plan_sheets
  for each row execute function public.sc_plan_sheet_same_job();

-- RLS: org members only.
alter table public.plan_sheets enable row level security;
alter table public.takeoff_parameters enable row level security;
alter table public.takeoff_measurements enable row level security;
drop policy if exists plan_sheets_member on public.plan_sheets;
create policy plan_sheets_member on public.plan_sheets for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists takeoff_parameters_member on public.takeoff_parameters;
create policy takeoff_parameters_member on public.takeoff_parameters for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists takeoff_measurements_member on public.takeoff_measurements;
create policy takeoff_measurements_member on public.takeoff_measurements for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.plan_sheets, public.takeoff_parameters, public.takeoff_measurements from anon;
grant select, insert, update, delete on public.plan_sheets, public.takeoff_parameters, public.takeoff_measurements to authenticated;

-- Which of a job's files are plans.
alter table public.job_files add column if not exists in_plan_room boolean not null default false;

-- A budget line counted from a takeoff group.
alter table public.estimate_line_items
  add column if not exists takeoff_parameter_id uuid references public.takeoff_parameters(id) on delete set null;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.estimate_line_items'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%per_stick%'
  loop
    execute format('alter table public.estimate_line_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.estimate_line_items add constraint estimate_line_items_qty_rule_check check (qty_rule in
  ('per_cy', 'per_sqft', 'per_lf_perimeter', 'per_sheet', 'per_stick', 'per_day', 'per_job', 'manual', 'from_takeoff'));
