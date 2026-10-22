-- 120 — more pages an owner can give an onsite estimator: Jobs, Customers,
-- Contacts, Vendors, and Dusty (Coy, 2026-10-22, on Settings → Organization →
-- People: "Going to need to update this list to allow selections for Jobs,
-- Customers, Contacts, Vendors, and allow/deny access to Dusty").
--
-- 081's pages were Photos & files · Takeoffs · Budget, all inside a job. The
-- new ones:
--   jobs       the Jobs board and the job page. Read access to their jobs is
--              081's and unchanged — this key only says the board shows. Every
--              estimator and open invite is given it, so nobody loses the board.
--   customers  read every customer of the org and its people (name, numbers,
--              emails, address). Not their calls, texts, notes or money.
--   contacts   read the contacts book: every person (spam left to the app's
--              filter), their numbers and emails, and the customer each is on.
--   vendors    read every vendor (a contact filed vendor), their numbers and
--              emails, and their prices on file (cost_item_sources, cost_items).
--   dusty      their own Dusty chats (dusty_conversations / dusty_messages,
--              private to the user as before). Dusty reads under their session,
--              so he sees only what the pages above let them see.
-- All read only: no insert, update or delete is granted on customers,
-- contacts or vendors. Policies are added beside the members' ones; nothing a
-- member or owner reads changes. sc_check_access is 095's body with the page
-- list widened (read back from the live database before writing, unchanged).

-- ── The page list ──────────────────────────────────────────────────────────
alter table public.org_members drop constraint if exists org_members_pages_known;
alter table public.org_members add constraint org_members_pages_known
  check (pages <@ array['jobs', 'files', 'plan_room', 'budget', 'customers', 'contacts', 'vendors', 'dusty']::text[]);

update public.org_members set pages = array_append(pages, 'jobs')
 where role = 'field' and not ('jobs' = any (pages));
update public.org_invites set pages = array_append(pages, 'jobs')
 where role = 'field' and accepted_at is null and not ('jobs' = any (pages));

create or replace function public.sc_check_access(p_org uuid, p_role text, p_contact uuid, p_pages text[], p_jobs uuid[])
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_role not in ('owner', 'member', 'field') then
    raise exception 'Role is owner, member or onsite estimator.' using errcode = '22023';
  end if;
  if not (coalesce(p_pages, '{}') <@ array['jobs', 'files', 'plan_room', 'budget', 'customers', 'contacts', 'vendors', 'dusty']::text[]) then
    raise exception 'Unknown page.' using errcode = '22023';
  end if;
  if p_contact is not null and not exists (
      select 1 from contacts where id = p_contact and org_id = p_org and merged_into_contact_id is null and archived_at is null) then
    raise exception 'That contact isn''t in this organisation.' using errcode = '22023';
  end if;
  if p_role = 'field' then
    if p_contact is null then
      raise exception 'Pick the contact they are, then give them access.' using errcode = '22023';
    end if;
    if not exists (select 1 from contacts where id = p_contact and contact_type in ('vendor', 'customer')) then
      raise exception 'File them as a vendor or a customer''s contact first, then give them access.' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from unnest(coalesce(p_jobs, '{}')) j where not exists (select 1 from jobs where id = j and org_id = p_org)) then
    raise exception 'A job picked isn''t in this organisation.' using errcode = '22023';
  end if;
end $$;
revoke all on function public.sc_check_access(uuid, text, uuid, text[], uuid[]) from public, anon, authenticated;

-- ── Customers, Contacts, Vendors — read only ───────────────────────────────
create policy contacts_field_pages on public.contacts for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('contacts'))::uuid[])
      or (customer_id is not null and org_id = any ((select public.sc_field_org_ids('customers'))::uuid[]))
      or (contact_type = 'vendor' and org_id = any ((select public.sc_field_org_ids('vendors'))::uuid[])));

-- A number or email follows its person: readable when the person is.
create policy contact_phones_field_pages on public.contact_phones for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids(null))::uuid[])
     and exists (select 1 from public.contacts c where c.id = contact_id));
create policy contact_emails_field_pages on public.contact_emails for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids(null))::uuid[])
     and exists (select 1 from public.contacts c where c.id = contact_id));

-- The customer itself: on Customers, and its name in the Contacts book.
create policy customers_field_pages on public.customers for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('customers'))::uuid[])
      or org_id = any ((select public.sc_field_org_ids('contacts'))::uuid[]));

-- A vendor's prices on their page.
create policy cost_item_sources_field_vendors on public.cost_item_sources for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('vendors'))::uuid[]));
create policy cost_items_field_vendors on public.cost_items for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('vendors'))::uuid[]));

-- ── Dusty — their own chats ────────────────────────────────────────────────
create policy dusty_conversations_field on public.dusty_conversations for all to authenticated
  using (org_id = any ((select public.sc_field_org_ids('dusty'))::uuid[]) and user_id = auth.uid())
  with check (org_id = any ((select public.sc_field_org_ids('dusty'))::uuid[]) and user_id = auth.uid());
create policy dusty_messages_field on public.dusty_messages for all to authenticated
  using (org_id = any ((select public.sc_field_org_ids('dusty'))::uuid[]) and exists (
    select 1 from public.dusty_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (org_id = any ((select public.sc_field_org_ids('dusty'))::uuid[]) and exists (
    select 1 from public.dusty_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
