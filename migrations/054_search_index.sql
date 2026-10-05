-- 054 — Full-text search (Coy, 2026-09-30): "the search needs to be more
-- than just threads … results pull from every message, call summary and
-- transcript and vendor. Requires a search index first."
--
--   * A stored, generated `search_tsv` (English) on messages (body, summary,
--     transcript), call_artifacts (summaries, transcripts, next steps),
--     contacts (name, company, email, address, Dusty's status lines — so
--     vendors and customers alike), contact_notes, jobs (title, address,
--     description, notes) and job_files (name, Dusty's read, the document's
--     text) — each with a GIN index. Generated columns keep themselves up to
--     date; nothing else writes them.
--   * sc_search(q, per_kind): SECURITY INVOKER, so RLS decides what a caller
--     sees — the same rows the app already shows them. websearch syntax
--     ("quoted phrases", -exclude, or); a query with 4+ digits also matches
--     phone numbers by their digits. Returns the best matches per kind with a
--     highlighted snippet.
--
-- Additive: generated columns, indexes, one function.

alter table public.messages add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(body_text, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(transcript, ''))) stored;
create index if not exists messages_search_idx on public.messages using gin (search_tsv);

alter table public.call_artifacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;
create index if not exists call_artifacts_search_idx on public.call_artifacts using gin (search_tsv);

alter table public.contacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(name, '') || ' ' || coalesce(company_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(address, '') || ' ' ||
    coalesce(service_area, '') || ' ' || coalesce(status_summary, '') || ' ' || coalesce(recent_summary, ''))) stored;
create index if not exists contacts_search_idx on public.contacts using gin (search_tsv);

alter table public.contact_notes add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index if not exists contact_notes_search_idx on public.contact_notes using gin (search_tsv);

alter table public.jobs add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, '') || ' ' || coalesce(description, '') || ' ' || coalesce(notes, ''))) stored;
create index if not exists jobs_search_idx on public.jobs using gin (search_tsv);

alter table public.job_files add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(name, '') || ' ' || coalesce(note, '') || ' ' || coalesce(summary, '') || ' ' || left(coalesce(extracted_text, ''), 200000))) stored;
create index if not exists job_files_search_idx on public.job_files using gin (search_tsv);

create or replace function public.sc_search(p_q text, p_per_kind int default 8)
returns table (kind text, id uuid, contact_id uuid, job_id uuid, title text, snippet text, at timestamptz, rank real)
language sql stable security invoker set search_path = public as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(p_q, '')) as tsq,
           regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as digits,
           greatest(1, least(coalesce(p_per_kind, 8), 25)) as n
  ),
  people as (
    select 'person'::text as kind, c.id, c.id as contact_id, null::uuid as job_id,
           coalesce(nullif(c.name, ''), nullif(c.company_name, ''), c.phone) as title,
           coalesce(nullif(c.status_summary, ''), concat_ws(' · ', c.contact_type, c.phone, c.email)) as snippet,
           c.last_contacted as at,
           (ts_rank(c.search_tsv, q.tsq) + case when length(q.digits) >= 4 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || q.digits || '%' then 1 else 0 end)::real as rank
      from contacts c, q
     where c.merged_into_contact_id is null
       and (c.search_tsv @@ q.tsq or (length(q.digits) >= 4 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || q.digits || '%'))
     order by rank desc limit (select n from q)
  ),
  msgs as (
    select 'message'::text, m.id, m.contact_id, m.job_id,
           coalesce(nullif(c.name, ''), c.phone, 'Message') || ' · ' || m.channel,
           ts_headline('english', coalesce(nullif(m.body_text, ''), nullif(m.summary, ''), m.transcript, ''), q.tsq, 'MaxWords=24, MinWords=8, StartSel=«, StopSel=»'),
           m.occurred_at, ts_rank(m.search_tsv, q.tsq)::real
      from messages m join q on m.search_tsv @@ q.tsq left join contacts c on c.id = m.contact_id
     order by 8 desc, m.occurred_at desc limit (select n from q)
  ),
  calls as (
    select 'call'::text, a.id, m.contact_id, m.job_id,
           coalesce(nullif(c.name, ''), c.phone, 'Call') || ' · call ' || a.kind,
           ts_headline('english', a.content, q.tsq, 'MaxWords=24, MinWords=8, StartSel=«, StopSel=»'),
           m.occurred_at, ts_rank(a.search_tsv, q.tsq)::real
      from call_artifacts a join q on a.search_tsv @@ q.tsq join messages m on m.id = a.message_id left join contacts c on c.id = m.contact_id
     where a.kind in ('summary', 'transcript', 'next_steps')
     order by 8 desc limit (select n from q)
  ),
  notes as (
    select 'note'::text, n.id, n.contact_id, n.job_id,
           coalesce(nullif(c.name, ''), c.phone, 'Note') || ' · note',
           ts_headline('english', n.body, q.tsq, 'MaxWords=24, MinWords=8, StartSel=«, StopSel=»'),
           n.created_at, ts_rank(n.search_tsv, q.tsq)::real
      from contact_notes n join q on n.search_tsv @@ q.tsq left join contacts c on c.id = n.contact_id
     order by 8 desc limit (select n from q)
  ),
  jobs_ as (
    select 'job'::text, j.id, j.contact_id, j.id,
           coalesce(nullif(j.title, ''), 'Job'),
           concat_ws(' · ', j.status, j.address, left(j.description, 120)),
           j.updated_at, ts_rank(j.search_tsv, q.tsq)::real
      from jobs j join q on j.search_tsv @@ q.tsq
     where j.archived_at is null
     order by 8 desc limit (select n from q)
  ),
  files as (
    select 'file'::text, f.id, f.contact_id, f.job_id,
           f.name,
           ts_headline('english', coalesce(nullif(f.summary, ''), '') || ' ' || left(coalesce(f.extracted_text, ''), 20000), q.tsq, 'MaxWords=24, MinWords=8, StartSel=«, StopSel=»'),
           f.created_at, ts_rank(f.search_tsv, q.tsq)::real
      from job_files f join q on f.search_tsv @@ q.tsq
     where f.deleted_at is null
     order by 8 desc limit (select n from q)
  )
  select * from people union all select * from msgs union all select * from calls
  union all select * from notes union all select * from jobs_ union all select * from files
$$;
revoke all on function public.sc_search(text, int) from public, anon;
grant execute on function public.sc_search(text, int) to authenticated;
