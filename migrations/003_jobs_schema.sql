-- ============================================================
-- ScopeCrete — jobs as the spine
-- Additive migration. Drops nothing. Existing comms history intact.
--
-- New tables use auth.uid()-derived isolation via get_user_org_ids(),
-- NOT the app.current_org_id session GUC. This starts the migration
-- toward the correct model instead of extending the weak one.
-- service_role bypasses RLS entirely, so backend agents are unaffected.
--
-- NOTE: section 9 (ORG COST SETTINGS) from the original
-- scopecrete-jobs-schema.sql has been omitted here. The companion
-- file scopecrete-overhead-settings.sql recreates public.org_cost_settings
-- with a different shape (comp_mode instead of a single monthly_overhead
-- column) and is applied immediately after this migration — applying
-- both verbatim in order would CREATE TABLE public.org_cost_settings
-- twice and fail. This migration owns jobs/job_sections/invoices/
-- payments/receipts/daily_logs/job_days only; org_cost_settings is
-- created once, by the overhead-settings migration.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Shared helper: updated_at trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sc_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 1. JOBS — the spine
-- ------------------------------------------------------------
CREATE TABLE public.jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  contact_id        uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  job_number        text,                       -- human-facing, e.g. 24-318
  title             text,                       -- "Hawkins driveway"
  job_type          text NOT NULL DEFAULT 'residential'
                      CHECK (job_type IN ('residential','commercial','public')),

  -- Where the work happens (may differ from the contact's address)
  address           text,
  city              text,
  state             text,
  zip               text,

  -- Lifecycle. Deliberately linear-ish; 'lead' is just the first stage.
  status            text NOT NULL DEFAULT 'lead'
                      CHECK (status IN ('lead','scoping','quoted','won','lost',
                                        'scheduled','in_progress','complete','closed')),
  won_at            timestamptz,
  lost_at           timestamptz,
  lost_reason       text,                       -- feeds the close-rate calc later

  scheduled_start   date,
  scheduled_end     date,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, job_number)
);

CREATE INDEX jobs_org_idx        ON public.jobs (org_id);
CREATE INDEX jobs_contact_idx    ON public.jobs (contact_id);
CREATE INDEX jobs_org_status_idx ON public.jobs (org_id, status);

CREATE TRIGGER jobs_touch
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- ------------------------------------------------------------
-- 2. JOB_SECTIONS — L x W x depth, the estimating unit
-- ------------------------------------------------------------
CREATE TABLE public.job_sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  name           text,                          -- "main drive", "apron", "patio"
  work_type      text NOT NULL DEFAULT 'slab'
                   CHECK (work_type IN ('slab','driveway','patio','sidewalk',
                                        'footing','curb','demo','prep','other')),

  length_ft      numeric(10,2),
  width_ft       numeric(10,2),
  sqft_override  numeric(12,2),                 -- irregular shapes: type the area directly

  -- Area falls out of geometry unless overridden. Stored, so it is queryable.
  sqft           numeric(12,2)
                   GENERATED ALWAYS AS
                   (COALESCE(sqft_override, length_ft * width_ft)) STORED,

  depth_in       numeric(6,2) DEFAULT 4,
  psi            integer      DEFAULT 3000,

  -- Neat volume. Waste/shortload/overage are PRICING decisions and live
  -- in the estimate, not here — geometry stays honest.
  cubic_yards    numeric(12,3)
                   GENERATED ALWAYS AS
                   (COALESCE(sqft_override, length_ft * width_ft)
                    * COALESCE(depth_in, 4) / 12.0 / 27.0) STORED,

  rebar          text,                          -- "#4 @ 18 OC", "fiber mesh", null
  prep_notes     text,
  access_notes   text,                          -- pump needed? tight gate?

  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_sections_job_idx ON public.job_sections (job_id, sort_order);
CREATE INDEX job_sections_org_idx ON public.job_sections (org_id);

CREATE TRIGGER job_sections_touch
  BEFORE UPDATE ON public.job_sections
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- ------------------------------------------------------------
-- 3. Tie the existing world to jobs
--    All nullable. Nothing existing breaks.
-- ------------------------------------------------------------
ALTER TABLE public.leads          ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.voip_calls     ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.sms_threads    ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.quo_events     ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS voip_calls_job_idx  ON public.voip_calls (job_id);
CREATE INDEX IF NOT EXISTS sms_threads_job_idx ON public.sms_threads (job_id);
CREATE INDEX IF NOT EXISTS quo_events_job_idx  ON public.quo_events (job_id);


-- ------------------------------------------------------------
-- 4. ESTIMATES — versioned, job-anchored, floor-aware
--    Existing table. Additive columns only.
-- ------------------------------------------------------------
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS job_id             uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version            integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS doc_kind           text NOT NULL DEFAULT 'estimate'
                                                CHECK (doc_kind IN ('estimate','quote')),
  ADD COLUMN IF NOT EXISTS disclosure_level   text NOT NULL DEFAULT 'total'
                                                CHECK (disclosure_level IN ('total','groups','line_items')),

  -- Discounts touch PRICE ONLY. Never subtract from cost.
  -- (The Gulfline job entered -$4,000 in both columns and inflated
  --  reported margin from 27.7% to 39.4%.)
  ADD COLUMN IF NOT EXISTS discount_amount    numeric(12,2) NOT NULL DEFAULT 0
                                                CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_reason    text,

  -- Snapshot of the floor math AT THE TIME OF QUOTING, so the number
  -- shown next to the discount slider is reproducible later.
  ADD COLUMN IF NOT EXISTS hard_cost          numeric(12,2),  -- materials + labor + equip
  ADD COLUMN IF NOT EXISTS overhead_allocated numeric(12,2),  -- this job's share of the monthly nut
  ADD COLUMN IF NOT EXISTS off_top_pct        numeric(5,2),   -- 11.00 under Sacco Enterprises
  ADD COLUMN IF NOT EXISTS floor_amount       numeric(12,2),  -- (hard_cost + overhead) / (1 - off_top_pct/100)
  ADD COLUMN IF NOT EXISTS estimated_crew_days numeric(6,2),

  ADD COLUMN IF NOT EXISTS accepted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS engine_version     text;           -- which formula build produced this

CREATE INDEX IF NOT EXISTS estimates_job_idx ON public.estimates (job_id, version DESC);


-- Per-cost-type markup lives on the group and can be overridden per line.
ALTER TABLE public.cost_groups
  ADD COLUMN IF NOT EXISTS cost_type          text
                                                CHECK (cost_type IN ('material','labor','equipment','subcontract','other')),
  ADD COLUMN IF NOT EXISTS default_markup_pct numeric(6,3);

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS cost_type   text
                                         CHECK (cost_type IN ('material','labor','equipment','subcontract','other')),
  ADD COLUMN IF NOT EXISTS markup_pct  numeric(6,3),   -- null = inherit group default
  ADD COLUMN IF NOT EXISTS unit_price  numeric(12,4),  -- what the customer sees
  ADD COLUMN IF NOT EXISTS total_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS section_id  uuid REFERENCES public.job_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taxable     boolean NOT NULL DEFAULT false;


-- ------------------------------------------------------------
-- 5. INVOICES + PAYMENTS — money you already know
-- ------------------------------------------------------------
CREATE TABLE public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  estimate_id     uuid REFERENCES public.estimates(id) ON DELETE SET NULL,

  invoice_number  text,
  milestone_label text,                          -- 'deposit' / 'progress' / 'final'
  milestone_pct   numeric(5,2),                  -- 25 / 40 / 35
  amount          numeric(12,2) NOT NULL,

  issued_on       date,
  due_on          date,                          -- drives the cash-flow projection
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','partial','paid','void')),

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, invoice_number)
);

CREATE INDEX invoices_job_idx     ON public.invoices (job_id);
CREATE INDEX invoices_org_due_idx ON public.invoices (org_id, due_on);

CREATE TRIGGER invoices_touch
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


CREATE TABLE public.payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  invoice_id    uuid REFERENCES public.invoices(id) ON DELETE SET NULL,

  amount        numeric(12,2) NOT NULL,
  received_on   date NOT NULL DEFAULT CURRENT_DATE,
  method        text CHECK (method IN ('check','ach','card','cash','other')),
  reference     text,                            -- check number, last4, etc.
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_job_idx      ON public.payments (job_id);
CREATE INDEX payments_org_date_idx ON public.payments (org_id, received_on);


-- ------------------------------------------------------------
-- 6. RECEIPTS — camera-first, conversationally confirmed
--    Doubles as the production-day signal (see section 8).
-- ------------------------------------------------------------
CREATE TABLE public.receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id            uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  vendor_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  photo_path        text,                        -- Supabase Storage object path
  vendor_name       text,                        -- as read off the receipt
  amount            numeric(12,2),
  tax_amount        numeric(12,2),
  purchased_on      date,

  cost_type         text CHECK (cost_type IN ('material','labor','equipment','subcontract','other')),

  -- Concrete tickets carry yardage. Capturing it lets ordered-vs-poured
  -- overage be measured instead of assumed (~3.4% on Gulfline).
  cubic_yards       numeric(12,3),
  psi               integer,

  -- What the AI pulled vs. what Coy confirmed. Never silently trust OCR.
  extracted         jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence        integer CHECK (confidence BETWEEN 0 AND 100),
  confirmed         boolean NOT NULL DEFAULT false,
  confirmed_at      timestamptz,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX receipts_job_idx      ON public.receipts (job_id);
CREATE INDEX receipts_org_date_idx ON public.receipts (org_id, purchased_on);

CREATE TRIGGER receipts_touch
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- ------------------------------------------------------------
-- 7. DAILY LOGS — photos + updates, notify tagged people
-- ------------------------------------------------------------
CREATE TABLE public.daily_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  log_date     date NOT NULL DEFAULT CURRENT_DATE,
  author_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body         text,
  photo_paths  jsonb NOT NULL DEFAULT '[]'::jsonb,

  crew_size    integer,                          -- feeds crew-day overhead spreading
  weather      text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_logs_job_idx      ON public.daily_logs (job_id, log_date DESC);
CREATE INDEX daily_logs_org_date_idx ON public.daily_logs (org_id, log_date);

CREATE TRIGGER daily_logs_touch
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.sc_touch_updated_at();


-- Who gets pinged. Notification DELIVERY waits on the messaging layer
-- (10DLC etc.); the intent is recorded now so nothing is lost.
CREATE TABLE public.daily_log_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  log_id       uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,

  contact_id   uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  channel      text NOT NULL DEFAULT 'email'
                 CHECK (channel IN ('email','sms','in_app')),
  notified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CHECK (contact_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX daily_log_recipients_log_idx ON public.daily_log_recipients (log_id);


-- ------------------------------------------------------------
-- 8. JOB_DAYS — the discovered production calendar
--    Not typed in. Derived from receipts and logs, with room for
--    a manual "worked here, no spend" tap later.
-- ------------------------------------------------------------
CREATE TABLE public.job_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  work_date   date NOT NULL,
  source      text NOT NULL DEFAULT 'receipt'
                CHECK (source IN ('receipt','daily_log','manual')),
  crew_size   integer,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id, work_date)
);

CREATE INDEX job_days_org_date_idx ON public.job_days (org_id, work_date);


-- A receipt filed to a job marks that date as worked.
CREATE OR REPLACE FUNCTION public.sc_mark_job_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_src  text;
BEGIN
  IF TG_TABLE_NAME = 'receipts' THEN
    v_date := NEW.purchased_on;
    v_src  := 'receipt';
  ELSE
    v_date := NEW.log_date;
    v_src  := 'daily_log';
  END IF;

  IF NEW.job_id IS NULL OR v_date IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.job_days (org_id, job_id, work_date, source)
  VALUES (NEW.org_id, NEW.job_id, v_date, v_src)
  ON CONFLICT (job_id, work_date) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER receipts_mark_job_day
  AFTER INSERT OR UPDATE OF job_id, purchased_on ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.sc_mark_job_day();

CREATE TRIGGER daily_logs_mark_job_day
  AFTER INSERT OR UPDATE OF job_id, log_date ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.sc_mark_job_day();


-- ------------------------------------------------------------
-- 9. RLS — auth.uid()-derived, one pattern for every new table
--    (org_cost_settings is intentionally excluded here — it is
--    created and RLS-enabled by the overhead-settings migration.)
-- ------------------------------------------------------------
ALTER TABLE public.jobs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_log_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_days             ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','job_sections','invoices','payments','receipts',
    'daily_logs','daily_log_recipients','job_days'
  ]
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

-- Note: service_role bypasses RLS, so Hermes and the edge functions
-- keep full access once they authenticate with the service key.
