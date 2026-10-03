-- 072 — an address a person gives is kept, and Dusty asks Coy about them
-- (Coy, 2026-10-03: "If an address is being given by a new contact it should
-- be recorded even if there isn't enough context yet to determine if that
-- person is a customer or vendor. Either way if an address is given then it
-- should at least be marked as an important contact for dusty to ask me about.")
--
-- 071 put an address on a CUSTOMER only. Someone not yet filed has no customer,
-- so their address was kept nowhere but the reader's proposal. Now, whenever
-- the reader hears an address that the person themselves texted or said on a
-- call (sc_contact_heard_address — the house number and street word in their
-- own words, 071's rule):
--   * it is written on the CONTACT when the contact has none
--     (contacts.address, city, state, zip; address_source 'text' or 'call' —
--     a call's spelling is the transcript's, and the page says to check it);
--     never over an address already there;
--   * unless Coy has filed them himself (or they are spam), Dusty adds a next
--     step for him, due that day — "Gave an address — … Who are they? File
--     them." (contact_tasks, source 'dusty') — so it shows on the activity
--     line's reminders, their page and Dusty's context. Once per address
--     (title_key, made from the title), so a dismissed ask is never re-added.
-- And when a contact gets a customer (filed customer later), 071's rule runs
-- for that customer, so a texted address follows them onto it.
--
-- Additive: two columns, three functions, one trigger. RLS unchanged.

alter table public.contacts add column if not exists address_source text
  check (address_source is null or address_source in ('text', 'call', 'coy'));
alter table public.contacts add column if not exists address_heard_at timestamptz;
comment on column public.contacts.address_source is
  'Where contacts.address came from: text (they texted it), call (heard in a call transcript — check the spelling), coy (typed or applied by Coy). Null: older rows.';

-- The address one person gave, and where: 'text' beats 'call'. Invoker: RLS decides.
create or replace function public.sc_contact_heard_address(p_contact uuid)
returns table (hint text, said_in text)
language sql stable security invoker set search_path = public as $$
  with heard as (
    select pr.site_hint, pr.created_at, regexp_match(pr.site_hint, '^\s*(\d{2,6})\s+([A-Za-z0-9]+)') as m
      from contact_proposals pr
     where pr.contact_id = p_contact and pr.site_hint ~ '^\s*\d{2,6}\s+\S'
     order by pr.created_at desc limit 1
  ), said as (
    select h.site_hint, h.created_at,
      case
        when exists (select 1 from messages ms where ms.contact_id = p_contact and ms.direction = 'inbound'
                       and ms.body_text ~ ('\m' || h.m[1] || '\M') and ms.body_text ilike '%' || h.m[2] || '%') then 'text'
        when exists (select 1 from call_artifacts ca join messages ms on ms.id = ca.message_id
                       where ms.contact_id = p_contact and ca.kind = 'transcript'
                       and ca.content ~ ('\m' || h.m[1] || '\M') and ca.content ilike '%' || h.m[2] || '%') then 'call'
      end as said_in
      from heard h
  )
  select site_hint, said_in from said where said_in is not null;
$$;
revoke all on function public.sc_contact_heard_address(uuid) from public, anon;
grant execute on function public.sc_contact_heard_address(uuid) to authenticated;

create or replace function public.sc_contact_address_from_words(p_contact uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  c record; h record; a record; k text;
begin
  select ct.id, ct.org_id, ct.address, ct.contact_type, ct.classification_confirmed_at, ct.merged_into_contact_id
    into c from contacts ct where ct.id = p_contact;
  if c.id is null or c.merged_into_contact_id is not null then return false; end if;
  select * into h from sc_contact_heard_address(c.id);
  if h.hint is null then return false; end if;
  select * into a from sc_parse_us_address(h.hint);
  if a.line1 is null then return false; end if;
  -- Kept on the person when they have no address yet.
  update contacts set address = a.formatted, city = a.city, state = a.state, zip = a.zip,
         address_source = h.said_in, address_heard_at = now()
   where id = c.id and nullif(btrim(coalesce(address, '')), '') is null;
  -- Dusty asks Coy about anyone he hasn't filed himself.
  if c.classification_confirmed_at is null and coalesce(c.contact_type, '') <> 'spam' then
    -- title_key is made from the title (generated); this address's ask, open or not, is never re-added.
    k := regexp_replace(lower(a.line1), '[^a-z0-9]+', '', 'g');
    if not exists (select 1 from contact_tasks t where t.contact_id = c.id and t.title_key like 'gaveanaddress%' || k || '%') then
      insert into contact_tasks (org_id, contact_id, title, due_on, source, evidence_quote)
      values (c.org_id, c.id,
              left('Gave an address — ' || a.formatted || case when h.said_in = 'call' then ' (heard on a call — check the spelling)' else ' (texted)' end
                   || '. Who are they? File them.', 200),
              (now() at time zone 'America/Chicago')::date, 'dusty', left(h.hint, 500));
    end if;
  end if;
  return true;
end $$;
revoke all on function public.sc_contact_address_from_words(uuid) from public, anon, authenticated;

-- The reader heard an address: the person keeps it (072), and their customer gets it if texted (071).
create or replace function public.sc_contact_proposals_address()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.site_hint is not null then
    perform sc_contact_address_from_words(new.contact_id);
    perform sc_customer_address_from_words(new.contact_id);
  end if;
  return null;
end $$;
revoke all on function public.sc_contact_proposals_address() from public, anon, authenticated;

-- A contact filed customer later: their texted address follows them onto the customer.
create or replace function public.sc_contacts_customer_address()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sc_customer_address_from_words(new.id);
  return null;
end $$;
revoke all on function public.sc_contacts_customer_address() from public, anon, authenticated;

create trigger contacts_customer_address after update of customer_id on public.contacts
  for each row when (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
  execute function public.sc_contacts_customer_address();

-- Backfill: everyone the reader has already heard give an address.
select count(*) filter (where public.sc_contact_address_from_words(ct.id)) as heard
  from public.contacts ct
 where ct.merged_into_contact_id is null
   and exists (select 1 from public.contact_proposals pr where pr.contact_id = ct.id and pr.site_hint is not null);
