# Work order 12 report — 2026-08-31

Pushed to `master` as `95d066c`. One file changed: `src/app/page.tsx`. Build
green under only the three production environment variables; `tsc` 0 errors.

**Two answers up front, because both change what you do next:**

1. **There is no Google sign-in path on the page, or anywhere in the app.**
2. **The forgot-password button was already wired.** §4's premise did not hold —
   see §4 below for what is actually wrong.

---

## 1. Reveal password

`src/app/page.tsx` **L257–279**. Every requirement, and what satisfies it:

| Requirement | How |
|---|---|
| real `<button type="button">` | **L264**, not a div or a bare icon |
| `aria-pressed` reflects state | **L268** |
| label changes | **L269** — "Show password" / "Hide password" |
| toggles `type` on the **same** input | **L258–259**, `type={showPassword ? "text" : "password"}`. No second input — a swapped element loses the field for password managers |
| `autocomplete` preserved | **L260** `current-password`; **L243** the email field |
| default hidden, no persistence | **L65**, plain `useState(false)` — no storage, no cookie |
| ≥44×44 hit target | **L273–274**, exactly 44×44 |
| focus ring on keyboard focus | inherited from the page's `:focus-visible` rule |
| toggling does not move focus | **L266** `onMouseDown={(e) => e.preventDefault()}` so the button never takes focus, plus an explicit refocus |

**One thing I added that the spec did not ask for**, because the control is
worse without it: changing an input's `type` resets the selection range in some
browsers, so the caret jumps to position 0 mid-password. `toggleReveal()`
(**L110–122**) captures `selectionStart/End` and restores it on the next frame.
The `setSelectionRange` call is wrapped in try/catch because some input types
reject it.

**`autocomplete` on the email field changed**, `email` → `username`
(**L243**). `username` + `current-password` is the pair iOS Keychain and Chrome
match on a sign-in form; `email` alone pairs less reliably. This is the one
change in this work order that could plausibly *break* autofill rather than fix
it, so it is check 2 in §5 and worth testing on the actual phone.

## 2. Simplify

Removed: the `STILL CURING` headline, the "Baton Rouge, Louisiana" eyebrow, the
"Bid, schedule, and watch your cash from the truck…" tagline, the
"Private beta · by invitation" chip, and the whole footer (copyright line and
the `admin@scopecrete.ai` mailto — a secondary link).

The page is now: **logo → card**, centred, and the card is email, password with
reveal, error/notice, sign in — with "Forgot password?" on the password label
row.

Also dropped the "Contractor sign-in" eyebrow inside the card. On a page whose
only content is a sign-in form, a label saying so is the definition of
redundant.

**What I kept, as a judgement call you can overrule:** the slab texture — the
grit filter and aggregate speckle. §2 says a decorative panel goes, and I read
that as content panels rather than the page's ground. Removing it leaves a white
box on grey. It carries no words and costs no vertical space. The screed sweep
and the control-joint grid *are* gone, since those were structure for a layout
that no longer exists.

`IBM_Plex_Mono` was left imported and unused after the copy came out; import,
loader and the `mono` constant are all removed.

## 3. describeAuthError — unchanged, and proven

Not edited. Verified rather than asserted:

```
$ diff <(git show HEAD~1:src/app/page.tsx | sed -n '/function describeAuthError/,/^  }$/p') \
       <(sed -n '/function describeAuthError/,/^  }$/p' src/app/page.tsx)
  IDENTICAL
```

All four branches survive: the 429/rate-limit message, the unconfirmed-email
message, the generic bad-credentials message, and the pass-through that shows an
unrecognised provider message verbatim.

## 4. Forgot password — the button was never the problem

The handler was already correct on `master`, from work order 8: `L142–180`
calls `resetPasswordForEmail` with
`redirectTo: <origin>/auth/callback?type=recovery`, and the button at **L250–254**
has always been wired to it. I could not find a defect in the button, the
handler, or the callback route.

**What I did find, and fixed:**

- **Non-rate-limit errors were swallowed.** The old code checked for a 429 and
  otherwise fell through to the success notice — so a send that failed for any
  other reason reported "a reset link is on its way". That is precisely the
  failure this page exists to prevent, one branch further down. Now **L168–171**
  surfaces it: `Reset email failed: <message>`.
- **The notice over-promised.** Supabase returns success when it *accepts* the
  send, not when it delivers. The copy now says the mail service is slow and
  rate-limited and to wait before retrying (**L179**), rather than implying
  arrival.

### What a rate-limited send actually does — and the honest limit

You asked specifically. The distinguishable case: Supabase returns HTTP **429**
with a rate-limit message, and **L161–163** shows the explicit "only a few per
hour" error. That branch is real and it fires.

**But it does not cover the case that matters most.** Supabase deliberately
returns **success** from `resetPasswordForEmail` for an address that has no
account, to avoid revealing who is registered. From the client there is no way
to tell "queued and will arrive", "silently dropped by the built-in sender", and
"no such account" apart — all three return `{ error: null }`. So the honest
answer to §4 is: **a rate limit is distinguishable, a non-delivery is not.** The
copy now reflects that rather than claiming certainty it does not have.

Custom SMTP is the real fix and is out of scope, as you said.

**If the button still appears to do nothing on your phone, it is delivery, not
the button** — and the first thing to check is whether the email landed in spam,
because nothing in the code path can tell you.

## 5. Pass conditions, each with its failure

| # | Check | **Passes if** | **Fails if** |
|---|---|---|---|
| 1 | Tap the reveal toggle mid-typing | password becomes readable, field stays focused, **caret stays where it was** | focus jumps to another element, the field clears, or the caret moves to the start |
| 2 | iOS/Chrome autofill | saved login populates **both** fields | the saved credential is no longer offered — most likely cause is the `username` token, §1 |
| 3 | VoiceOver on the toggle | "Show password, button" then "Hide password, button, selected" | "button" with no name, or a label that never changes |
| 4 | Sign in with a wrong password | **"Email or password is incorrect."** | "Something went wrong", or any generic string |
| 4b | Sign in after ~6 rapid failures | **"Too many attempts… Your password is probably fine."** | the wrong-password message, which would mean §3 regressed |
| 5 | Page content | logo, email, password, sign in, forgot password — **nothing else** | any tagline, beta chip, footer link, or "Contractor sign-in" label |
| 6 | Forgot password with the field **empty** | inline error "Enter your email above first." | nothing happens (that would mean the handler is not reached) |
| 6b | Forgot password with a valid email | the notice appears; a link arrives and lands on **`/auth/reset-password`** | the notice appears and no email arrives — that is SMTP, not the button, §4 |

Check 6 is the one that falsifies "the button is dead" without depending on
email delivery at all: an empty field must produce a visible inline error. If it
does, the handler runs.

## 6. Google sign-in — it does not exist, and one account is locked out

`signInWithGoogle()` exists in `src/lib/auth.ts` **L5** and **has no call site
anywhere in `src/`**. The only import of that module is `signOut` in the
dashboard layout. The `/login` page that used to call it was deleted in work
order 10 as an unreachable second door.

Per your instruction I have **not** added it. But the consequence is worth
stating plainly, from `auth.users` this morning:

| email | provider | password | last sign-in |
|---|---|---|---|
| `coysacco@gmail.com` | google | **none** | 2026-06-04 |
| `admin@saccobuilt.com` | email | yes | **2026-08-29 21:15** |

**`coysacco@gmail.com` currently has no way into the app** — no Google button,
and no password to use the form with. `admin@saccobuilt.com` works and is what
you have been signing in with. `admin@coysacco.com`, which appeared in the
work-order-8 table, no longer exists.

Two fixes, either fine, neither in scope here: add the Google button back, or
set a password on that account from the Supabase dashboard.

## 7. What is UNVERIFIED

Nothing rendered in a browser — the egress denial is unchanged, so no dev server
here can reach Supabase Auth and no sign-in can complete. **Every check in §5
needs your phone**, and checks 1, 2 and 3 cannot be verified any other way,
since they are about focus, autofill and the screen reader.

Verified here: `describeAuthError` byte-identical by diff; build green under the
three production variables with `SUPABASE_SERVICE_ROLE_KEY` and `DEV_ORG_ID`
unset; `tsc` 0 errors; grep confirms the removed copy is gone and that no
`signInWithGoogle` call site exists.

## 8. What broke or surprised me

**I was asked to fix something that was not broken, for the second time.** §4
said forgot-password was "currently broken and long-pending". The handler has
been correct since work order 8. Rather than rewrite it, I read it, found the
real defect one branch below the one the work order pointed at — every
non-429 error falling through to a success message — and fixed that.

The pattern is now familiar enough to name: the *symptom* was real (the reset
does not appear to work), the *diagnosis* attached it to the visible control,
and the actual fault was in the invisible path behind it. It went the same way
with the sign-in form being called a mockup in work order 8. A button that
reports success while the email never arrives is indistinguishable, from the
truck, from a button that does nothing.

**The caret reset is the kind of thing that only shows up in use.** Nothing in
the spec mentions it and it type-checks perfectly either way — you would find it
by typing a fourteen-character password, tapping reveal to check a character,
and having the next keystroke land at the front of the string.

## 9. Open questions for Coy

1. **Google button back, or set a password on `coysacco@gmail.com`?** That
   account cannot sign in today. Say which and it is a small change.
2. **Slab texture — keep or strip?** I kept it and explained why in §2. If
   "nothing else" meant literally nothing, say so and it goes.
3. **Custom SMTP.** Until it exists, a reset email that never arrives is
   indistinguishable from one still queued, and §4 explains why no code on this
   page can close that gap.
4. Still outstanding from before: the backfill run, and whether a job is created
   explicitly or implicitly.
