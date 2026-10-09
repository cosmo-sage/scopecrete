-- 096 — risk on a job (Coy, 2026-10-09: "there needs to be a distinction between
-- the residential and the commercial work … scope creep pricing as a tool needs
-- to factor in the risk associated with both of these types of markets").
--
-- One jsonb column on project types (the defaults, Price book → Defaults) and
-- one on estimates (the budget's own, copied when a budget is made, then
-- changed on that job alone — like O.H. and margin). Its shape is read by
-- src/lib/risk.ts (readRisk): contingency_pct, pay_days, retainage_pct,
-- retainage_days, carry_rate_pct, items [{label, pct, on}]. Null = no risk set,
-- which changes no price.
--
-- Additive only: two nullable columns with an object check. No grant or policy
-- change — both tables' RLS by get_user_org_ids() covers them (an estimator
-- with Budget reads estimates as before). Until this is applied the budget's
-- Risk panel says it waits for 096 and every price reads as today.

alter table public.org_project_types add column if not exists risk jsonb;
alter table public.estimates add column if not exists risk jsonb;

alter table public.org_project_types add constraint org_project_types_risk_object
  check (risk is null or (jsonb_typeof(risk) = 'object' and pg_column_size(risk) < 8192)) not valid;
alter table public.estimates add constraint estimates_risk_object
  check (risk is null or (jsonb_typeof(risk) = 'object' and pg_column_size(risk) < 8192)) not valid;
alter table public.org_project_types validate constraint org_project_types_risk_object;
alter table public.estimates validate constraint estimates_risk_object;
