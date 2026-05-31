-- ============================================================
-- org_members table — links users to orgs for multi-tenant RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS scopecrete.org_members (
  id       UUID        NOT NULL DEFAULT gen_random_uuid(),
  org_id   UUID        NOT NULL REFERENCES scopecrete.orgs(id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     TEXT        NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner', 'member', 'billing', 'field')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE scopecrete.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read own memberships"
  ON scopecrete.org_members
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can do anything"
  ON scopecrete.org_members
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Add org_id to leads for RLS scoping
-- ============================================================
ALTER TABLE scopecrete.leads ADD COLUMN IF NOT EXISTS org_id UUID;

ALTER TABLE scopecrete.leads
  ADD CONSTRAINT leads_org_fkey
  FOREIGN KEY (org_id) REFERENCES scopecrete.orgs(id) ON DELETE SET NULL;

CREATE POLICY "Org members see own org leads"
  ON scopecrete.leads
  FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM scopecrete.org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role can insert leads"
  ON scopecrete.leads
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');