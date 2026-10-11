-- 103_voicemail_artifacts.sql
-- Coy, 2026-10-11: "Looks like voicemails aren't coming through in scopecrete
-- even though it's in quo." Elena Sacco's 9-second voicemail (call
-- AC3cca10…, 12:45 PM) showed in the thread as "Missed call" and nothing else.
--
-- Why: Quo's call.completed carries the voicemail's audio link in
-- raw_payload.voicemail {url, type, duration}. sc_project_raw_event() made
-- the call's messages row and never looked at that key, so no
-- call_artifacts 'voicemail' row was written — 62 call.completed events carry
-- a voicemail, 2 artifacts existed (made by the old backfill function). The
-- transcript is not in any webhook; the app asks Quo's API for it when the
-- thread opens (src/lib/voicemail-server.ts), which works without this
-- migration. This makes the projection write the link as the event lands, so
-- Dusty, the customer page and the activity line see the voicemail too.
--
-- Additive:
--   * sc_project_raw_event(): the live body (read back 2026-10-11, md5
--     837ff8d2…) plus one block — a call event with a voicemail url upserts
--     the 'voicemail' artifact (url only; content never blanked);
--   * a backfill of the voicemail artifacts already missing (url only).
-- No table, grant or policy changes.

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
  returning id into v_msg_id;

  if v_channel = 'sms' and jsonb_typeof(v_payload -> 'media') = 'array' then
    insert into public.message_media (org_id, message_id, url, mime_type, kind, received_at)
    select v_org, v_msg_id, item ->> 'url', item ->> 'type',
           public.sc_media_kind(item ->> 'type'), v_occurred
      from jsonb_array_elements(v_payload -> 'media') item
     where coalesce(item ->> 'url', '') <> ''
    on conflict (message_id, url) do nothing;
  end if;

  -- 103: a voicemail on the call (call.completed's `voicemail` {url, type, duration}).
  if v_channel = 'call' and coalesce(v_payload #>> '{voicemail,url}', '') <> '' then
    insert into public.call_artifacts (org_id, message_id, kind, source, content, url, fetched_at)
    values (v_org, v_msg_id, 'voicemail', e.provider, null, v_payload #>> '{voicemail,url}', now())
    on conflict (message_id, kind, source) do update
      set url = coalesce(call_artifacts.url, excluded.url);
  end if;

  update public.quo_events set projected_at = now(), projection_error = null where id = e.id;
end;
$function$;

-- Backfill: every call already filed whose call.completed carried a voicemail.
insert into public.call_artifacts (org_id, message_id, kind, source, content, url, fetched_at)
select distinct on (m.id) m.org_id, m.id, 'voicemail', m.provider, null, q.raw_payload #>> '{voicemail,url}', now()
  from public.quo_events q
  join public.messages m
    on (q.org_id is null or m.org_id = q.org_id) and m.channel = 'call'
   and m.provider_message_id = q.raw_payload ->> 'id'
 where q.event_type = 'call.completed'
   and coalesce(q.raw_payload #>> '{voicemail,url}', '') <> ''
 order by m.id, q.received_at desc
on conflict (message_id, kind, source) do nothing;
