-- 124 · A sent bid request can be edited (Coy, 2026-10-23: "I need to be able to go in and edit
-- the bid request that I sent").
--
-- 091 let members insert a bid request and read it, never change it. Editing keeps every vendor's
-- own link: the request's words, scopes, dates, packet and files are replaced in place, so the same
-- /b/<token> shows the new version. The vendor's answer stays on their row (sc_answer_bid lets them
-- answer again); when it was sent before the edit, the job's Summary and their page say so — the
-- time of the edit is kept as packet.edited_at, so sc_shared_bid returns it with no change.
--
-- Members may update only these columns, under the same org check as reading. org_id, job_id,
-- created_by and created_at stay as made (no grant), and sc_bid_guard still runs on org and job.
-- Additive: one column grant and one policy. Nothing is dropped.

grant update (price_mode, price_by, pour_date, scopes, packet, assets, note) on public.bid_requests to authenticated;

create policy bid_requests_member_update on public.bid_requests
  for update to authenticated
  using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
