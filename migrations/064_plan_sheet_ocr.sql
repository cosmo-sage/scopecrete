-- 064 — OCR of scanned plan sheets (Coy, 2026-10-02: "OCR the plans … I just want
-- to see if I can get some dimensions off of plans accurately").
--
-- A scanned plan set has no text layer, so nothing can be read off it on the
-- server. The Plan Room reads it in the browser (tesseract.js, our own assets):
-- first each sheet's title block (number, title, printed scale), then the whole
-- sheet. What it read is kept on the sheet, a first reading like any other
-- (number_source stays 'read'; Coy's own numbers are never overwritten, and a
-- printed scale is only ever a suggestion until he applies it — §6 Plan Room).
--
-- Additive only. plan_sheets already has its member policy (get_user_org_ids())
-- and table-level grants to authenticated; anon has none.

alter table public.plan_sheets
  add column if not exists ocr_title_at timestamptz,   -- title block read by OCR
  add column if not exists ocr_at timestamptz,         -- whole sheet read by OCR
  add column if not exists ocr_text text,              -- the sheet's words, line by line
  add column if not exists ocr_words jsonb,            -- [[x, y, w, h, text, conf], …] in PDF points
  add column if not exists ocr_conf real,              -- mean word confidence, 0–100
  add column if not exists ocr_error text;

alter table public.plan_sheets
  add constraint plan_sheets_ocr_text_len check (ocr_text is null or length(ocr_text) <= 200000) not valid,
  add constraint plan_sheets_ocr_error_len check (ocr_error is null or length(ocr_error) <= 300) not valid,
  add constraint plan_sheets_ocr_conf_range check (ocr_conf is null or (ocr_conf >= 0 and ocr_conf <= 100)) not valid;
