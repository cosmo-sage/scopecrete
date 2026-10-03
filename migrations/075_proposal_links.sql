-- 075 — a proposal the customer opens by link, and every time they open it
-- (Coy, 2026-10-03: "Mark final should be changed to: 'Preview' … the preview
-- of the proposal that the customer would see when I send it. And I should
-- have the option to send the proposal via text and email. and I also want to
-- be able to track every time the customer views the proposal … hosted on the
-- cloud").
--
-- `documents` / `document_events` (empty since the first schema — the
-- placeholder for sending quotes with view tracking) carry it. A sent proposal
-- is one `documents` row: doc_type 'quote', the frozen `job_proposals` version
-- it shows (`proposal_id`), a random `token` (the link), and `assets` — the
-- storage paths of what the page shows beside the words (logo, cover photo,
-- each area's map and photos), frozen when it was sent — and `shown`, the
-- customer's copy of that version: the words, the areas and the prices they
-- see, built by the app from the snapshot WITHOUT the cost, overhead, profit,
-- margin, hidden lines or anything else that is Coy's alone
-- (publicSnapshot(), src/lib/proposal-links.ts, tested). The link returns
-- `shown`, never the snapshot.
--
-- ScopeCrete sends nothing (§10): the link goes out from Coy's own phone or
-- email (sms: / mailto:), and `sent_via` records which he picked.
--
-- The customer is not signed in. `sc_shared_proposal(token)` is the ONE door:
-- SECURITY DEFINER, it returns only the frozen snapshot behind a live link and
-- logs a 'viewed' event — unless the reader is a member of the org (Coy
-- checking his own link is not a view). Anon can execute it and nothing else
-- here; anon still has no grant on any table. Storage: anon may read an object
-- only when a live link lists its path (`sc_shared_asset`).

alter table public.documents
  add column if not exists proposal_id uuid references public.job_proposals(id) on delete set null,
  add column if not exists assets jsonb not null default '{}'::jsonb,
  add column if not exists shown jsonb,
  add column if not exists sent_via text[] not null default '{}',
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists created_by uuid;

create index if not exists documents_proposal_idx on public.documents (org_id, proposal_id);

revoke all on public.documents, public.document_events from anon;

-- A proposal link always shows a FINAL version of a proposal on its own job.
create or replace function public.sc_documents_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.proposal_id is not null then
    if not exists (select 1 from job_proposals p where p.id = new.proposal_id and p.org_id = new.org_id
                     and p.status = 'final' and p.snapshot is not null and (new.job_id is null or p.job_id = new.job_id)) then
      raise exception 'a proposal link needs a final proposal on its job';
    end if;
  end if;
  if new.token is null or length(new.token) < 24 then raise exception 'token too short'; end if;
  return new;
end $$;
create trigger documents_guard before insert or update of proposal_id, token, job_id on public.documents
  for each row execute function public.sc_documents_guard();

-- The customer's door.
create or replace function public.sc_shared_proposal(p_token text, p_ip_hash text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documents; p job_proposals; own boolean; org_name text;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into d from documents where token = p_token and doc_type = 'quote' and proposal_id is not null;
  if not found then return null; end if;
  select name into org_name from orgs where id = d.org_id;
  if d.revoked_at is not null or d.status = 'void' or (d.expires_at is not null and d.expires_at < now()) then
    return jsonb_build_object('gone', true, 'org_name', org_name);
  end if;
  select * into p from job_proposals where id = d.proposal_id and status = 'final';
  if not found or d.shown is null then return jsonb_build_object('gone', true, 'org_name', org_name); end if;
  own := d.org_id = any(get_user_org_ids());
  if not own then
    insert into document_events (org_id, document_id, event, ip_hash, user_agent)
      values (d.org_id, d.id, 'viewed', left(p_ip_hash, 80), left(p_ua, 300));
    update documents set view_count = view_count + 1, last_viewed_at = now(),
      first_viewed_at = coalesce(first_viewed_at, now()),
      status = case when status in ('draft', 'sent') then 'viewed' else status end
      where id = d.id;
  end if;
  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'version', p.version,
    'shown', d.shown, 'assets', d.assets, 'sent_at', d.sent_at);
end $$;
revoke all on function public.sc_shared_proposal(text, text, text) from public;
grant execute on function public.sc_shared_proposal(text, text, text) to anon, authenticated;

-- What a live link lets a stranger read from storage: only the paths it lists.
create or replace function public.sc_shared_asset(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents d
     where d.proposal_id is not null and d.revoked_at is null and d.status <> 'void'
       and (d.expires_at is null or d.expires_at > now())
       and split_part(p_name, '/', 1) = d.org_id::text
       and d.assets -> 'paths' ? p_name);
$$;
revoke all on function public.sc_shared_asset(text) from public;
grant execute on function public.sc_shared_asset(text) to anon, authenticated;

create policy shared_proposal_assets on storage.objects for select to anon
  using (bucket_id in ('job-files', 'org-branding') and public.sc_shared_asset(name));
