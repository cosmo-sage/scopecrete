-- 027_message_media.sql
--
-- Photos, videos, PDFs and contact cards sent by text — stored, and readable.
-- Applied 2026-09-27 on Coy's explicit instruction (plan approval covering
-- 026-028, DECISIONS.md §7). Additive, plus one function replacement.
--
-- WHAT WAS WRONG, measured 2026-09-27
--
-- 1. The projection dropped them. sc_project_raw_event() wrote only the FIRST
--    item of raw_payload.media, and into messages.recording_url — a photo
--    filed as a call recording, on 48 texts. message_media, which has exactly
--    the right columns, had 0 rows. Every picture a customer sent rendered as
--    "(no text)".
--
--    Scale: 62 distinct files on 48 messages (JPEG, PNG, PDF, vCard, 3GP
--    video). An earlier count of "143 photos" in this session was wrong — it
--    included 81 call.recording.completed events, which are audio and already
--    land in call_artifacts.
--
-- 2. Nothing could read a private bucket. storage.objects had ZERO policies,
--    so no signed URL could be issued from a user's session. That is also why
--    the call-audio player has never worked.
--
-- WHAT THIS DOES
--
--   sc_media_kind(mime)              maps a MIME type onto message_media.kind
--   message_media (message_id, url)  unique — backfill and trigger idempotent
--   bucket message-media             private
--   storage.objects policies         org-scoped read + insert on message-media,
--                                    org-scoped read on call-audio. Both
--                                    buckets key paths as {org_id}/…
--   sc_project_raw_event()           also writes one message_media row per
--                                    media item on message events
--   backfill                         from quo_events.raw_payload.media and
--                                    sms_threads.media_urls
--
-- The recording_url write on texts is KEPT for now so nothing that reads it
-- breaks. It is wrong and should go once nothing depends on it.

begin;

-- ------------------------------------------------------------------ kind

create or replace function public.sc_media_kind(mime text)
returns text language sql immutable as $$
  select case
    when mime is null                        then 'other'
    when mime like 'image/%'                 then 'image'
    when mime like 'video/%'                 then 'video'
    when mime like 'audio/%'                 then 'audio'
    when mime in ('text/vcard','text/x-vcard') then 'vcard'
    when mime = 'application/pdf'
      or mime like 'application/msword%'
      or mime like 'application/vnd.%'       then 'document'
    else 'other'
  end
$$;

-- -------------------------------------------------------------- idempotency

create unique index if not exists message_media_message_url_key
  on public.message_media (message_id, url);

-- ------------------------------------------------------------------ bucket

insert into storage.buckets (id, name, public, file_size_limit)
values ('message-media', 'message-media', false, 26214400)   -- 25 MB
on conflict (id) do nothing;

-- ---------------------------------------------------------------- policies
-- First path segment is the org id. A member of the org can read and write
-- under it; nobody else can. RLS on storage.objects is the enforcement — the
-- app routes use a session client, never the service-role key.

drop policy if exists message_media_objects_select on storage.objects;
create policy message_media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] = any (
      array(select x::text from unnest(public.get_user_org_ids()) x))
  );

drop policy if exists message_media_objects_insert on storage.objects;
create policy message_media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] = any (
      array(select x::text from unnest(public.get_user_org_ids()) x))
  );

drop policy if exists call_audio_objects_select on storage.objects;
create policy call_audio_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-audio'
    and (storage.foldername(name))[1] = any (
      array(select x::text from unnest(public.get_user_org_ids()) x))
  );

-- -------------------------------------------------------------- projection
-- Identical to the 016 definition except where marked "027".

create or replace function public.sc_project_raw_event(e quo_events)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid; v_dir text; v_channel text; v_msg_id uuid;
  v_ref text; v_kind text; v_content text; v_url text;
  v_from text; v_to text;
  v_payload jsonb := coalesce(e.raw_payload, '{}'::jsonb);
  v_occurred timestamptz;
begin
  v_org := coalesce(e.org_id, public.sc_org_for_line(e.to_phone),
                    public.sc_org_for_line(e.from_phone));
  if v_org is null then
    insert into public.projection_defects (org_id, raw_event_id, defect, detail)
    values (null, e.id, 'unrouted_line',
            jsonb_build_object('from', e.from_phone, 'to', e.to_phone,
                               'event_type', e.event_type))
    on conflict (raw_event_id, defect) where resolved_at is null do nothing;
    return;
  end if;
  v_channel := case when e.event_type like 'call%' then 'call'
                    when e.event_type like 'message%' then 'sms' else null end;
  if v_channel is null then
    insert into public.projection_defects (org_id, raw_event_id, defect, detail)
    values (v_org, e.id, 'unknown_event_type',
            jsonb_build_object('event_type', e.event_type))
    on conflict (raw_event_id, defect) where resolved_at is null do nothing;
    return;
  end if;
  if e.event_type in ('call.transcript.completed','call.summary.completed',
                      'call.recording.completed') then
    v_ref := coalesce(v_payload ->> 'callId', v_payload ->> 'id');
    v_kind := case e.event_type
      when 'call.transcript.completed' then 'transcript'
      when 'call.summary.completed'    then 'summary'
      else 'recording' end;
    if v_kind = 'transcript' then
      select string_agg(coalesce(t ->> 'identifier','?') || ': ' || coalesce(t ->> 'content',''),
                        chr(10) order by (t ->> 'start')::numeric)
        into v_content
      from jsonb_array_elements(coalesce(v_payload -> 'dialogue','[]'::jsonb)) t;
    elsif v_kind = 'summary' then
      select string_agg(value #>> '{}', chr(10)) into v_content
      from jsonb_array_elements(coalesce(v_payload -> 'summary','[]'::jsonb));
    else
      v_content := null;
    end if;
    v_url := coalesce(v_payload #>> '{media,0,url}', v_payload ->> 'url');
    select m.id into v_msg_id from public.messages m
    where m.org_id = v_org and m.channel = 'call' and m.provider_message_id = v_ref
    limit 1;
    if v_msg_id is null then
      insert into public.projection_defects (org_id, raw_event_id, defect, detail)
      values (v_org, e.id, 'artifact_without_call',
              jsonb_build_object('call_ref', v_ref, 'event_type', e.event_type))
      on conflict (raw_event_id, defect) where resolved_at is null do nothing;
      return;
    end if;
    insert into public.call_artifacts (org_id, message_id, kind, source, content, url, fetched_at)
    values (v_org, v_msg_id, v_kind, e.provider, v_content, v_url, now())
    on conflict (message_id, kind, source) do update
      set content = coalesce(excluded.content, call_artifacts.content),
          url = coalesce(excluded.url, call_artifacts.url), fetched_at = now();
    if e.event_type = 'call.summary.completed'
       and jsonb_array_length(coalesce(v_payload -> 'nextSteps','[]'::jsonb)) > 0 then
      select string_agg(value #>> '{}', chr(10)) into v_content
      from jsonb_array_elements(v_payload -> 'nextSteps');
      insert into public.call_artifacts (org_id, message_id, kind, source, content, fetched_at)
      values (v_org, v_msg_id, 'next_steps', e.provider, v_content, now())
      on conflict (message_id, kind, source) do update
        set content = coalesce(excluded.content, call_artifacts.content), fetched_at = now();
    end if;
    update public.messages m
    set transcript = coalesce((select a.content from public.call_artifacts a
          where a.message_id = m.id and a.kind = 'transcript'
          order by a.fetched_at desc nulls last limit 1), m.transcript),
        summary = coalesce((select a.content from public.call_artifacts a
          where a.message_id = m.id and a.kind = 'summary'
          order by a.fetched_at desc nulls last limit 1), m.summary),
        summary_source = coalesce((select a.source from public.call_artifacts a
          where a.message_id = m.id and a.kind = 'summary'
          order by a.fetched_at desc nulls last limit 1), m.summary_source),
        recording_url = coalesce((select a.url from public.call_artifacts a
          where a.message_id = m.id and a.kind = 'recording'
          order by a.fetched_at desc nulls last limit 1), m.recording_url),
        updated_at = now()
    where m.id = v_msg_id;
    update public.quo_events set projected_at = now(), projection_error = null where id = e.id;
    return;
  end if;
  v_from := coalesce(v_payload ->> 'from', e.from_phone);
  v_to   := coalesce(v_payload ->> 'to',   e.to_phone);
  v_dir := public.sc_resolve_direction(e.direction, v_from, v_org);
  if (lower(coalesce(e.direction,'')) in ('inbound','incoming','in') and v_dir = 'outbound')
     or (lower(coalesce(e.direction,'')) in ('outbound','outgoing','out') and v_dir = 'inbound') then
    insert into public.projection_defects (org_id, raw_event_id, defect, detail)
    values (v_org, e.id, 'direction_disagrees_with_provider',
            jsonb_build_object('provider_said', e.direction, 'ownership_says', v_dir, 'from', v_from))
    on conflict (raw_event_id, defect) where resolved_at is null do nothing;
  end if;
  v_occurred := coalesce(e.created_at, e.received_at, now());
  insert into public.messages (
    org_id, contact_id, job_id, channel, direction, from_address, to_address,
    body_text, provider, provider_message_id, duration_seconds, recording_url,
    transcript, status, occurred_at, imported_at, import_source, legacy_id)
  values (
    v_org, e.contact_id, e.job_id, v_channel, v_dir, v_from, v_to,
    e.body, e.provider, e.event_id,
    nullif(v_payload #>> '{duration}', '')::int,
    v_payload #>> '{media,0,url}', null,
    case when v_dir = 'inbound' then 'received'
         when v_channel = 'call' then 'received'
         when e.event_type = 'message.delivered' then 'delivered'
         else 'sent' end,
    v_occurred, now(), 'quo_events', e.id)
  on conflict (provider, provider_message_id) where provider_message_id is not null
  do update set
    contact_id = coalesce(messages.contact_id, excluded.contact_id),
    job_id = coalesce(messages.job_id, excluded.job_id),
    body_text = coalesce(messages.body_text, excluded.body_text),
    duration_seconds = coalesce(messages.duration_seconds, excluded.duration_seconds),
    recording_url = coalesce(messages.recording_url, excluded.recording_url),
    from_address = excluded.from_address,
    to_address   = excluded.to_address,
    direction    = excluded.direction,
    status = case when excluded.status = 'delivered'
                   and messages.status not in ('read','failed','bounced')
                  then 'delivered' else messages.status end,
    updated_at = now()
  returning id into v_msg_id;                                        -- 027

  -- 027: every media item on a message event, not just the first.
  if v_channel = 'sms' and jsonb_typeof(v_payload -> 'media') = 'array' then
    insert into public.message_media (org_id, message_id, url, mime_type, kind, received_at)
    select v_org, v_msg_id, item ->> 'url', item ->> 'type',
           public.sc_media_kind(item ->> 'type'), v_occurred
      from jsonb_array_elements(v_payload -> 'media') item
     where coalesce(item ->> 'url', '') <> ''
    on conflict (message_id, url) do nothing;
  end if;

  update public.quo_events set projected_at = now(), projection_error = null where id = e.id;
end;
$function$;

-- ---------------------------------------------------------------- backfill
-- Both sources, matched on the provider's message id (legacy_id only covers
-- rows projected after 016). The two sources overlap exactly; the unique index
-- collapses them.

insert into public.message_media (org_id, message_id, url, mime_type, kind, received_at)
select distinct on (src.message_id, src.url)
       src.org_id, src.message_id, src.url, src.mime, public.sc_media_kind(src.mime), src.at
from (
  select m.id message_id, m.org_id, item ->> 'url' url, item ->> 'type' mime, m.occurred_at at
    from public.quo_events q
    cross join lateral jsonb_array_elements(q.raw_payload -> 'media') item
    join public.messages m
      on m.provider = 'quo' and m.provider_message_id = q.raw_payload ->> 'id'
   where q.event_type like 'message.%'
     and jsonb_typeof(q.raw_payload -> 'media') = 'array'
  union all
  select m.id, m.org_id, item ->> 'url', item ->> 'type', m.occurred_at
    from public.sms_threads s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.media_urls) = 'array' then s.media_urls else '[]'::jsonb end) item
    join public.messages m
      on m.provider = 'quo' and m.provider_message_id = s.quo_message_id
) src
where coalesce(src.url, '') <> ''
on conflict (message_id, url) do nothing;

commit;

-- VERIFY. Each states what failure looks like.
--
--   select count(*), count(distinct message_id) from public.message_media;
--     -- Passes on 62 / 48. Fails on 124 (duplicates — the index did not take)
--     -- or on anything under 62 (a source was missed).
--
--   -- Amber's two photos, on her texting number.
--   select mm.kind, mm.mime_type from public.message_media mm
--     join public.messages m on m.id = mm.message_id
--     join public.contacts c on c.id = m.contact_id
--    where c.phone = '+12252814640';
--     -- Passes on 2 rows, image, image/jpeg. Fails on 0.
--
--   -- Re-running the backfill must add nothing.
--     -- Passes on INSERT 0 0.
