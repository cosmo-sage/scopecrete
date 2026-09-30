# Organisation name and logo: handoff (2026-09-30)

The reference is `Org Settings (mock).dc.html`. You can rename the org and upload a logo in it.
- 1a: the Settings sheet open, showing the new Organisation section.
- 1b: the header lockup in all four themes.
- The Tweaks panel switches the lockup between `right` (the default, Coy's pick) and `below`.

## 1. Renaming the org
- **One place:** the name is stored once, in `orgs.name`. Everything else (the header, `/api/session/me` → `org_name`, quotes and invoices, email signatures, Dusty's context) should look it up by `org_id`. **Don't copy the name into other tables.** Search the code for places that save their own copy of the org name (PDF headers, email templates, Dusty's prompt cache) and switch them to read it from `orgs.name`.
- **API:** `PATCH /api/org { name }`. Owners only. Trim the name and require 1–120 characters. Return `{ org }`.
- **Documents already sent:** keep the name they were sent with, since a sent invoice shouldn't change. Save a copy of the org name on each document at the moment it's sent, as part of its sent record.
- **Record the change:** write a row to the audit log (`org_renamed`, old name → new name).
- After saving, refresh `me` so the Settings subtitle and the header update without reloading the page.

## 2. Org logo
- **New columns:** `orgs.logo_light_url` and `orgs.logo_dark_url`, both nullable.
  - *light* = dark lettering, used on the Site Office, Blueprint and Kraft Yard themes.
  - *dark* = light lettering, used on Night Shift.
- **Upload:** `POST /api/org/logo` with multipart `file` and `variant=light|dark`. **Delete:** `DELETE /api/org/logo?variant=…`. Owners only.
  - Store uploads in Supabase Storage bucket `org-branding/{org_id}/logo-{variant}.{ext}`.
  - Accept PNG, SVG or WebP up to 5 MB. **Sanitize SVGs** by removing scripts and event handlers.
  - Resize PNGs so the longest side is at most 1200px. The uploaded originals are 6000px wide; the 900px copies in `assets/` are enough.
- **Choosing a logo:** use the variant that matches the theme. If it's missing, use the other variant. If both are missing, show the plain scopecrete.ai Wordmark, as the header does today.

## 3. Header lockup (`OrgLockup.tsx`)
- The logo is 28px tall and keeps its proportions. Then comes a 10px gap and a 1px rule in `--sc-pencil-line`.
- After the rule, stack **"powered by"** (Inter 300, 8.5px, `--sc-pencil-muted`) over a **mini Wordmark**: `size={10.5}` with no guide lines.
- It replaces `<Wordmark size={26} />` in `layout.tsx`. After the lockup come the existing divider and the activity line.
- On phones, use the logo at 24px and drop "powered by" if the header gets crowded.

## 4. Settings sheet (`OrgSettings.tsx`)
The order is: Signed in as → **Organisation** → Phone lines → Markups & overhead → Appearance → Menus → Sign out.
- Anyone who isn't an owner sees the section read-only, with an "Owners only" label.

## Files
- `OrgSettings.tsx`: the Settings section, with the name field and the two logo slots.
- `OrgLockup.tsx`: the header lockup.
- `assets/sacco-light.png` and `assets/sacco-dark.png`: Sacco Enterprises logos, 900×248, transparent, to seed the org.

Depends on the earlier handoffs:
- `palette-logo/Wordmark.tsx`, for the Wordmark.
- `themes/`, for the `--sc-*` colour variables.
