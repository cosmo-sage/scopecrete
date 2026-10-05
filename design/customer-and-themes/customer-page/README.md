# Customer page redesign: handoff

The reference is `Customer Page (mock).dc.html`. It opens in a browser and the tabs, filters, map toggle, recording and transcript all work.
It uses the same shell as the `claude/feedback` branch: the draft-paper header, the full rail, and Customers active.

## 1. Data model: customer ≠ contact (the main change)
Today a contact *is* the customer: `person-view.tsx` reads `contact.address`. The new model:
- **Customer** (`customers` table, new): name, kind/subtype, **address** (with lat/lng), lead source, status, notes, primary contact.
- **Contact**: the existing `contacts.id`, plus a new `customer_id` column. Each contact has several **methods** (mobile, office, email), and a flag says which of them can receive texts.
- **Jobs** reference `customer_id`. A job can override the address with its own site address.
- The address on the customer page comes from **the customer**, never from a contact.
- Migration sketch: create `customers`, add `contacts.customer_id` and `jobs.customer_id`. Backfill one customer per contact already filed as `customer`, and move `contacts.address` → `customers.address`. Filing a contact as Customer in Threads should create a customer record or attach the contact to an existing one.

Types are in `types.ts`.

## 2. Page layout (desktop)
- **Header:** the "CUSTOMER" label, the customer name (Lexend 700, 28px), then one meta line: address · N contacts · N jobs · customer since. Actions: Call, Text, Email, Edit, **+ New scope** (primary). No type tag in the header; the type lives in the right panel.
- **Tabs:** Details · **Threads** (count) · Jobs · Documents · Payments · Files · Schedule.
- **Right panel, 440px, scrolls:** Location card → customer facts (Type, Lead source, Status, Notes) → **Contacts**.
  - Each contact card shows initials, name, ★ Primary, and role. Under that is one line per method (label · value · action), such as `Mobile (225) 555-0114 · Call · Text`.

## 3. Location card (`LocationCard.tsx`)
- A **Map | Street view** toggle over a 190px frame. It uses the Maps Embed API: `place` for the map, `streetview` for street view. Street view needs lat/lng, so geocode once when the address is saved.
- **The address sits below the frame.** Clicking it copies the address and shows "Copied ✓". The **Open in Maps ↗** button goes to `https://www.google.com/maps/search/?api=1&query=…`.
- It needs `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`, restricted to the app's domain. (The mock uses a keyless embed; don't ship that.)

## 4. Details tab
- **Dusty's summary** comes first, in IBM Plex Sans 14px on the Dusty tint, with no heading above it.
- **Job cards** follow, two across: name, status tag, and Quote/Paid/Open or Invoiced/Paid/Closed.
- Last is **"Latest across calls, texts and email"**: the 4 newest items from all contacts, each with a channel icon, and "All threads ›" linking to the Threads tab.

## 5. Threads tab: all three channels
- **Left filter panel (220px):**
  - Channel: All channels · Calls · Texts · Emails, with counts.
  - Contact: Everyone plus each contact, with counts. Each contact with a phone has a **green phone button** (`tel:` link). **That is the only Call control**; nothing in the timeline places a call.
- **Timeline:** oldest at the top, newest at the bottom, and it scrolls. It jumps to the bottom on open and when the tab, channel or contact filter changes (rAF + setTimeout after the state change). Day dividers go between days.
  - **Text:** a bubble. Outgoing messages sit on the right on `--sc-hiviz-dim`.
  - **Email:** a card with a violet left edge, a Sent/Received label, the subject, a preview and attachment chips.
  - **Call:** see `CallCard.tsx`. Summary first → next steps → **Recording** (play/pause, progress, clock) → **Transcript** (one line that expands) → **Notes** (per-call notes, "+ Add a note to this call").
- **Message box:** shown **only** when the channel filter is Texts or Emails. The channel comes from the filter, so there are no Text/Email/Note tabs. The "To" line uses the selected contact (or the primary contact) and their mobile or email.
- **No general notes here.** Notes about the customer go through the Dusty panel on the right. Notes on a specific call stay on that call's card.

## 6. Colours
Everything reads the `--sc-*` variables from `themes/`, so the page follows the Settings colour choice. See `themes/README.md`.
