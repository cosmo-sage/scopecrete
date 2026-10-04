-- 078 — a job's sales tax looked up by its address (Coy, 2026-10-04: a
-- TaxLocus key — "how do I set it up?"). Additive: one nullable column.
--
-- jobs.tax_lookup is what TaxLocus answered for the job's address (its own,
-- else its customer's): the combined rate in %, each jurisdiction's part
-- (state, parish, city, district), the provider's rates-as-of date, how
-- exactly it placed the address (rooftop, zip …), the address asked about and
-- when. src/lib/tax.ts jobTax() uses it after a typed rate and a picked
-- parish, and only while the job's address is still the one looked up; the
-- org's parish table stays the fallback. Looked up once per address when the
-- budget opens (src/lib/tax-lookup-server.ts) or by "Look up again". RLS on
-- jobs is unchanged (members of the org); the key stays in Vercel.

alter table public.jobs add column if not exists tax_lookup jsonb;
