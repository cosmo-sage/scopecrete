-- 126 — A vendor's portal, and won / lost on a bid request (Coy, 2026-10-23: "from the bid
-- request page … I would like the vendor to access their portal to see the other bid request
-- documents / projects we are trying to win. And they can see the ones they won / lost.")
--
-- No new link to send: any live bid link of a vendor (their /b/<token>) opens their list at
-- /b/<token>/all. Two things:
--
--   bid_request_recipients.outcome  'awarded' | 'not_chosen', set by a member on the job's bid
--                                    request (outcome_at, outcome_by). Members may update only
--                                    these columns beyond 091's; the vendor's answer stays theirs.
--   sc_vendor_portal(token)          SECURITY DEFINER, anon may run it. The token must be a live
--                                    link; it returns every bid request THAT vendor (the link's
--                                    contact) was sent by THAT org — job title and address (as on their bid), price-by,
--                                    pour, when sent, their own price and when, the outcome, the
--                                    job's stage, and their own link to each (a link turned off is
--                                    listed without one). Never a cost, a budget, Coy's notes or
--                                    another vendor's price. Nothing is logged.
--
-- Additive: three nullable columns, one check, one column grant, one function. Nothing dropped.

alter table public.bid_request_recipients
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_by uuid references auth.users(id) on delete set null;
alter table public.bid_request_recipients drop constraint if exists bid_recipients_outcome_check;
alter table public.bid_request_recipients add constraint bid_recipients_outcome_check
  check (outcome is null or outcome in ('awarded', 'not_chosen'));

grant update (outcome, outcome_at, outcome_by) on public.bid_request_recipients to authenticated;

create or replace function public.sc_vendor_portal(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; own boolean; org_name text; vendor_name text; reqs jsonb;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into r from bid_request_recipients where token = p_token;
  if not found then return null; end if;
  select name into org_name from orgs where id = r.org_id;
  if r.revoked_at is not null then return jsonb_build_object('gone', true, 'org_name', org_name); end if;
  select coalesce(nullif(btrim(c.company_name), ''), nullif(btrim(c.name), '')) into vendor_name
    from contacts c where c.id = r.contact_id;
  own := coalesce(r.org_id = any(get_user_org_ids()), false);

  select coalesce(jsonb_agg(x order by x ->> 'sent_at' desc nulls last), '[]'::jsonb) into reqs from (
    select jsonb_build_object(
      'token', case when q.revoked_at is null then q.token end,
      'current', q.id = r.id,
      'job', j.title,
      'address', nullif(btrim(j.address), ''),
      'price_by', b.price_by, 'pour_date', b.pour_date,
      'sent_at', coalesce(q.sent_at, q.created_at),
      'opened', q.view_count > 0,
      'answered_at', q.answered_at, 'total', q.price_total,
      'outcome', q.outcome, 'outcome_at', q.outcome_at,
      'job_status', j.status, 'archived', j.archived_at is not null,
      'closed', q.revoked_at is not null) as x
      from bid_request_recipients q
      join bid_requests b on b.id = q.bid_request_id
      join jobs j on j.id = b.job_id
     where q.org_id = r.org_id and q.contact_id = r.contact_id
     limit 200) s;

  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name,
    'vendor_name', vendor_name, 'first_name', r.first_name, 'requests', reqs);
end $$;
revoke all on function public.sc_vendor_portal(text) from public;
grant execute on function public.sc_vendor_portal(text) to anon, authenticated;
