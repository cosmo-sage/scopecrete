# Customers — report, 2026-09-27

This is PR C of the plan "v34 on desktop and mobile". The branch also contains
PR B (#17), and through it #14, #15 and #16.

## What was built

- **The list**, at `/dashboard/customers`: v34's CustomersScreen.
  - You can search by name, number or street.
  - Each row shows the person's job count, text and call counts, and when you
    last heard from them.
  - On a phone you reach it from More. On desktop it has its own place in the
    left rail.
- **A person's page**, at `/dashboard/customers/[id]`, which shows:
  - their name, and whether you confirmed it
  - Open thread and Call
  - "What they are to the business": customer, vendor or sub
  - their numbers, email and address
  - their jobs, plus a New scope button
  - Money, which says plainly that nothing is recorded
- **Desktop** uses two panes: the list on the left, the person on the right.

## One change from v34

v34 has two tabs, Customers and Vendors & subs. I added a third,
**Unclassified**.

The database marks every customer row as "customer" by default. All 135 rows
say "customer", and none of them has been confirmed. Another 63 contacts have
no customer row at all. With only v34's two tabs, all of them would appear
under Customers without anyone having said so.

So a person only appears under Customers or Vendors & subs after you have
marked them. Today that means almost everyone is under Unclassified.

## What marking someone does

Marking a contact writes it to their customer record, with a note that it was
done by hand, when, and by whom. If they have no customer record yet, one is
created.

**Marking someone a vendor or sub stops new leads being created for them.** A
lead that is already open stays. The screen says this under the buttons.
"Clear" takes them back to Unclassified.

## Checks

| check | result |
|---|---|
| Your session: create a customer record, update a relation | works (rolled back) |
| Another user tries to change your customers, or read them | changes nothing, sees nothing |
| `tsc`, `next build`, eslint on the touched files | clean |
| Screenshots at 1440 and 390 | taken with made-up data |

For the screenshots I turned off the login check in the local copy only, then
put it back. It is not in any commit.

**Message counts are fetched in pages of 1,000.** The database returns at most
1,000 rows per request by default, and there are 1,504 messages, so fetching
in one go would undercount.

**Something to check in the existing Threads list:** it fetches up to 4,000
messages in one request. If the same 1,000-row limit applies there, some
threads could be missing from the list today. I couldn't confirm the limit
from here, because the sandbox can't reach the API.

## What you check in the browser

1. **Customers.** On a phone, go through More. On desktop, use the left rail.
   - **Pass:** almost everyone is under Unclassified, and the counts match
     what you'd expect.
2. **Mark a known sub (Luis) as Sub.**
   - **Pass:** he moves to Vendors & subs. His next text does not create a new
     lead.
3. **Clear.**
   - **Pass:** he is back in Unclassified.
