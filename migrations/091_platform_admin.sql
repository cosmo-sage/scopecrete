-- 091 — The ScopeCrete admin (Coy, 2026-10-08: the Claude Design "Super Admin"
-- package, from the brief at /mnt/project-files/admin-dashboard/: "a new
-- Dashboard for me to manage the scopecrete Saas With").
--
-- CROSS-TENANT, so it follows DECISIONS §7's superadmin rules to the letter:
-- * Named functions only, never raw SQL and never the service-role key. Each
--   function is SECURITY DEFINER and first calls sc_admin_check(), which
--   refuses anyone not in platform_admins (084).
-- * Counts, not content: the read functions return numbers, states, dates
--   and error text from the pipelines. No customer names, phone numbers,
--   message bodies, transcripts or files. Members' names and emails (the
--   contractor's own staff) are shown on a company's People tab.
-- * Every write is audited in admin_audit (who, what, which company, when,
--   the reason, before/after). admin_audit has RLS on, no policies, no
--   grants: nobody reads or writes it directly; sc_admin_log() reads it.
-- * The writes are three, each asks for a reason: replay a raw event of any
--   company (as sc_replay_raw_event, 077, without the membership check),
--   publish / not-plan a feedback item (084's sc_roadmap_admin, audited), and
--   create a company (the org + an owner invite; the invite link is shown
--   once, the token kept only as its SHA-256, like 062).
--
-- Additive only: one table, thirteen functions. Execute for authenticated
-- only; anon nothing. Undo: drop the thirteen functions and admin_audit.

set lock_timeout = '8s';

create table if not exists public.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null,
  admin_name text,
  action     text not null,
  org_id     uuid references public.orgs(id) on delete set null,
  detail     text,
  reason     text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created on public.admin_audit (created_at desc);
create index if not exists admin_audit_org on public.admin_audit (org_id, created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;

-- ---------------------------------------------------------------- the gate

create or replace function public.sc_admin_check()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from platform_admins where user_id = auth.uid()) then
    raise exception 'only a ScopeCrete admin can do that' using errcode = '42501';
  end if;
end $$;

create or replace function public.sc_admin_audit(p_action text, p_org uuid, p_detail text, p_reason text,
  p_before jsonb default null, p_after jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; v_name text;
begin
  perform sc_admin_check();
  select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email) into v_name from auth.users u where u.id = auth.uid();
  insert into admin_audit (admin_id, admin_name, action, org_id, detail, reason, before, after)
    values (auth.uid(), v_name, p_action, p_org, left(p_detail, 500), nullif(left(btrim(coalesce(p_reason, '')), 1000), ''), p_before, p_after)
    returning id into v;
  return v;
end $$;

-- ------------------------------------------------------------ companies

-- One row per company: counts for the range, the 7-day sparkline, the setup
-- checklist as the date each step was first done (null = not yet).
create or replace function public.sc_admin_companies(p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform sc_admin_check();
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb) into v from (
    select o.id, o.name, o.slug, o.plan_tier as plan, o.created_at,
      (select count(*) from org_members m where m.org_id = o.id) as members,
      (select count(*) from org_invites i where i.org_id = o.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) as invited,
      (select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email)
         from org_members m join auth.users u on u.id = m.user_id
        where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner,
      greatest(
        (select max(u.last_sign_in_at) from org_members m join auth.users u on u.id = m.user_id where m.org_id = o.id),
        (select max(dm.created_at) from dusty_messages dm where dm.org_id = o.id and dm.role = 'user')
      ) as last_active,
      (select count(*) from messages ms where ms.org_id = o.id and ms.direction = 'inbound' and ms.occurred_at >= p_since) as inbound,
      (select count(*) from messages ms where ms.org_id = o.id and ms.direction = 'outbound' and ms.occurred_at >= p_since) as outbound,
      (select count(*) from emails e where e.org_id = o.id and e.created_at >= p_since) as emails,
      (select count(*) from dusty_messages dm where dm.org_id = o.id and dm.role = 'user' and dm.created_at >= p_since) as dusty_questions,
      (select count(*) from jobs j where j.org_id = o.id and j.archived_at is null and j.status not in ('complete', 'lost')) as jobs_open,
      (select count(*) from jobs j where j.org_id = o.id and j.created_at >= p_since) as jobs_made,
      (select count(*) from bid_packages b where b.org_id = o.id and b.state = 'filed' and b.filed_at >= p_since) as bids_filed,
      (select count(*) from documents d where d.org_id = o.id and d.sent_at >= p_since) as proposals_sent,
      (select count(*) from documents d where d.org_id = o.id and d.first_viewed_at >= p_since) as proposals_opened,
      (select count(*) from documents d where d.org_id = o.id and d.sent_at >= now() - interval '30 days') as proposals_30d,
      (select count(*) from sc_spine_drift s where s.org_id = o.id and s.issue = 'unprojected_raw_event') as drift,
      (select count(*) from quo_events q where q.org_id = o.id and q.projection_error is not null and q.received_at >= now() - interval '24 hours') as intake_errors_24h,
      (select count(*) from bid_packages b where b.org_id = o.id and b.state not in ('filed', 'not_a_bid') and b.undone_at is null
          and b.updated_at < now() - interval '15 minutes') as bids_stuck,
      (select coalesce(sum(f.byte_size), 0) from files f where f.org_id = o.id and f.deleted_at is null) as file_bytes,
      array(select (select count(*) from messages ms where ms.org_id = o.id
                     and ms.occurred_at >= d and ms.occurred_at < d + interval '1 day')
              from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d) as spark,
      jsonb_build_object(
        'quo',        (select min(q.received_at) from quo_events q where q.org_id = o.id),
        'email',      (select min(a.created_at) from org_inbound_addresses a where a.org_id = o.id),
        'lines',      (select min(p.created_at) from org_phone_numbers p where p.org_id = o.id),
        'logo',       case when o.logo_light_path is not null or o.logo_dark_path is not null
                        then (select min(a.created_at) from org_audit a where a.org_id = o.id and a.action = 'logo_set') end,
        'logo_set',   (o.logo_light_path is not null or o.logo_dark_path is not null),
        'tax',        (select min(t.updated_at) from tax_parishes t where t.org_id = o.id),
        'pricebook',  (select min(c.created_at) from cost_items c where c.org_id = o.id),
        'assemblies', (select min(a.created_at) from cost_assemblies a where a.org_id = o.id),
        'people',     (select min(i.created_at) from org_invites i where i.org_id = o.id),
        'proposal',   (select min(d.sent_at) from documents d where d.org_id = o.id)
      ) as setup,
      (select min(ms.occurred_at) from messages ms where ms.org_id = o.id and ms.direction = 'inbound') as first_inbound,
      (select min(j.created_at) from jobs j where j.org_id = o.id) as first_job
    from orgs o
  ) x;
  return v;
end $$;

create or replace function public.sc_admin_people(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
        'email', u.email, 'role', m.role, 'joined', m.created_at, 'last_sign_in', u.last_sign_in_at,
        'last_question', (select max(dm.created_at) from dusty_messages dm join dusty_conversations dc on dc.id = dm.conversation_id
                           where dc.user_id = m.user_id and dm.org_id = p_org and dm.role = 'user'),
        'questions_30d', (select count(*) from dusty_messages dm join dusty_conversations dc on dc.id = dm.conversation_id
                           where dc.user_id = m.user_id and dm.org_id = p_org and dm.role = 'user' and dm.created_at >= now() - interval '30 days')
      ) order by m.created_at) from org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'sent', i.created_at, 'expires', i.expires_at)
        order by i.created_at desc) from org_invites i
        where i.org_id = p_org and i.accepted_at is null and i.revoked_at is null), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------ pipelines

create or replace function public.sc_admin_pipelines(p_org uuid, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return jsonb_build_object(
    'quo', (select jsonb_build_object(
        'received', count(*),
        'filed', count(*) filter (where q.projected_at is not null and q.projection_error is null),
        'errors', count(*) filter (where q.projection_error is not null),
        'median_ms', percentile_cont(0.5) within group (order by extract(epoch from (q.projected_at - q.received_at)) * 1000)
                       filter (where q.projected_at is not null))
      from quo_events q where q.received_at >= p_since and (p_org is null or q.org_id = p_org)),
    'messages', (select count(*) from messages m where m.created_at >= p_since and (p_org is null or m.org_id = p_org)),
    'drift', (select count(*) from sc_spine_drift s where s.issue = 'unprojected_raw_event' and (p_org is null or s.org_id = p_org)),
    'defects', (select count(*) from sc_spine_drift s where s.issue = 'open_defect' and (p_org is null or s.org_id = p_org)),
    'read_contacts', (select count(distinct r.contact_id) from contact_enrich_runs r where r.started_at >= p_since and (p_org is null or r.org_id = p_org)),
    'email', (select jsonb_build_object(
        'events', (select count(*) from email_events ev where ev.received_at >= p_since and (p_org is null or ev.org_id = p_org)),
        'event_errors', (select count(*) from email_events ev where ev.received_at >= p_since and ev.projection_error is not null and (p_org is null or ev.org_id = p_org)),
        'stored', count(*),
        'exact', count(*) filter (where e.match = 'exact'),
        'suggested', count(*) filter (where e.match = 'domain_suggested'),
        'by_hand', count(*) filter (where e.match = 'coy'),
        'unfiled', count(*) filter (where e.customer_id is null and e.job_id is null and e.contact_id is null),
        'quarantined', count(*) filter (where e.status = 'quarantined'))
      from emails e where e.created_at >= p_since and (p_org is null or e.org_id = p_org)),
    'bids', (select jsonb_build_object(
        'opened', count(*),
        'filed', count(*) filter (where b.state = 'filed'),
        'not_a_bid', count(*) filter (where b.state = 'not_a_bid'),
        'in_flight', count(*) filter (where b.state not in ('filed', 'not_a_bid') and b.undone_at is null),
        'undone', count(*) filter (where b.undone_at is not null),
        'median_s', percentile_cont(0.5) within group (order by extract(epoch from (b.filed_at - b.created_at)))
                       filter (where b.filed_at is not null))
      from bid_packages b where b.created_at >= p_since and (p_org is null or b.org_id = p_org)),
    'stuck', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'org_id', b.org_id, 'state', b.state,
        'error', b.error, 'attempts', b.attempts, 'since', b.updated_at) order by b.updated_at)
      from bid_packages b where b.state not in ('filed', 'not_a_bid') and b.undone_at is null
        and b.updated_at < now() - interval '15 minutes' and (p_org is null or b.org_id = p_org)), '[]'::jsonb),
    'files', (select jsonb_build_object(
        'waiting', (select count(*) from files f where f.deleted_at is null and coalesce(f.read_state, 'waiting') in ('waiting', 'reading')
                      and (p_org is null or f.org_id = p_org)),
        'read', count(*) filter (where f.read_state = 'read'),
        'skipped', count(*) filter (where f.read_state = 'skipped'),
        'failed', count(*) filter (where f.read_state = 'failed'),
        'uploaded', count(*) filter (where f.source = 'upload'),
        'from_email', count(*) filter (where f.source = 'email'),
        'from_texts', count(*) filter (where f.source = 'text'))
      from files f where f.created_at >= p_since and (p_org is null or f.org_id = p_org)),
    'skip_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r, 'n', n) order by n desc) from (
        select left(coalesce(f.read_error, 'no reason'), 80) r, count(*) n from files f
         where f.read_state = 'skipped' and f.created_at >= p_since and (p_org is null or f.org_id = p_org)
         group by 1 order by 2 desc limit 5) s), '[]'::jsonb),
    'reader', coalesce((select jsonb_agg(row_to_json(r)::jsonb) from (
        select r.org_id, count(*) as runs,
          count(*) filter (where r.outcome = 'named') as named,
          count(*) filter (where r.outcome in ('proposed', 'filed')) as suggested,
          count(*) filter (where r.outcome in ('unchanged', 'summarized', 'no_words')) as unchanged,
          count(*) filter (where r.outcome in ('model_error', 'failed', 'abandoned')) as errors,
          percentile_cont(0.5) within group (order by extract(epoch from (r.finished_at - r.started_at)))
             filter (where r.finished_at is not null) as median_s,
          (select count(*) from sc_enrich_due d where d.org_id = r.org_id) as queue
        from contact_enrich_runs r where r.started_at >= p_since and (p_org is null or r.org_id = p_org)
        group by r.org_id) r), '[]'::jsonb),
    'workers', coalesce((select jsonb_agg(jsonb_build_object('worker', h.worker, 'status', h.status, 'detail', h.detail, 'at', h.ticked_at)
        order by h.worker) from sc_worker_heartbeats h), '[]'::jsonb)
  );
end $$;

-- The last failures across every pipeline. A Quo event carries its id, so
-- it can be replayed.
create or replace function public.sc_admin_failures(p_org uuid, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return coalesce((select jsonb_agg(row_to_json(f)::jsonb order by f.at desc) from (
    select * from (
      select q.received_at as at, q.org_id, 'Calls & texts' as pipeline, left(q.projection_error, 300) as error, q.id as replay_id
        from quo_events q where q.projection_error is not null and (p_org is null or q.org_id = p_org)
      union all
      select d.created_at, d.org_id, 'Calls & texts', d.defect || coalesce(': ' || left(d.detail::text, 200), ''), null
        from projection_defects d where d.resolved_at is null and (p_org is null or d.org_id = p_org)
      union all
      select ev.received_at, ev.org_id, 'Email', left(ev.projection_error, 300), null
        from email_events ev where ev.projection_error is not null and (p_org is null or ev.org_id = p_org)
      union all
      select b.updated_at, b.org_id, 'Bids', b.state || coalesce(': ' || left(b.error, 300), ''), null
        from bid_packages b where b.error is not null and b.undone_at is null and (p_org is null or b.org_id = p_org)
      union all
      select coalesce(f.read_at, f.created_at), f.org_id, 'File reader', coalesce(f.read_state, '') || coalesce(': ' || left(f.read_error, 200), ''), null
        from files f where f.read_state = 'failed' and (p_org is null or f.org_id = p_org)
      union all
      select r.started_at, r.org_id, 'Contact reader', r.outcome || coalesce(': ' || left(r.note, 200), ''), null
        from contact_enrich_runs r where r.outcome in ('model_error', 'failed', 'abandoned') and (p_org is null or r.org_id = p_org)
    ) u order by at desc limit greatest(1, least(p_limit, 200))
  ) f), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ Dusty

create or replace function public.sc_admin_dusty(p_org uuid, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return jsonb_build_object(
    'agreement', coalesce((select jsonb_agg(jsonb_build_object('org_id', a.org_id, 'bucket', a.bucket,
        'guesses', a.guesses, 'agreed', a.agreed, 'streak', a.streak))
      from sc_bucket_agreement a where (p_org is null or a.org_id = p_org)), '[]'::jsonb),
    'auto_moved', (select count(*) from contacts c where c.auto_classify_blocked_at >= now() - interval '30 days' and (p_org is null or c.org_id = p_org)),
    'auto_filed', (select count(*) from contacts c where c.auto_classified_at >= now() - interval '30 days' and (p_org is null or c.org_id = p_org)),
    'names_kept', (select count(*) from contact_name_claims n where n.claim_type = 'self_identification' and n.status = 'accepted'
                     and n.created_at >= now() - interval '30 days' and (p_org is null or n.org_id = p_org)),
    'names_undone', (select count(*) from contact_name_claims n where n.claim_type = 'self_identification' and n.status = 'rejected'
                     and n.created_at >= now() - interval '30 days' and (p_org is null or n.org_id = p_org)),
    'questions', (select count(*) from dusty_messages m where m.role = 'user' and m.created_at >= p_since and (p_org is null or m.org_id = p_org)),
    'answers', (select count(*) from dusty_messages m where m.role = 'assistant' and m.created_at >= p_since and (p_org is null or m.org_id = p_org)),
    'chats', (select count(distinct m.conversation_id) from dusty_messages m where m.created_at >= p_since and (p_org is null or m.org_id = p_org)),
    'askers', (select count(distinct c.user_id) from dusty_messages m join dusty_conversations c on c.id = m.conversation_id
                 where m.role = 'user' and m.created_at >= p_since and (p_org is null or m.org_id = p_org)),
    'by_context', coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'n', n) order by n desc) from (
        select coalesce(c.context_kind, 'cold') k, count(*) n from dusty_messages m join dusty_conversations c on c.id = m.conversation_id
         where m.role = 'user' and m.created_at >= p_since and (p_org is null or m.org_id = p_org) group by 1) s), '[]'::jsonb),
    'per_org', coalesce((select jsonb_agg(jsonb_build_object('org_id', o, 'questions', n)) from (
        select m.org_id o, count(*) n from dusty_messages m
         where m.role = 'user' and m.created_at >= p_since and (p_org is null or m.org_id = p_org) group by m.org_id) s), '[]'::jsonb),
    'reader_errors', (select count(*) from contact_enrich_runs r where r.outcome = 'model_error' and r.started_at >= p_since and (p_org is null or r.org_id = p_org)),
    'reader_runs', (select count(*) from contact_enrich_runs r where r.started_at >= p_since and (p_org is null or r.org_id = p_org)),
    'files_read', (select count(*) from files f where f.read_at >= p_since and f.read_state = 'read' and (p_org is null or f.org_id = p_org)),
    'dreams', (select count(*) from dusty_dreams d where d.created_at >= p_since and (p_org is null or d.org_id = p_org))
  );
end $$;

-- ------------------------------------------------------------ usage

-- What each company made in the range, from the tables that hold the work
-- itself (page views are not recorded), and the money funnel as counts per
-- step in the range (not a cohort).
create or replace function public.sc_admin_usage(p_org uuid, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return jsonb_build_object(
    'made', coalesce((select jsonb_agg(row_to_json(x)::jsonb) from (
      select o.id as org_id,
        (select count(*) from contacts c where c.org_id = o.id and c.classification_confirmed_at >= p_since) as threads_filed,
        (select count(*) from messages m where m.org_id = o.id and m.direction = 'outbound' and m.channel = 'sms' and m.occurred_at >= p_since) as texts_sent,
        (select count(*) from jobs j where j.org_id = o.id and j.created_at >= p_since) as jobs,
        (select count(*) from takeoff_measurements t where t.org_id = o.id and t.created_at >= p_since) as takeoffs,
        (select count(*) from estimate_line_items l where l.org_id = o.id and l.created_at >= p_since) as budget_lines,
        (select count(*) from job_proposals p where p.org_id = o.id and p.finalized_at >= p_since) as proposals,
        (select count(*) from documents d where d.org_id = o.id and d.sent_at >= p_since) as proposals_sent,
        (select count(*) from cost_items c where c.org_id = o.id and c.updated_at >= p_since) as price_book,
        (select count(*) from contacts c where c.org_id = o.id and c.contact_type = 'vendor' and c.classification_confirmed_at >= p_since) as vendors,
        (select count(*) from files f where f.org_id = o.id and f.source = 'upload' and f.created_at >= p_since) as files,
        (select count(*) from dusty_messages m where m.org_id = o.id and m.role = 'user' and m.created_at >= p_since) as dusty,
        (select count(*) from contact_notes n where n.org_id = o.id and n.created_at >= p_since) as notes,
        (select count(*) from customers c where c.org_id = o.id and c.created_at >= p_since) as customers,
        (select count(*) from roadmap_items r where r.created_org_id = o.id and r.created_at >= p_since) as feedback
      from orgs o where p_org is null or o.id = p_org) x), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'inbound', (select count(distinct m.contact_id) from messages m where m.direction = 'inbound' and m.occurred_at >= p_since and (p_org is null or m.org_id = p_org)),
      'customers', (select count(*) from contacts c where c.contact_type = 'customer' and coalesce(c.classification_confirmed_at, c.auto_classified_at) >= p_since and (p_org is null or c.org_id = p_org)),
      'jobs', (select count(*) from jobs j where j.created_at >= p_since and (p_org is null or j.org_id = p_org)),
      'priced', (select count(distinct e.job_id) from estimate_line_items l join estimates e on e.id = l.estimate_id
                  where l.created_at >= p_since and (p_org is null or l.org_id = p_org)),
      'sent', (select count(distinct d.job_id) from documents d where d.sent_at >= p_since and (p_org is null or d.org_id = p_org)),
      'opened', (select count(distinct d.job_id) from documents d where d.first_viewed_at >= p_since and (p_org is null or d.org_id = p_org)),
      'won', (select count(*) from jobs j where j.won_at >= p_since and (p_org is null or j.org_id = p_org))),
    'active', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'active', active, 'total', total)) from (
      select m.role, count(*) total,
        count(*) filter (where u.last_sign_in_at >= p_since or exists (
          select 1 from dusty_messages dm join dusty_conversations dc on dc.id = dm.conversation_id
           where dc.user_id = m.user_id and dm.created_at >= p_since)) active
      from org_members m join auth.users u on u.id = m.user_id where p_org is null or m.org_id = p_org group by m.role) r), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------ platform

create or replace function public.sc_admin_platform()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
begin
  perform sc_admin_check();
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'bytes', b, 'objects', n) order by b desc) from (
       select bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) b, count(*) n from storage.objects group by bucket_id) s), '[]'::jsonb),
    'migrations', coalesce((select jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version desc) from (
       select version, name from supabase_migrations.schema_migrations order by version desc limit 12) m), '[]'::jsonb)
  );
end $$;

create or replace function public.sc_admin_log(p_org uuid, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sc_admin_check();
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'admin', a.admin_name, 'action', a.action,
      'org_id', a.org_id, 'detail', a.detail, 'reason', a.reason, 'before', a.before, 'after', a.after) order by a.created_at desc)
    from (select * from admin_audit where p_org is null or org_id = p_org order by created_at desc limit greatest(1, least(p_limit, 500))) a), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ writes

create or replace function public.sc_admin_replay(p_event uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev quo_events; err text;
begin
  perform sc_admin_check();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'give a reason' using errcode = '22023'; end if;
  select * into ev from quo_events where id = p_event;
  if not found then raise exception 'event not found'; end if;
  if ev.contact_id is not null then
    ev.contact_id := coalesce((select c.merged_into_contact_id from contacts c where c.id = ev.contact_id), ev.contact_id);
  end if;
  begin
    perform sc_project_raw_event(ev);
  exception when others then
    err := sqlstate || ': ' || sqlerrm;
  end;
  if err is null then
    update quo_events set projection_error = null, projected_at = coalesce(projected_at, now()) where id = p_event;
    update projection_defects set resolved_at = now()
      where raw_event_id = p_event and defect = 'projection_exception' and resolved_at is null;
  else
    update quo_events set projection_error = err where id = p_event;
  end if;
  perform sc_admin_audit('Replayed event', ev.org_id, ev.event_type || ' · ' || left(p_event::text, 8), p_reason,
    jsonb_build_object('error', ev.projection_error), jsonb_build_object('ok', err is null, 'error', err));
  return jsonb_build_object('ok', err is null, 'error', err);
end $$;

create or replace function public.sc_admin_feedback(p_item uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r roadmap_items;
begin
  perform sc_admin_check();
  select * into r from roadmap_items where id = p_item;
  if r.id is null then raise exception 'item not found'; end if;
  perform sc_roadmap_admin(p_item, p_status, null, null, null);
  perform sc_admin_audit(case p_status when 'declined' then 'Feedback not planned' else 'Published feedback' end,
    r.created_org_id, left(r.title, 120), p_reason, jsonb_build_object('status', r.status), jsonb_build_object('status', p_status));
end $$;

create or replace function public.sc_admin_create_org(p_name text, p_slug text, p_owner_email text, p_plan text, p_reason text)
returns table (org_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_plan text := coalesce(nullif(lower(btrim(p_plan)), ''), 'solo');
  v_org uuid; v_token text; v_exp timestamptz;
begin
  perform sc_admin_check();
  if length(v_name) not between 1 and 120 then raise exception 'Give the company a name.' using errcode = '22023'; end if;
  if v_slug !~ '^[a-z0-9]{2,30}$' then raise exception 'The address takes 2–30 letters and numbers.' using errcode = '22023'; end if;
  if v_slug in ('app', 'www', 'api', 'admin', 'mail', 'login', 'auth', 'scopecrete', 'staging', 'preview') then
    raise exception '% is kept for ScopeCrete itself.', v_slug using errcode = '22023';
  end if;
  if exists (select 1 from orgs where slug = v_slug) then raise exception '%.app.scopecrete.ai is taken.', v_slug using errcode = '23505'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'That email doesn''t look right.' using errcode = '22023'; end if;
  if v_plan not in ('solo', 'growth', 'pro', 'enterprise') then raise exception 'Unknown plan.' using errcode = '22023'; end if;
  insert into orgs (name, slug, plan_tier, notification_channel) values (v_name, v_slug, v_plan, 'in_app') returning id into v_org;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into org_invites (org_id, email, role, token_hash, invited_by)
    values (v_org, v_email, 'owner', encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
    returning org_invites.expires_at into v_exp;
  insert into org_audit (org_id, user_id, action, old_value, new_value)
    values (v_org, auth.uid(), 'member_invited', null, v_email || ' as owner');
  perform sc_admin_audit('Created company', v_org, v_name || ' · ' || v_slug || ' · ' || v_plan, p_reason,
    null, jsonb_build_object('slug', v_slug, 'plan', v_plan, 'owner', v_email));
  return query select v_org, v_token, v_exp;
end $$;

-- ------------------------------------------------------------ grants

do $$
declare f text;
begin
  foreach f in array array[
    'sc_admin_check()', 'sc_admin_audit(text,uuid,text,text,jsonb,jsonb)', 'sc_admin_companies(timestamptz)',
    'sc_admin_people(uuid)', 'sc_admin_pipelines(uuid,timestamptz)', 'sc_admin_failures(uuid,int)',
    'sc_admin_dusty(uuid,timestamptz)', 'sc_admin_usage(uuid,timestamptz)', 'sc_admin_platform()',
    'sc_admin_log(uuid,int)', 'sc_admin_replay(uuid,text)', 'sc_admin_feedback(uuid,text,text)',
    'sc_admin_create_org(text,text,text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- sc_admin_audit is called by the other functions; nobody else needs it directly.
revoke execute on function public.sc_admin_audit(text,uuid,text,text,jsonb,jsonb) from authenticated;
