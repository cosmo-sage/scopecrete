-- 083 — get_user_org_ids() is STABLE (2026-10-05, "How can we get the app to load faster").
--
-- Every member policy reads `org_id = ANY (get_user_org_ids())` (151 of them).
-- The function was created plpgsql with no volatility, so Postgres treated it
-- as VOLATILE: it ran once per ROW scanned and no index could be used. Marked
-- STABLE it runs once per statement and the org_id indexes apply.
--
-- Measured on the live data as Coy (rolled back): messages (latest 4,000),
-- contacts, contact_phones and call_artifacts read under RLS — 49.8 ms → 10.9 ms
-- (5 runs each). Every RLS read in the app gets the same kind of saving.
--
-- What it returns is unchanged (the caller's org ids, estimators left out —
-- 081), so nobody sees more or less. It only reads tables, which is what
-- STABLE allows. No grant, policy or row changes.

alter function public.get_user_org_ids() stable;
-- Undo: alter function public.get_user_org_ids() volatile;
