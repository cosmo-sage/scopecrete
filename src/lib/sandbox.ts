// Which deployment this is, for a note on the sign-in page (Coy, 2026-10-05:
// "Put a little note on the login for the feedback branch login so I know if
// the feedback sandbox environment"). Vercel sets VERCEL_ENV and
// VERCEL_GIT_COMMIT_REF on every build; production, and anything off Vercel
// (localhost), gets no note. Read on the server only.
export function sandboxLabel(env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL_ENV !== "preview") return null;
  const ref = env.VERCEL_GIT_COMMIT_REF ?? "";
  if (ref === "claude/feedback") return "Feedback sandbox";
  return ref ? `Preview · ${ref}` : "Preview";
}
