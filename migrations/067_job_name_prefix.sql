-- 067 — The customer's name leads the job's name (Coy, 2026-10-03: "it is best
-- if the last name of the customer (or company name) precedes the job
-- description. So instead of just Driveway Repair, it would be Wilson Driveway
-- Repair that way I can find the job from the job page easier.").
--
-- A person's job takes their LAST name ("Johnette Wilson" → "Wilson Driveway
-- repair"); a company's job takes the company's name, without LLC / Inc
-- ("LA Contracting Enterprise Burgess Ave Sidewalk"). It is stored in the title,
-- so the board, search, Dusty and every list read the same name.
--
-- Most automatic jobs are made before the person has a name (Johnette was
-- filed a customer, then named), so the name is added when it arrives, and
-- swapped when it changes ("Johnette" → "Johnette Wilson": "Johnette …" →
-- "Wilson …"). jobs.name_prefix remembers what was put in front, so:
--   * a title that already carries the name is left as it is;
--   * if Coy takes the name back out of a title, it is not put back;
--   * "New job" (the automatic fallback the page asks him to replace) is not
--     prefixed until he names it;
--   * a name that is only a phone number is no name.
--
-- Additive: one nullable column, three functions, three triggers. Triggers run
-- as the caller (RLS applies); the name function only reads.

alter table public.jobs add column if not exists name_prefix text
  check (name_prefix is null or length(name_prefix) <= 80);

-- What leads a job's name: the company, else the person's last name. Null when nobody has a name.
create or replace function public.sc_job_name_prefix(p_customer uuid, p_contact uuid)
returns text language plpgsql stable set search_path = public as $$
declare
  cu_name text; cu_type text; co_name text; who text; w text[];
  phone_like constant text := '^[\s\d()+.\-]*$';
begin
  if p_customer is not null then
    select nullif(btrim(name), ''), customer_type into cu_name, cu_type from customers where id = p_customer;
  end if;
  if p_contact is not null then
    select nullif(btrim(coalesce(m.name, c.name)), '') into co_name
    from contacts c left join contacts m on m.id = c.merged_into_contact_id where c.id = p_contact;
  end if;
  if cu_name ~ phone_like then cu_name := null; end if;
  if co_name ~ phone_like then co_name := null; end if;

  -- A company: a commercial or public customer, or a customer named other than its person.
  if cu_name is not null and (cu_type in ('commercial', 'public') or (co_name is not null and lower(cu_name) <> lower(co_name))) then
    return left(btrim(regexp_replace(cu_name, ',?\s+(llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|llp)\s*$', '', 'i')), 80);
  end if;

  who := coalesce(co_name, cu_name);
  if who is null then return null; end if;
  who := regexp_replace(who, '[,.]?\s+(jr|sr|ii|iii|iv)\.?\s*$', '', 'i');
  w := regexp_split_to_array(btrim(who), '\s+');
  return nullif(left(btrim(w[array_length(w, 1)], ' ,.;:''"()'), 80), '');
end;
$$;

-- Does the title already carry the name, as a whole word?
create or replace function public.sc_title_has_name(p_title text, p_name text)
returns boolean language sql immutable as $$
  select p_title is not null and p_name is not null and
    p_title ~* ('(^|[^[:alnum:]])' || regexp_replace(p_name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[^[:alnum:]])');
$$;

-- On a new job, and on Coy naming a "New job": put the name in front (once).
create or replace function public.sc_jobs_name_prefix()
returns trigger language plpgsql set search_path = public as $$
declare pre text;
begin
  if new.name_prefix is not null or new.title is null or btrim(new.title) = '' or new.title = 'New job' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.name_prefix is not null then return new; end if;
  pre := sc_job_name_prefix(new.customer_id, new.contact_id);
  if pre is null then return new; end if;
  if not sc_title_has_name(new.title, pre) then
    new.title := left(pre || ' ' || btrim(new.title), 200);
  end if;
  new.name_prefix := pre;
  return new;
end;
$$;

create trigger jobs_name_prefix before insert or update of title on public.jobs
  for each row execute function public.sc_jobs_name_prefix();

-- When a person or company is named (or renamed): their open jobs follow.
create or replace function public.sc_rename_jobs_for(p_org uuid, p_customer uuid, p_contact uuid)
returns void language plpgsql set search_path = public as $$
declare j record; pre text; t text;
begin
  for j in
    select id, title, name_prefix, customer_id, contact_id from jobs
    where org_id = p_org and archived_at is null and title is not null and title <> 'New job'
      and ((p_contact is not null and contact_id = p_contact) or (p_customer is not null and customer_id = p_customer))
  loop
    pre := sc_job_name_prefix(j.customer_id, j.contact_id);
    if pre is null or pre is not distinct from j.name_prefix then continue; end if;
    t := j.title;
    if j.name_prefix is not null then
      -- Swap only a name we put there and Coy left in front.
      if left(t, length(j.name_prefix) + 1) <> j.name_prefix || ' ' then continue; end if;
      t := substr(t, length(j.name_prefix) + 2);
    end if;
    if not sc_title_has_name(t, pre) then t := pre || ' ' || btrim(t); end if;
    update jobs set title = left(t, 200), name_prefix = pre where id = j.id;
  end loop;
end;
$$;

create or replace function public.sc_contacts_name_jobs()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform sc_rename_jobs_for(new.org_id, new.customer_id, new.id);
  end if;
  return new;
end;
$$;
create trigger contacts_name_jobs after update of name on public.contacts
  for each row execute function public.sc_contacts_name_jobs();

create or replace function public.sc_customers_name_jobs()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is distinct from old.name or new.customer_type is distinct from old.customer_type then
    perform sc_rename_jobs_for(new.org_id, new.id, null);
  end if;
  return new;
end;
$$;
create trigger customers_name_jobs after update of name, customer_type on public.customers
  for each row execute function public.sc_customers_name_jobs();

revoke execute on function public.sc_job_name_prefix(uuid, uuid) from anon;
revoke execute on function public.sc_rename_jobs_for(uuid, uuid, uuid) from anon;

-- Existing jobs (Coy's go): every job not archived, named the same way.
do $b$
declare j record;
begin
  for j in select distinct org_id, customer_id, contact_id from jobs where archived_at is null loop
    perform sc_rename_jobs_for(j.org_id, j.customer_id, j.contact_id);
  end loop;
end $b$;
