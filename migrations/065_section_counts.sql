-- 065 — a section measured by count (Coy, 2026-10-02: "On the third section
-- in this budget, it's actually a quantity per item. So it's not an area, it's
-- a quantity." — Burgess Ave's NS-MSC-00080 Detectable Warning, 8 EA).
--
-- A section is measured by length × width, by its area alone (sqft_override),
-- or now by a COUNT: count_qty of count_unit (EA by default). A budget line on
-- a counted section, priced per each, takes the count as its quantity
-- (src/lib/engine ruleQty). Additive only: two nullable columns, checked.
-- Row access is unchanged (job_sections' RLS by get_user_org_ids()).

alter table public.job_sections
  add column if not exists count_qty numeric(12,2),
  add column if not exists count_unit text;

alter table public.job_sections
  add constraint job_sections_count_qty_positive check (count_qty is null or count_qty > 0),
  add constraint job_sections_count_unit_len check (count_unit is null or char_length(count_unit) between 1 and 12);

comment on column public.job_sections.count_qty is 'Measured by count (065): how many — e.g. 8 detectable warning panels. Null when measured by size.';
comment on column public.job_sections.count_unit is 'The unit counted (EA, LS …). Null = EA.';
