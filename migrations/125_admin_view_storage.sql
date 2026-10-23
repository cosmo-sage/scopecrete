-- 125: View company shows the company's photos and files.
--
-- 121's lock is get_user_org_ids() answering with the viewed company only in a
-- READ ONLY transaction. The Storage API signs a link in its own read-write
-- transaction, so there the admin's own memberships apply, the job-files
-- policy refuses the viewed company's objects, and every photo, thumbnail and
-- plan comes back without a link (seen 2026-10-23 on Gulfline's Files).
--
-- This adds SELECT-only policies on storage.objects for the buckets the app
-- signs from: a platform admin with an open, unexpired view of a company may
-- read objects in that company's folder. No insert, update or delete is
-- widened, and nothing changes for anyone not viewing.

create or replace function public.sc_admin_view_org()
returns uuid
language sql stable security definer set search_path to 'public'
as $function$
  select v.org_id
    from admin_company_views v
    join platform_admins a on a.user_id = v.admin_user_id
   where v.admin_user_id = auth.uid() and v.ended_at is null and v.expires_at > now()
   order by v.started_at desc
   limit 1
$function$;

revoke all on function public.sc_admin_view_org() from public, anon;
grant execute on function public.sc_admin_view_org() to authenticated;

create policy admin_view_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = any (array['job-files', 'message-media', 'call-audio', 'org-branding'])
    and (storage.foldername(name))[1] = (select public.sc_admin_view_org())::text
  );
