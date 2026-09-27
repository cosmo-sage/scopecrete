# Feedback loop — how Coy's comments become changes

- **Where to comment:** the preview for branch `claude/feedback`, at
  https://scopecrete-git-claude-feedback-coy2.vercel.app
  Use the Vercel toolbar's Comment tool on any element, from a phone or
  desktop.
- **How the comments are handled:**
  - Claude Code reads the comments with `list_toolbar_threads` (branch
    `claude/feedback`).
  - Clear changes are fixed on this branch; questions come back as a reply on
    the comment.
  - Every comment gets a reply saying what changed, or why nothing did.
- **The preview redeploys itself** on every push. Same link every time.
- **Getting it to scopecrete.ai:** when a round looks right, Coy says "merge
  feedback", and the branch is merged to `master` through a PR. It then starts
  again from the new `master`.
- **Nothing reaches production without that instruction** (DECISIONS §7).
