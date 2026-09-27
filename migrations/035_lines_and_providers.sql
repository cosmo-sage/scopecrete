-- 035 — every line knows its provider; every message knows its line.
--
-- Coy, 2026-09-27: Quo today, maybe his own AI voice stack and more numbers
-- later — all on the same schema. A contact stays keyed by the person's phone
-- number, so someone who calls two of his lines is still one person with one
-- thread; the LINE is a property of each message, not of the contact.
--
--   org_phone_numbers.provider           quo | twilio | telnyx | retell | vapi | own_stack | other
--   org_phone_numbers.provider_number_id the provider's own id for the number
--   org_phone_numbers.default_lead_source a tracking number's source (e.g. the
--                                         number printed on the website)
--   messages.phone_number_id             which of his lines it came in on — the
--                                         column existed, never filled; a
--                                         trigger fills it now, and history is
--                                         backfilled.
--
-- Provider is set only where the data proves it: Main carries 1,466 messages,
-- all projected from Quo. Cell (1 message) and Third (none) stay unknown.
-- messages.provider (per event) is unchanged: it records where each message
-- came from, and the dedupe index (provider, provider_message_id) relies on it.
--
-- Additive: three columns, one trigger, one backfill of an empty column.

alter table public.org_phone_numbers
  add column if not exists provider text
    check (provider is null or provider in ('quo', 'twilio', 'telnyx', 'retell', 'vapi', 'own_stack', 'other')),
  add column if not exists provider_number_id text,
  add column if not exists default_lead_source text
    check (default_lead_source is null or default_lead_source in
      ('website', 'referral', 'gc_invite', 'lead_gen', 'repeat', 'direct', 'other'));

update public.org_phone_numbers p set provider = 'quo'
where p.provider is null
  and exists (select 1 from public.messages m
              where m.org_id = p.org_id and m.provider = 'quo'
                and (m.from_address = p.phone_e164 or m.to_address = p.phone_e164))
  and not exists (select 1 from public.messages m
              where m.org_id = p.org_id and m.provider is distinct from 'quo'
                and (m.from_address = p.phone_e164 or m.to_address = p.phone_e164));

-- Which of the org's lines a message used: whichever address is one of ours.
create or replace function public.sc_messages_set_line()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone_number_id is null then
    select p.id into new.phone_number_id
    from public.org_phone_numbers p
    where p.org_id = new.org_id and p.phone_e164 in (new.from_address, new.to_address)
    order by p.is_primary desc
    limit 1;
  end if;
  return new;
end $$;

drop trigger if exists messages_set_line on public.messages;
create trigger messages_set_line
  before insert or update of from_address, to_address on public.messages
  for each row execute function public.sc_messages_set_line();

update public.messages m set phone_number_id = p.id
from public.org_phone_numbers p
where m.phone_number_id is null
  and p.org_id = m.org_id
  and p.phone_e164 in (m.from_address, m.to_address);
