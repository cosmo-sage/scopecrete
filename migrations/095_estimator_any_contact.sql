-- 095 — an onsite estimator may be a customer's contact, not only a vendor
-- (Coy, 2026-10-09: "go ahead and make the change that lets Jeremy be my
-- estimator"). Jeremy Wright is the one person on Gulfline Paving, a customer.
-- Filing him vendor would turn Gulfline into a vendor too (a lone contact's
-- bucket is its customer's relation, §2f), so 081's "vendor first" rule kept
-- him out. Now the estimator must be a contact filed customer OR vendor —
-- someone Coy knows and has filed — never unsorted, personal or spam.
--
-- Only sc_check_access changes. Same signature, same security definer, same
-- grants (none for anyone: only sc_invite_member and sc_set_member_access call
-- it). No table, policy or grant changes; what an estimator can SEE is still
-- 081's sc_field_job_ids / sc_field_org_ids, untouched.

create or replace function public.sc_check_access(p_org uuid, p_role text, p_contact uuid, p_pages text[], p_jobs uuid[])
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_role not in ('owner', 'member', 'field') then
    raise exception 'Role is owner, member or onsite estimator.' using errcode = '22023';
  end if;
  if not (coalesce(p_pages, '{}') <@ array['files', 'plan_room', 'budget']::text[]) then
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
