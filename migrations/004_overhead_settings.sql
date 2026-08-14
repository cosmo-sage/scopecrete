-- ============================================================
-- ScopeCrete — overhead & compensation, redrawn
-- Replaces the single lumped monthly_overhead field from
-- scopecrete-jobs-schema.sql section 9 with:
--   (a) categorized overhead line items per org
--   (b) a flexible compensation mode (fixed draw vs % of profit)
--
-- The floor reads from these. The cash-flow dashboard reads from
-- these. One source of truth, two zoom levels.
--
-- Depends on: 003_jobs_schema.sql (public.sc_touch_updated_at,
-- public.get_user_org_ids())
-- ============================================================


-- ------------------------------------------------------------
-- 9a. ORG_COST_SETTINGS — rates + comp mode
--     (overhead moves OUT to its own table, below)
-- ------------------------------------------------------------
CREATE TABLE public.org_cost_settings (
  org_id                    uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,

  -- Off-the-top revenue share (Sacco Enterprises: 5 + 3 + 3 = 11)
  owner_fee_pct             numeric(5,2) NOT NULL DEFAULT 5.00,
  estimator_fee_pct         numeric(5,2) NOT NULL DEFAULT 3.00,
  tax_reserve_pct           numeric(5,2) NOT NULL DEFAULT 3.00,

  -- How many crew-days the fixed nut is spread across.
  -- Placeholder until job_days has enough measured history.
  assumed_billable_days     numeric(6,2) NOT NULL DEFAULT 10.00,
  use_measured_days         boolean      NOT NULL DEFAULT false,

  -- ---- Compensation mode: the pay-yourself model ----
  -- 'fixed_draw'   -> a monthly target dollar figure. Behaves like an
  --                   overhead line: the floor MUST cover its share.
  -- 'pct_profit'   -> eat-what-you-kill. Comes out of what's left after
  --                   a job clears. NOT in the floor; dashboard reports it.
  comp_mode                 text NOT NULL DEFAULT 'fixed_draw'
                              CHECK (comp_mode IN ('fixed_draw','pct_profit')),
  comp_monthly_draw         numeric(12,2) DEFAULT 0,     -- used when comp_mode = fixed_draw
  comp_profit_pct           numeric(5,2)  DEFAULT 0,     -- used when comp_mode = pct_profit

  -- ---- Default estimating rates (Gulfline actuals) ----
  concrete_price_per_cy     numeric(10,2) DEFAULT 236.13,
  form_finish_per_sqft      numeric(10,2) DEFAULT 1.43,
  demo_per_sqft             numeric(10,2) DEFAULT 2.00,
  concrete_overage_pct      numeric(5,2)  DEFAULT 3.40,
  shortload_threshold_cy    numeric(6,2)  DEFAULT 5.00,
  shortload_pct             numeric(5,2)  DEFAULT 15.00,
  mobilization_fee          numeric(10,2) DEFAULT 750.00,
  sales_tax_pct             numeric(5,3)  DEFAULT 8.080,
  tax_applies_to            text NOT NULL DEFAULT 'materials'
                              CHECK (tax_applies_to IN ('materials','full_bid','none')),

  markup_material_pct       numeric(6,3) DEFAULT 30.610,
  markup_labor_pct          numeric(6,3) DEFAULT 41.770,
  markup_equipment_pct      numeric(6,3) DEFAULT 30.120,
  markup_subcontract_pct    numeric(6,3) DEFAULT 15.000,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER org_cost_settings_touch
  BEFORE UPDATE ON public.org_cost_settings
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- ------------------------------------------------------------
-- 9b. OVERHEAD_ITEMS — the monthly nut, itemized and adjustable
--     Each row is a line you can toggle and watch the floor move.
-- ------------------------------------------------------------
CREATE TABLE public.overhead_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

  label        text NOT NULL,                    -- 'Website / software', 'Skid steer note'
  category     text NOT NULL DEFAULT 'fixed'
                 CHECK (category IN ('fixed','equipment','variable','insurance','other')),

  -- Everything normalizes to a monthly figure so the nut is one sum.
  amount       numeric(12,2) NOT NULL,
  cadence      text NOT NULL DEFAULT 'monthly'
                 CHECK (cadence IN ('monthly','quarterly','annual','one_time')),

  -- Turn a line off to see the floor drop, without deleting it.
  active       boolean NOT NULL DEFAULT true,
  notes        text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX overhead_items_org_idx ON public.overhead_items (org_id, active);

CREATE TRIGGER overhead_items_touch
  BEFORE UPDATE ON public.overhead_items
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- Monthly nut = sum of active lines, each normalized to a month.
-- (one_time lines are excluded from the recurring nut on purpose;
--  they belong to a specific month's cash flow, not the ongoing floor.)
CREATE OR REPLACE FUNCTION public.sc_monthly_overhead(p_org_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE cadence
      WHEN 'monthly'   THEN amount
      WHEN 'quarterly' THEN amount / 3.0
      WHEN 'annual'    THEN amount / 12.0
      ELSE 0
    END
  ), 0)
  FROM public.overhead_items
  WHERE org_id = p_org_id AND active AND cadence <> 'one_time';
$$;


-- ------------------------------------------------------------
-- RLS for the two new/changed tables
-- ------------------------------------------------------------
ALTER TABLE public.org_cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overhead_items    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_cost_settings','overhead_items']
  LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_member_select ON public.%1$s
        FOR SELECT TO authenticated
        USING (org_id = ANY (public.get_user_org_ids()));
      CREATE POLICY %1$s_member_insert ON public.%1$s
        FOR INSERT TO authenticated
        WITH CHECK (org_id = ANY (public.get_user_org_ids()));
      CREATE POLICY %1$s_member_update ON public.%1$s
        FOR UPDATE TO authenticated
        USING (org_id = ANY (public.get_user_org_ids()))
        WITH CHECK (org_id = ANY (public.get_user_org_ids()));
      CREATE POLICY %1$s_member_delete ON public.%1$s
        FOR DELETE TO authenticated
        USING (org_id = ANY (public.get_user_org_ids()));
    $f$, t);
  END LOOP;
END $$;
