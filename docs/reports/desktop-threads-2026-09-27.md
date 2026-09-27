# Desktop shell and Threads in three panes — report, 2026-09-27

This is PR B of the plan "v34 on desktop and mobile". The branch also contains
the #14 and #15 branches (photos, merges) and #16 (the scope builder). The
reason: "Open scope" and "New scope" link to the builder, and the conversation
page contains the merge work.

## Your decisions, applied

- **The look is v34's; the layout is the desktop design's.** The Archivo type
  and red accent are not used.
- **"Triage" is not used anywhere. The screen is Threads.** I also removed the
  word from the design README, and wrote the rule into DECISIONS §6.
- **No home dashboard was built**, because none has been designed yet.

## What changed

**Desktop only (lg and wider):**

- **Top bar:**
  - search inline in the bar
  - your primary line (from `org_phone_numbers`, primary and active)
  - an **Unnamed** count (176), which opens Threads on the Unsorted chip
  - a **Drift** count (from `sc_spine_drift`)
  - Each counter is hidden until its number is known; it never shows 0 as a
    stand-in.
- **Left rail** in place of the footer: Threads, Scope, Cash and More, with
  Dusty at the bottom. Phones keep the footer.
- **Contact rail** beside the conversation, on wider screens (xl) only:
  - Contact: the name and whether you confirmed it, numbers, address, first
    heard, and text and call counts
  - Scope on file: this contact's jobs, each linking to the builder
  - Money: says nothing is recorded, and why
  - Dusty: says it is not connected
- The design's "read of the day" and draft replies are not there. Nothing
  produces them, so showing them would mean showing something invented.

**Phone and desktop:**

- **Order:** the conversation now reads oldest to newest, with a divider for
  each day and IN/OUT on each text, and opens scrolled to the end. The API
  still returns newest first; the screen reverses it.
- **Calls:** a call with extracted next steps shows them without a tap. It
  loads them on its own, only for the calls that have them (57 in the
  database). "Read the full transcript" still loads the transcript only when
  opened.
- **Numbers with nothing on record:** a thread made only of calls with no
  words shows "Nothing was said on record."
- **Header:** first heard, text and call counts, Call, Same person as…, and
  Open scope (or New scope, which creates the job and opens the builder).

## Checks

| check | result |
|---|---|
| `tsc` | clean |
| `next build` | passes |
| eslint | 0 errors (3 old warnings) |
| `npm test` | 18/18 |
| screenshots at 1440 and 390 | taken with made-up sample data, from the scratchpad |

For the screenshots I turned off the login check in the local copy only, then
put it back. It is not in any commit.

## What you check in the browser

1. **Desktop, Threads**, on a window at least 1280 wide.
   - **Pass:** you see the left rail, the list, the conversation and the
     contact rail. The top bar shows your main number, Unnamed and Drift.
2. **Open a thread whose calls have transcripts.**
   - **Pass:** next steps show without a tap, and the transcript opens when
     you ask for it.
3. **Open a number that only ever called.**
   - **Pass:** it says "Nothing was said on record."
4. **New scope from a thread.**
   - **Pass:** the builder opens with that contact on it.

## Not done

- Snooze and "mark handled" on a thread. There is nowhere to store them.
  `messages.triage` exists, but it is per message and every row is `pending`;
  deciding how to use it is a data decision for you.
- Naming a number from the conversation screen. It is still done from the row
  in the thread list.
- Customers is PR C.
