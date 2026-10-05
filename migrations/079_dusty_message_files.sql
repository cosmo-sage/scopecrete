-- 079 — the photos and files attached to a message in Dusty's chat (Coy,
-- 2026-10-04: "the chat history should at least keep the summary of the image
-- that he read. We'll need to have a place for the photos uploaded to dusty to
-- be saved in the database because i might upload photos from a job and ask
-- dusty to attach to a new customer or job").
--
-- The files themselves were already saved: each upload is a `files` row, on
-- what the chat is about or unfiled (from_dusty). What was missing is which
-- message carried them. dusty_messages.file_ids lists them (at most 8, as the
-- chat sends), so:
--   - every later turn tells Dusty what was attached earlier and the reader's
--     summary of it (or shows him the photo again while it isn't read);
--   - the chat shows the thumbnails on the question when a chat is reopened;
--   - Dusty can name them by id in a plan step that files them on a customer,
--     person or job.
-- Additive: one nullable column. RLS on dusty_messages is unchanged (org member
-- AND the conversation's owner); the files are read under their own RLS.

alter table public.dusty_messages add column if not exists file_ids uuid[];
alter table public.dusty_messages add constraint dusty_messages_file_ids_len
  check (file_ids is null or cardinality(file_ids) <= 8);
