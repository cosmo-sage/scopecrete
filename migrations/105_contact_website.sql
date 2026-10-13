-- 105_contact_website.sql
-- Coy, 2026-10-12: "Vendors need website fields." A vendor is a contact filed
-- vendor (there is no vendors table), so the website is a column on contacts.
--
-- Additive: one nullable column with a shape check (http or https, 300
-- characters at most). RLS, grants and policies on contacts are unchanged —
-- members read and write it under get_user_org_ids() like the rest of the row.
-- The app ships ahead of it: every read and write falls back without the
-- column, and a website Dusty or Coy gives before then is kept as a note.

alter table public.contacts
  add column if not exists website text;

alter table public.contacts
  add constraint contacts_website_shape
  check (website is null or (length(website) <= 300 and website ~* '^https?://[^\s]+$'));
