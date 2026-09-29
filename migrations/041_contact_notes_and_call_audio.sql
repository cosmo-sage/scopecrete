-- 041 — Coy's notes on a person; call recordings copied on first play.
--
-- Coy, 2026-09-28 (Vercel feedback on the conversation page): "Where do notes
-- land? Dusty needs access to all customer and vendor notes." Until now the
-- composer's Note tab had nowhere to save. contact_notes is that place: Coy
-- writes them, the person's timeline shows them, and Dusty — in chat and in
-- the background reader — reads them.
--
-- Same day: "Is there a way to get the audio recording of phone calls from
-- quo into the respective customer/vendor pages?" 129 calls carry a Quo
-- recording link and none had been copied, because nothing could write to the
-- call-audio bucket. /api/messages/[id]/audio now copies the file into
-- call-audio/{org_id}/… the first time Coy taps play, under his session. That
-- needs an INSERT policy scoped to his org's folder, the twin of
-- message_media_objects_insert (migration 027).
--
-- Additive: one table with member policies, one storage policy.

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contact_notes_contact_idx on public.contact_notes (org_id, contact_id, created_at desc);

alter table public.contact_notes enable row level security;

drop policy if exists contact_notes_member_select on public.contact_notes;
create policy contact_notes_member_select on public.contact_notes
  for select to authenticated using (org_id = any (get_user_org_ids()));
drop policy if exists contact_notes_member_insert on public.contact_notes;
create policy contact_notes_member_insert on public.contact_notes
  for insert to authenticated with check (org_id = any (get_user_org_ids()));
drop policy if exists contact_notes_member_update on public.contact_notes;
create policy contact_notes_member_update on public.contact_notes
  for update to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists contact_notes_member_delete on public.contact_notes;
create policy contact_notes_member_delete on public.contact_notes
  for delete to authenticated using (org_id = any (get_user_org_ids()));

revoke all on public.contact_notes from anon;

drop policy if exists call_audio_objects_insert on storage.objects;
create policy call_audio_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'call-audio'
              and (storage.foldername(name))[1] = any (array(select x::text from unnest(get_user_org_ids()) x)));
