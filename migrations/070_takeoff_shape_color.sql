-- 070 — a colour per takeoff shape (Coy, 2026-10-03: "the ability to select
-- different colors for each measurement in the parameters panel … The colors
-- don't need to move over to the budget, it's just for the plan room").
--
-- Additive: one nullable column. Null = the shape takes its group's colour, as
-- before. A colour is a #rrggbb hex. RLS on takeoff_measurements is unchanged
-- (members of the org, by get_user_org_ids()).

alter table public.takeoff_measurements
  add column if not exists color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.takeoff_measurements.color is
  'The shape''s own colour in the Plan Room (#rrggbb); null = its group''s colour. Display only — nothing prices or reads it.';
