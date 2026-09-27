-- 036 — Dusty's track record per bucket, so he can earn the right to sort.
--
-- Coy, 2026-09-27: swipe to sort, and let Dusty learn. Every contact Coy files
-- is a labelled example: Dusty's guess (the contact's latest suggestion made
-- before Coy decided) against Coy's answer. Coy chose earned autonomy: once
-- Dusty's last 20 guesses of a bucket were all right, Dusty files that bucket
-- himself, marked auto, with Undo. A miss — Coy filing a guess differently, or
-- undoing an automatic filing — resets that bucket's streak to 0.
--
-- Computed from data, never stored, so it cannot drift. security_invoker: a
-- user sees only their org; the worker (service role) filters by org itself.
--
--   guess → bucket: customer→customer, vendor|sub→vendor, personal→personal,
--                   spam|not_work→spam; unknown is not a guess.

create or replace view public.sc_bucket_agreement with (security_invoker = true) as
with decided as (
  -- Coy filed it: his answer, and when.
  select c.org_id, c.id as contact_id, c.contact_type as answer, c.classification_confirmed_at as at
  from public.contacts c
  where c.classification_confirmed_at is not null and c.merged_into_contact_id is null
  union all
  -- Coy undid an automatic filing: a miss for whatever Dusty had filed.
  select c.org_id, c.id, null, c.auto_classify_blocked_at
  from public.contacts c
  where c.auto_classify_blocked_at is not null and c.merged_into_contact_id is null
), ev as (
  select d.org_id, d.contact_id, d.at,
         case g.classification
           when 'customer' then 'customer' when 'vendor' then 'vendor' when 'sub' then 'vendor'
           when 'personal' then 'personal' when 'spam' then 'spam' when 'not_work' then 'spam'
         end as bucket,
         d.answer
  from decided d
  cross join lateral (
    select p.classification from public.contact_proposals p
    where p.org_id = d.org_id and p.contact_id = d.contact_id and p.created_at <= d.at
    order by p.created_at desc limit 1
  ) g
), scored as (
  select org_id, bucket, at, (answer is not distinct from bucket) as hit
  from ev where bucket is not null
), last_miss as (
  select org_id, bucket, max(at) as at from scored where not hit group by 1, 2
)
select s.org_id, s.bucket,
       count(*)::int as guesses,
       count(*) filter (where s.hit)::int as agreed,
       count(*) filter (where s.hit and (m.at is null or s.at > m.at))::int as streak
from scored s
left join last_miss m on m.org_id = s.org_id and m.bucket = s.bucket
group by s.org_id, s.bucket;

revoke all on public.sc_bucket_agreement from anon;
grant select on public.sc_bucket_agreement to authenticated, service_role;
