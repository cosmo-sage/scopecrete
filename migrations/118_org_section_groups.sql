-- 118 — Section cost groups for the whole company (Coy, 2026-10-22: "apply 118").
-- Before 118 the groups every budget section shows (Labor · Materials · Equipment by
-- default) were each person's own (user_preferences.prefs.section_groups). Now they
-- are the company's: one nullable column on org_money_settings, which already holds
-- the org's pricing defaults under its member RLS. Null = the default groups.
-- Only known cost types, at most 8. Additive; RLS and policies unchanged.
alter table public.org_money_settings
  add column if not exists section_groups text[];
alter table public.org_money_settings
  add constraint org_money_settings_section_groups_ok
  check (section_groups is null or (cardinality(section_groups) <= 8 and section_groups <@
    array['labor','material','equipment','subcontract','other']::text[]));
