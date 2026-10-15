-- 111 — size rows on a section (Coy, 2026-10-15: "I'm not sure what to do
-- about the section dimensions and how to make it more flexible" → "Build size
-- rows"). One section can hold several sizes that add up — 30×40 at 4" plus a
-- 600 SF apron at 6" — each with its own thickness. The rows' total is written
-- onto the section's own size fields by the app (src/lib/section-sizes.ts), so
-- the engine reads a section as before; the section's takeoffs, when it follows
-- them, add in as one more row.
--
-- Additive only. RLS by get_user_org_ids(); anon nothing; a guard keeps the
-- section on the row's job and org.

create table if not exists public.job_section_sizes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  section_id uuid not null references public.job_sections(id) on delete cascade,
  label text check (label is null or length(label) <= 60),
  mode text not null check (mode in ('dims', 'area', 'linear', 'count')),
  length_ft numeric check (length_ft is null or length_ft > 0),
  width_ft numeric check (width_ft is null or width_ft > 0),
  sqft numeric check (sqft is null or sqft > 0),
  qty numeric check (qty is null or qty > 0),
  unit text check (unit is null or length(unit) <= 12),
  width_in numeric check (width_in is null or width_in > 0),
  depth_in numeric check (depth_in is null or (depth_in > 0 and depth_in <= 240)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_section_sizes_section_idx on public.job_section_sizes (section_id, sort_order);

create or replace function public.sc_section_size_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from job_sections s where s.id = new.section_id and s.job_id = new.job_id and s.org_id = new.org_id) then
    raise exception 'that section is not on this job';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger job_section_sizes_guard before insert or update on public.job_section_sizes
  for each row execute function public.sc_section_size_guard();

alter table public.job_section_sizes enable row level security;
revoke all on public.job_section_sizes from anon, authenticated;
grant select, insert, update, delete on public.job_section_sizes to authenticated;
create policy job_section_sizes_member on public.job_section_sizes
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
