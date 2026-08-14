-- ============================================================
-- ScopeCrete — cash-flow addendum
-- Closes the three gaps surfaced by the dashboard spec.
-- Depends on: 003_jobs_schema.sql + 004_overhead_settings.sql
-- ============================================================


-- ------------------------------------------------------------
-- A. CASH ANCHOR — balance checkpoints, not a single field
--
-- Design note: I had planned opening_balance + as_of_date as two
-- columns on org settings. That's wrong for where this goes.
-- A checkpoint TABLE gives the same thing on day one (the first
-- manual row IS the opening balance) and makes the later read-only
-- bank sync a new row rather than a schema change.
--
-- The model reconciles the ANCHOR, never transactions.
-- ------------------------------------------------------------
CREATE TABLE public.balance_checkpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

  as_of_date     date NOT NULL,
  balance        numeric(14,2) NOT NULL,   -- actual cash in the account

  source         text NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','bank_sync')),

  -- What the model THOUGHT the balance was on this date, captured at
  -- checkpoint time. actual - expected = drift = the untracked small
  -- stuff, surfaced as one lump instead of a thousand transactions.
  expected_balance numeric(14,2),
  drift            numeric(14,2)
                     GENERATED ALWAYS AS (balance - expected_balance) STORED,

  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, as_of_date)
);

CREATE INDEX balance_checkpoints_org_date_idx
  ON public.balance_checkpoints (org_id, as_of_date DESC);


-- The anchor the projection runs forward from: most recent checkpoint.
CREATE OR REPLACE FUNCTION public.sc_current_anchor(p_org_id uuid)
RETURNS TABLE (as_of_date date, balance numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT as_of_date, balance
  FROM public.balance_checkpoints
  WHERE org_id = p_org_id
  ORDER BY as_of_date DESC
  LIMIT 1;
$$;


-- ------------------------------------------------------------
-- B. OVERHEAD TIMING — when in the month each line hits
--    Without this the whole nut lands on the 1st by accident and
--    the outflow curve is a cliff instead of a staircase.
-- ------------------------------------------------------------
ALTER TABLE public.overhead_items
  ADD COLUMN IF NOT EXISTS due_day integer
    CHECK (due_day BETWEEN 1 AND 31),
  -- For quarterly/annual lines: which month it lands in (1-12).
  ADD COLUMN IF NOT EXISTS due_month integer
    CHECK (due_month BETWEEN 1 AND 12),
  -- For one_time lines: the single date it hits.
  ADD COLUMN IF NOT EXISTS one_time_date date;


-- ------------------------------------------------------------
-- C. CLOSE RATE — a view, not a stored number
--
-- The projected layer is quoted work weighted by this. It must be
-- computed from history so it self-corrects, never hardcoded.
-- Counts jobs by the month they were DECIDED (won or lost), since
-- that's when the outcome is known.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.job_close_rates
WITH (security_invoker = on) AS
SELECT
  org_id,
  date_trunc('month', COALESCE(won_at, lost_at))::date AS decided_month,
  count(*) FILTER (WHERE status = 'won')  AS won_count,
  count(*) FILTER (WHERE status = 'lost') AS lost_count,
  count(*)                                AS decided_count,
  ROUND(
    count(*) FILTER (WHERE status = 'won')::numeric
    / NULLIF(count(*), 0) * 100
  , 2) AS close_rate_pct
FROM public.jobs
WHERE status IN ('won','lost')
  AND COALESCE(won_at, lost_at) IS NOT NULL
GROUP BY org_id, date_trunc('month', COALESCE(won_at, lost_at));


-- Trailing close rate over a window, with the sample size attached so
-- the UI can say "provisional" instead of drawing a confident band on
-- three data points.
CREATE OR REPLACE FUNCTION public.sc_close_rate(
  p_org_id uuid,
  p_months integer DEFAULT 12
)
RETURNS TABLE (close_rate_pct numeric, sample_size bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ROUND(
      count(*) FILTER (WHERE status = 'won')::numeric
      / NULLIF(count(*), 0) * 100
    , 2),
    count(*)
  FROM public.jobs
  WHERE org_id = p_org_id
    AND status IN ('won','lost')
    AND COALESCE(won_at, lost_at) >= (CURRENT_DATE - (p_months || ' months')::interval);
$$;


-- ------------------------------------------------------------
-- D. RLS for the new table
-- ------------------------------------------------------------
ALTER TABLE public.balance_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY balance_checkpoints_member_select ON public.balance_checkpoints
  FOR SELECT TO authenticated
  USING (org_id = ANY (public.get_user_org_ids()));

CREATE POLICY balance_checkpoints_member_insert ON public.balance_checkpoints
  FOR INSERT TO authenticated
  WITH CHECK (org_id = ANY (public.get_user_org_ids()));

CREATE POLICY balance_checkpoints_member_update ON public.balance_checkpoints
  FOR UPDATE TO authenticated
  USING (org_id = ANY (public.get_user_org_ids()))
  WITH CHECK (org_id = ANY (public.get_user_org_ids()));

CREATE POLICY balance_checkpoints_member_delete ON public.balance_checkpoints
  FOR DELETE TO authenticated
  USING (org_id = ANY (public.get_user_org_ids()));
