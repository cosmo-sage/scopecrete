-- 069 — Takeoff shapes become budget sections (Coy, 2026-10-03: "Pushing to
-- budget should push the area measured under the group. And I should be able
-- to select the individual measurements to push … organize the sections in the
-- budget page by groups just like in PlanRoom … attach photos to the takeoff
-- sections … Section should follow any edit in the plan room … if I delete the
-- measurement, it should delete it in the budget without deleting the whole
-- section … I should be able to pull measurement into the budget from the
-- budget page also.").
--
--   * takeoff_measurements.section_id — the budget section a shape is counted
--     in. A section takes one or more shapes; its size is their sum, written by
--     the app after every takeoff change (src/lib/takeoff-sections.ts). Deleting
--     a shape leaves the section and its cost items; deleting a section frees
--     its shapes.
--   * job_sections.takeoff_sync — the section follows its shapes. A size typed
--     on the section by hand turns it off; ↺ turns it back on.
--   * job_files.takeoff_measurement_id — a photo of that shape's area; it shows
--     on the section the shape is in, and on the proposal.
--
-- Additive: three nullable / defaulted columns, two indexes, a same-job check
-- extended. RLS unchanged (members of the org, as before).

alter table public.takeoff_measurements
  add column if not exists section_id uuid references public.job_sections(id) on delete set null;
create index if not exists takeoff_measurements_section_idx on public.takeoff_measurements (section_id) where section_id is not null;

alter table public.job_sections
  add column if not exists takeoff_sync boolean not null default true;

alter table public.job_files
  add column if not exists takeoff_measurement_id uuid references public.takeoff_measurements(id) on delete set null;
create index if not exists job_files_takeoff_measurement_idx on public.job_files (takeoff_measurement_id) where takeoff_measurement_id is not null;

-- A shape's group, sheet and section are all on one job.
create or replace function public.sc_takeoff_measurement_same_job()
returns trigger language plpgsql set search_path = public as $function$
declare pj uuid; po uuid; sj uuid; so uuid; xj uuid;
begin
  select job_id, org_id into pj, po from takeoff_parameters where id = new.parameter_id;
  select job_id, org_id into sj, so from plan_sheets where id = new.sheet_id;
  if pj is null or sj is null or pj <> sj or po <> new.org_id or so <> new.org_id then
    raise exception 'measurement must be on a sheet of the same job as its group';
  end if;
  if new.section_id is not null then
    select job_id into xj from job_sections where id = new.section_id and org_id = new.org_id;
    if xj is null or xj <> pj then
      raise exception 'a takeoff can only be counted in a section of its own job';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- A photo's shape is on the photo's job.
create or replace function public.sc_job_file_takeoff_same_job()
returns trigger language plpgsql set search_path = public as $$
declare pj uuid;
begin
  if new.takeoff_measurement_id is not null then
    select p.job_id into pj from takeoff_measurements m join takeoff_parameters p on p.id = m.parameter_id
      where m.id = new.takeoff_measurement_id and m.org_id = new.org_id;
    if pj is null or new.job_id is distinct from pj then
      raise exception 'a photo can only be put on a takeoff of its own job';
    end if;
  end if;
  return new;
end $$;
create trigger job_files_takeoff_same_job before insert or update of takeoff_measurement_id, job_id on public.job_files
  for each row execute function public.sc_job_file_takeoff_same_job();
