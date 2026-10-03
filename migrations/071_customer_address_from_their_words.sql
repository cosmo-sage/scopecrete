-- 071 — the customer's address, from their own words (Coy, 2026-10-03: "why
-- didn't the system catch the address for Johnette and add it to the customer
-- automatically? it was clearly in the text message" — and: "pull it from both
-- text messages … and from the phone call transcript. With the transcript it's
-- easier to misspell addresses, so … it needs to use the same auto complete
-- features that I would want to use when entering an address").
--
-- The reader (enrich-contacts) has always heard addresses — `contact_proposals.
-- site_hint` — and sc_customer_job_for() put them on the automatic JOB. Nothing
-- put them on the CUSTOMER, so Johnette's customer page had no address while
-- her job had the address she texted.
--
-- An address goes onto a customer without asking ONLY when the customer has no
-- address at all (never over one Coy typed or any other) and the reader heard
-- one that starts with a house number, and then:
--   * TEXTED by them — the house number and the street's first word are in an
--     inbound text from that person: written here, by the database, as typed
--     (the street up to the first ';' or '(' — notes stay out; city, state, zip
--     only when they read as such), address_source = 'contact' ("check it").
--   * SAID on a call — in a transcript only: NOT written here. The app checks it
--     against Mapbox (src/lib/address-server.ts) and writes Mapbox's spelling
--     (address_source = 'geocode') only on a sure match of the house number and
--     street; otherwise the customer page offers Mapbox's match for one tap.
--     `sc_customer_heard_address()` is how the app finds those.
--
-- Additive: three functions and one trigger, no column. RLS unchanged.

create or replace function public.sc_parse_us_address(hint text)
returns table (line1 text, city text, state text, zip text, formatted text)
language plpgsql immutable set search_path = public as $$
declare
  clean text := btrim(regexp_replace(split_part(split_part(coalesce(hint, ''), ';', 1), '(', 1), '\s+', ' ', 'g'), ' ,.');
  parts text[];
  p text;
  st text; zp text; ct text;
begin
  if clean !~ '^\d{2,6} [A-Za-z0-9]' then return; end if;
  parts := regexp_split_to_array(clean, '\s*,\s*');
  line1 := regexp_replace(parts[1], '\.$', '');
  if array_length(parts, 1) >= 2 then
    p := parts[array_length(parts, 1)];
    -- "LA 70816" / "Louisiana 70817" / "LA" / "Louisiana"
    if p ~* '^(la|louisiana)( \d{5}(-\d{4})?)?$' then
      st := 'LA';
      zp := substring(p from '(\d{5})');
      if array_length(parts, 1) >= 3 then ct := parts[array_length(parts, 1) - 1]; end if;
    elsif array_length(parts, 1) = 2 then
      ct := p;
    end if;
    -- A city is capitalised words ("Baton Rouge", "St. Gabriel"), never "south of Delmont Village".
    if ct is not null and ct !~ '^[A-Z][A-Za-z.''-]*( [A-Z][A-Za-z.''-]*)*$' then ct := null; end if;
  end if;
  city := ct; state := st; zip := zp;
  formatted := concat_ws(', ', line1, ct, nullif(concat_ws(' ', st, zp), ''));
  return next;
end $$;

-- The address a customer's people gave, and where they gave it: 'text' (an
-- inbound text from them) beats 'call' (a transcript of a call with them).
-- Only for a customer with no address. Invoker: RLS decides what is read.
create or replace function public.sc_customer_heard_address(p_customer uuid)
returns table (hint text, contact_id uuid, said_in text)
language sql stable security invoker set search_path = public as $$
  with cu as (
    select id from customers
     where id = p_customer and address_line1 is null and address_formatted is null and address_source is null
  ), heard as (
    select distinct on (ct.id) ct.id as contact_id, pr.site_hint, pr.created_at,
           regexp_match(pr.site_hint, '^\s*(\d{2,6})\s+([A-Za-z0-9]+)') as m
      from cu join contacts ct on ct.customer_id = cu.id and ct.merged_into_contact_id is null
      join contact_proposals pr on pr.contact_id = ct.id and pr.site_hint ~ '^\s*\d{2,6}\s+\S'
     order by ct.id, pr.created_at desc
  ), said as (
    select h.site_hint, h.contact_id, h.created_at,
      case
        when exists (select 1 from messages ms where ms.contact_id = h.contact_id and ms.direction = 'inbound'
                       and ms.body_text ~ ('\m' || h.m[1] || '\M') and ms.body_text ilike '%' || h.m[2] || '%') then 'text'
        when exists (select 1 from call_artifacts ca join messages ms on ms.id = ca.message_id
                       where ms.contact_id = h.contact_id and ca.kind = 'transcript'
                       and ca.content ~ ('\m' || h.m[1] || '\M') and ca.content ilike '%' || h.m[2] || '%') then 'call'
      end as said_in
      from heard h
  )
  select site_hint, contact_id, said_in from said where said_in is not null
   order by (said_in = 'text') desc, created_at desc limit 1;
$$;

create or replace function public.sc_customer_address_from_words(p_contact uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  cid uuid; h record; a record;
begin
  select ct.customer_id into cid from contacts ct
   where ct.id = p_contact and ct.merged_into_contact_id is null and ct.customer_id is not null;
  if cid is null then return false; end if;
  select * into h from sc_customer_heard_address(cid);
  -- Only what they typed themselves; a spoken address waits for the map check.
  if h.hint is null or h.said_in <> 'text' then return false; end if;
  select * into a from sc_parse_us_address(h.hint);
  if a.line1 is null then return false; end if;
  update customers set address_line1 = a.line1, city = a.city, state = a.state, zip = a.zip,
         address_formatted = a.formatted, address_source = 'contact', updated_at = now()
   where id = cid and address_line1 is null and address_formatted is null and address_source is null;
  return found;
end $$;

revoke all on function public.sc_parse_us_address(text) from public, anon;
revoke all on function public.sc_customer_heard_address(uuid) from public, anon;
grant execute on function public.sc_customer_heard_address(uuid) to authenticated;
revoke all on function public.sc_customer_address_from_words(uuid) from public, anon, authenticated;

-- Whenever the reader hears an address, the customer gets it if they texted it.
create or replace function public.sc_contact_proposals_address()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.site_hint is not null then perform sc_customer_address_from_words(new.contact_id); end if;
  return null;
end $$;
revoke all on function public.sc_contact_proposals_address() from public, anon, authenticated;

create trigger contact_proposals_address after insert on public.contact_proposals
  for each row execute function public.sc_contact_proposals_address();

-- Backfill: everyone the reader has already heard.
select public.sc_customer_address_from_words(ct.id)
  from public.contacts ct
 where ct.merged_into_contact_id is null and ct.customer_id is not null
   and exists (select 1 from public.contact_proposals pr where pr.contact_id = ct.id and pr.site_hint is not null);
