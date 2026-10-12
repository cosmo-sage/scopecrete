-- 107_provider_accounts.sql
-- Coy, 2026-10-12: "any VoIP service needs to be contained within that
-- organization. So my Quo connection is exclusive to Sacco Enterprises … if I
-- offer … Jeremy Wright a Quo number, if he pays for the service, then it will
-- be scoped to his organization. Just make sure that that database schema is
-- structured properly."
--
-- Today there is one Quo account (Sacco's) and its keys live in env vars:
-- QUO_SIGNING_KEY / QUO_ORG_ID in the quo-intake function, QUO_API_KEY in
-- Vercel. Nothing in the database says whose they are. This makes a phone
-- provider account a row that belongs to exactly one org:
--
--   org_provider_accounts  one connection (a Quo workspace, a Telnyx account …)
--                          owned by one org. Its webhook_token goes in the URL
--                          the provider calls, so intake knows the account —
--                          and so the org — before reading the event, and never
--                          looks a company up by phone number or falls back.
--                          Keys are vault secrets, readable only by the
--                          service role (edge functions); the env keys are
--                          marked as belonging to one account (secrets_from_env,
--                          at most one per provider on the platform).
--   org_phone_numbers      gains provider_account_id. A composite foreign key
--                          (provider_account_id, org_id) → (id, org_id) makes a
--                          line on another company's account impossible.
--
-- Backfill: Sacco's Quo account, secrets_from_env, and Sacco's Quo line on it.
-- A new line marked Quo (or Telnyx …) is put on its company's one connection
-- of that provider by the trigger, so the app needs no change to fill it.
-- Additive: one new table, one nullable column. RLS on the new table: members
-- read their org's accounts (no secrets are in the row); only owners write,
-- and only the label and status — keys and the env mark are set by functions.

create table if not exists public.org_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  provider text not null
    check (provider in ('quo','twilio','telnyx','retell','vapi','own_stack','other')),
  label text not null check (char_length(label) between 1 and 60),
  webhook_token text not null unique
    default encode(extensions.gen_random_bytes(18), 'hex'),
  api_key_secret_id uuid,
  signing_key_secret_id uuid,
  secrets_from_env boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','disconnected')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

-- The env keys belong to one account per provider, platform-wide.
create unique index if not exists org_provider_accounts_one_env
  on public.org_provider_accounts (provider) where secrets_from_env;
create index if not exists org_provider_accounts_org on public.org_provider_accounts (org_id);

alter table public.org_provider_accounts enable row level security;

revoke all on public.org_provider_accounts from anon, authenticated;
grant select on public.org_provider_accounts to authenticated;
grant insert (org_id, provider, label, status) on public.org_provider_accounts to authenticated;
grant update (label, status, updated_at) on public.org_provider_accounts to authenticated;
grant delete on public.org_provider_accounts to authenticated;

create policy org_provider_accounts_read on public.org_provider_accounts
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy org_provider_accounts_owner_insert on public.org_provider_accounts
  for insert to authenticated with check (org_id = any (public.get_user_owner_org_ids()));
create policy org_provider_accounts_owner_update on public.org_provider_accounts
  for update to authenticated
  using (org_id = any (public.get_user_owner_org_ids()))
  with check (org_id = any (public.get_user_owner_org_ids()));
create policy org_provider_accounts_owner_delete on public.org_provider_accounts
  for delete to authenticated
  using (org_id = any (public.get_user_owner_org_ids()) and not secrets_from_env);

-- A line belongs to an account of its own org, of its own provider.
alter table public.org_phone_numbers
  add column if not exists provider_account_id uuid;

alter table public.org_phone_numbers
  add constraint org_phone_numbers_account_same_org
  foreign key (provider_account_id, org_id)
  references public.org_provider_accounts (id, org_id)
  on delete set null (provider_account_id);

create or replace function public.sc_line_account_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare v_provider text; v_only uuid;
begin
  -- A line marked with a provider goes on its company's one connection of
  -- that provider, when there is exactly one; never another company's.
  if new.provider_account_id is null and new.provider is not null then
    select (array_agg(a.id))[1] into v_only from public.org_provider_accounts a
     where a.org_id = new.org_id and a.provider = new.provider
    having count(*) = 1;
    new.provider_account_id := v_only;
  end if;
  if new.provider_account_id is null then return new; end if;
  select a.provider into v_provider from public.org_provider_accounts a
   where a.id = new.provider_account_id and a.org_id = new.org_id;
  if v_provider is null then
    raise exception 'that connection is not this company''s';
  end if;
  if new.provider is distinct from v_provider then
    raise exception 'a % line can''t be on a % connection', coalesce(new.provider, 'unset'), v_provider;
  end if;
  return new;
end $$;

create trigger org_phone_numbers_account_guard
  before insert or update of provider_account_id, provider, org_id on public.org_phone_numbers
  for each row execute function public.sc_line_account_guard();

-- An owner stores a connection's key. The value goes into vault and never
-- comes back out to a browser; only the service role can read it.
create or replace function public.sc_set_provider_secret(p_account uuid, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a public.org_provider_accounts; v_id uuid;
begin
  select * into a from public.org_provider_accounts where id = p_account;
  if not found or auth.uid() is null or not (a.org_id = any (public.get_user_owner_org_ids())) then
    raise exception 'connection not found';
  end if;
  if p_kind not in ('api_key','signing_key') then raise exception 'unknown key kind'; end if;
  if p_value is null or length(trim(p_value)) < 8 or length(p_value) > 4000 then
    raise exception 'that doesn''t look like a key';
  end if;
  v_id := case p_kind when 'api_key' then a.api_key_secret_id else a.signing_key_secret_id end;
  if v_id is null then
    v_id := vault.create_secret(trim(p_value), 'provider_' || p_kind || '_' || a.id::text,
                                a.provider || ' ' || p_kind || ' for org ' || a.org_id::text);
    if p_kind = 'api_key' then
      update public.org_provider_accounts set api_key_secret_id = v_id, updated_at = now() where id = a.id;
    else
      update public.org_provider_accounts set signing_key_secret_id = v_id, updated_at = now() where id = a.id;
    end if;
  else
    perform vault.update_secret(v_id, trim(p_value));
    update public.org_provider_accounts set updated_at = now() where id = a.id;
  end if;
end $$;

revoke all on function public.sc_set_provider_secret(uuid, text, text) from public, anon;
grant execute on function public.sc_set_provider_secret(uuid, text, text) to authenticated;

-- Intake (service role only): the account a webhook token names, with its
-- keys. A null token is the env account for that provider.
create or replace function public.sc_provider_account_for_webhook(p_provider text, p_token text)
returns table (account_id uuid, org_id uuid, status text, secrets_from_env boolean,
               api_key text, signing_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.org_id, a.status, a.secrets_from_env,
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = a.api_key_secret_id),
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = a.signing_key_secret_id)
    from public.org_provider_accounts a
   where a.provider = p_provider
     and case when p_token is null then a.secrets_from_env
              else a.webhook_token = p_token end
   limit 1;
$$;

revoke all on function public.sc_provider_account_for_webhook(text, text) from public, anon, authenticated;
grant execute on function public.sc_provider_account_for_webhook(text, text) to service_role;

-- Backfill: Sacco's Quo workspace is the env account; its Quo line is on it.
insert into public.org_provider_accounts (org_id, provider, label, secrets_from_env)
select o.id, 'quo', 'Quo', true
  from public.orgs o
 where o.slug = 'sbuild'
   and not exists (select 1 from public.org_provider_accounts where provider = 'quo' and secrets_from_env);

update public.org_phone_numbers p
   set provider_account_id = a.id
  from public.org_provider_accounts a
 where a.org_id = p.org_id and a.provider = 'quo' and a.secrets_from_env
   and p.provider = 'quo' and p.provider_account_id is null;
