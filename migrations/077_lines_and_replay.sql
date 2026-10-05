-- 077 — Lines, providers and logs (Claude Design package 9, `Lines.dc.html`;
-- Coy, 2026-10-04: "go ahead with the lines/providers/logs").
--
-- The design's `providers` / `lines` / `line_events` tables already exist here
-- under other names, and are kept (DECISIONS §2a, §2d): a line is an
-- `org_phone_numbers` row (number, label, provider, default lead source), the
-- event log is `quo_events` (every webhook, untouched, before it is projected),
-- and the stamp on a message is `messages.phone_number_id`. So this adds only
-- what the design needs that isn't there:
--
--  * org_phone_numbers.color_token — the line's colour (hiviz, chalk, violet,
--    green, teal): the 3px edge on its card, the dot on a message and in Logs.
--    Null = assigned in order on the page; Coy can pick one.
--  * sc_replay_raw_event(event) — Logs' "Replay event": runs the projection
--    again for one raw event of the caller's org (the same function the
--    trigger runs; the dedupe index makes a second message impossible). On
--    success the error is cleared and its 'projection_exception' defect
--    resolved; on failure the new error is kept. SECURITY DEFINER with an
--    explicit membership check, execute for authenticated only.

alter table public.org_phone_numbers
  add column if not exists color_token text
    check (color_token is null or color_token in ('hiviz', 'chalk', 'violet', 'green', 'teal'));

create or replace function public.sc_replay_raw_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev quo_events; err text;
begin
  select * into ev from quo_events where id = p_event;
  if not found or not (ev.org_id = any(get_user_org_ids())) then
    raise exception 'event not found';
  end if;
  if ev.contact_id is not null then
    ev.contact_id := coalesce((select c.merged_into_contact_id from contacts c where c.id = ev.contact_id), ev.contact_id);
  end if;
  begin
    perform sc_project_raw_event(ev);
  exception when others then
    err := sqlstate || ': ' || sqlerrm;
  end;
  if err is null then
    update quo_events set projection_error = null, projected_at = coalesce(projected_at, now()) where id = p_event;
    update projection_defects set resolved_at = now()
      where raw_event_id = p_event and defect = 'projection_exception' and resolved_at is null;
    return jsonb_build_object('ok', true);
  end if;
  update quo_events set projection_error = err where id = p_event;
  return jsonb_build_object('ok', false, 'error', err);
end $$;
revoke all on function public.sc_replay_raw_event(uuid) from public, anon;
grant execute on function public.sc_replay_raw_event(uuid) to authenticated;
