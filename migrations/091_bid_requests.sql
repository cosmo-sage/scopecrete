-- 091 — bid requests to subs and suppliers, by link (Claude Design, Vendors
-- v2, 2026-10-08: "Find subs by trade. Pick several. One bid request goes to
-- all of them.")
--
-- A vendor's trades and crew size live on their contact (a vendor IS a
-- contact filed vendor — §2c; there is no vendors table). Additive.
--
-- A bid request is one job, the scopes Coy ticked and the packet he chose.
-- `scopes` is the vendor's copy, frozen when it was sent and built by the app
-- WITHOUT costs, prices or margins (shownScopes(), src/lib/bids.ts, tested):
-- each scope's name and size, its lines with quantity and unit, and whether
-- the line's material is supplied by the org. `packet` is what else they see
-- (address and access, dates, which photos, plans and aerials); `assets.paths`
-- lists the storage paths a live link may read, as 075 does for proposals.
--
-- Each vendor gets their own row in bid_request_recipients with their own
-- random `token` — scopecrete.ai/b/<token>, no login. ScopeCrete sends a text
-- only on Coy's tap, through Quo (§6 Texts send through Quo); email opens in
-- his own mail app (§10). `sent_via` records which.
--
-- The vendor is not signed in. Two SECURITY DEFINER doors, and anon may run
-- only these:
--   sc_shared_bid(token)  the vendor's copy of a live link, logging the opening
--                         (not when the reader is in the org);
--   sc_answer_bid(token, total, lines, note)
--                         their price — a total and/or a price per line, a
--                         note. Written on their row, and as an internal note
--                         on the vendor (their thread), and the follow-up next
--                         step Coy set is marked done. They may change it while
--                         the link is live; each answer is counted.
-- Storage: anon may read an object only when a live bid link lists its path.

alter table public.contacts
  add column if not exists trades text[] not null default '{}',
  add column if not exists crew_size integer;
alter table public.contacts drop constraint if exists contacts_crew_size_check;
alter table public.contacts add constraint contacts_crew_size_check check (crew_size is null or crew_size between 1 and 500);
alter table public.contacts drop constraint if exists contacts_trades_check;
alter table public.contacts add constraint contacts_trades_check check (cardinality(trades) <= 12);
create index if not exists contacts_trades_idx on public.contacts using gin (trades);

create table if not exists public.bid_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  price_mode text not null check (price_mode in ('lump', 'per_item', 'their_rates')),
  price_by date,
  pour_date date,
  scopes jsonb not null default '[]'::jsonb check (jsonb_typeof(scopes) = 'array'),
  packet jsonb not null default '{}'::jsonb check (jsonb_typeof(packet) = 'object'),
  assets jsonb not null default '{"paths": []}'::jsonb,
  note text check (note is null or length(note) <= 2000),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists bid_requests_job_idx on public.bid_requests (org_id, job_id, created_at desc);

create table if not exists public.bid_request_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bid_request_id uuid not null references public.bid_requests(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null default 'text' check (channel in ('text', 'email', 'both')),
  token text not null unique check (length(token) >= 24),
  first_name text,
  rates jsonb,
  sent_at timestamptz,
  sent_via text[] not null default '{}',
  follow_up_task_id uuid references public.contact_tasks(id) on delete set null,
  view_count integer not null default 0,
  opened_at timestamptz,
  last_viewed_at timestamptz,
  answered_at timestamptz,
  answer_count integer not null default 0,
  price_total numeric check (price_total is null or (price_total >= 0 and price_total < 100000000)),
  price_lines jsonb,
  answer_note text check (answer_note is null or length(answer_note) <= 2000),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bid_request_id, contact_id)
);
create index if not exists bid_recipients_contact_idx on public.bid_request_recipients (org_id, contact_id, created_at desc);
create index if not exists bid_recipients_request_idx on public.bid_request_recipients (bid_request_id);

-- Every row on one org: the job, the request, the vendor.
create or replace function public.sc_bid_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_table_name = 'bid_requests' then
    if not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
      raise exception 'that job is not in this org';
    end if;
  else
    if not exists (select 1 from bid_requests b where b.id = new.bid_request_id and b.org_id = new.org_id) then
      raise exception 'that bid request is not in this org';
    end if;
    if not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
      raise exception 'that vendor is not in this org';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bid_requests_guard on public.bid_requests;
create trigger bid_requests_guard before insert or update of org_id, job_id on public.bid_requests
  for each row execute function public.sc_bid_guard();
drop trigger if exists bid_recipients_guard on public.bid_request_recipients;
create trigger bid_recipients_guard before insert or update of org_id, bid_request_id, contact_id on public.bid_request_recipients
  for each row execute function public.sc_bid_guard();

alter table public.bid_requests enable row level security;
alter table public.bid_request_recipients enable row level security;
revoke all on public.bid_requests, public.bid_request_recipients from anon, authenticated;
grant select, insert on public.bid_requests to authenticated;
grant select, insert on public.bid_request_recipients to authenticated;
-- Members mark a link sent, or turn it off; the answer is the vendor's alone.
grant update (sent_at, sent_via, follow_up_task_id, revoked_at) on public.bid_request_recipients to authenticated;

create policy bid_requests_member_read on public.bid_requests
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy bid_requests_member_insert on public.bid_requests
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
create policy bid_recipients_member_read on public.bid_request_recipients
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy bid_recipients_member_insert on public.bid_request_recipients
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
create policy bid_recipients_member_update on public.bid_request_recipients
  for update to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

-- The vendor's door: their copy of a live link.
create or replace function public.sc_shared_bid(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; b bid_requests; own boolean; org_name text; job_title text;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into r from bid_request_recipients where token = p_token;
  if not found then return null; end if;
  select name into org_name from orgs where id = r.org_id;
  if r.revoked_at is not null then return jsonb_build_object('gone', true, 'org_name', org_name); end if;
  select * into b from bid_requests where id = r.bid_request_id;
  select title into job_title from jobs where id = b.job_id;
  own := coalesce(r.org_id = any(get_user_org_ids()), false);
  if not own then
    update bid_request_recipients set view_count = view_count + 1, last_viewed_at = now(),
      opened_at = coalesce(opened_at, now()) where id = r.id;
  end if;
  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'job_title', job_title,
    'first_name', r.first_name, 'price_mode', b.price_mode, 'price_by', b.price_by, 'pour_date', b.pour_date,
    'scopes', b.scopes, 'packet', b.packet, 'assets', b.assets, 'note', b.note, 'rates', r.rates,
    'answer', case when r.answered_at is null then null else jsonb_build_object('at', r.answered_at,
      'total', r.price_total, 'lines', r.price_lines, 'note', r.answer_note) end);
end $$;
revoke all on function public.sc_shared_bid(text) from public;
grant execute on function public.sc_shared_bid(text) to anon, authenticated;

-- Their price. Checked here, whatever the page sent.
create or replace function public.sc_answer_bid(p_token text, p_total numeric, p_lines jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; b bid_requests; job_title text; who text; body text; clean jsonb := '[]'::jsonb; x jsonb; n int := 0;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'not a bid link'; end if;
  select * into r from bid_request_recipients where token = p_token for update;
  if not found or r.revoked_at is not null then raise exception 'this bid link is turned off'; end if;
  if coalesce(r.org_id = any(get_user_org_ids()), false) then raise exception 'this is your own link — the vendor answers it'; end if;
  if r.answer_count >= 20 then raise exception 'this bid has been answered too many times — call them'; end if;
  if p_total is not null and (p_total < 0 or p_total >= 100000000) then raise exception 'that total isn''t right'; end if;
  if p_note is not null and length(p_note) > 2000 then raise exception 'the note is too long'; end if;
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for x in select * from jsonb_array_elements(p_lines) loop
      n := n + 1;
      exit when n > 200;
      if jsonb_typeof(x) = 'object' and jsonb_typeof(x -> 'price') = 'number'
         and (x ->> 'price')::numeric >= 0 and (x ->> 'price')::numeric < 10000000 then
        clean := clean || jsonb_build_array(jsonb_build_object('key', left(x ->> 'key', 80), 'name', left(x ->> 'name', 200),
          'unit', left(x ->> 'unit', 20), 'qty', case when jsonb_typeof(x -> 'qty') = 'number' then x -> 'qty' else null end,
          'price', x -> 'price'));
      end if;
    end loop;
  end if;
  if p_total is null and jsonb_array_length(clean) = 0 then raise exception 'send a price — a total or a price per line'; end if;
  select * into b from bid_requests where id = r.bid_request_id;
  select title into job_title from jobs where id = b.job_id;
  update bid_request_recipients set answered_at = now(), answer_count = answer_count + 1, price_total = p_total,
    price_lines = case when jsonb_array_length(clean) > 0 then clean else null end,
    answer_note = nullif(btrim(p_note), '') where id = r.id;
  -- Their thread: an internal note on the vendor, on the job.
  select coalesce(nullif(btrim(name), ''), company_name, 'The vendor') into who from contacts where id = r.contact_id;
  body := 'Bid answered — ' || who || coalesce(' priced ' || job_title, '')
    || case when p_total is not null then ': $' || to_char(p_total, 'FM999,999,990.00') else ': a price per line' end
    || case when r.answer_count > 0 then ' (changed)' else '' end
    || coalesce('. Their note: ' || nullif(btrim(p_note), ''), '');
  insert into contact_notes (org_id, contact_id, job_id, body) values (r.org_id, r.contact_id, b.job_id, left(body, 3000));
  if r.follow_up_task_id is not null then
    update contact_tasks set status = 'done', done_at = now() where id = r.follow_up_task_id and status = 'open';
  end if;
  return jsonb_build_object('ok', true, 'at', now());
end $$;
revoke all on function public.sc_answer_bid(text, numeric, jsonb, text) from public;
grant execute on function public.sc_answer_bid(text, numeric, jsonb, text) to anon, authenticated;

-- What a live bid link lets a stranger read from storage: only the paths it lists.
create or replace function public.sc_shared_bid_asset(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bid_request_recipients r join bid_requests b on b.id = r.bid_request_id
     where r.revoked_at is null
       and split_part(p_name, '/', 1) = b.org_id::text
       and b.assets -> 'paths' ? p_name);
$$;
revoke all on function public.sc_shared_bid_asset(text) from public;
grant execute on function public.sc_shared_bid_asset(text) to anon, authenticated;

create policy shared_bid_assets on storage.objects for select to anon
  using (bucket_id = 'job-files' and public.sc_shared_bid_asset(name));
