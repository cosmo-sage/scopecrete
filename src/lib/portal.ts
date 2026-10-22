/**
 * A customer's portal (migration 123) — scopecrete.ai/c/<token>, no login. The
 * customer sees the proposals sent to them and the bid requests they sent, and
 * sends a new request with their plans. Pure rules here; the page is
 * src/components/v34/portal/portal-page.tsx, the doors sc_portal /
 * sc_portal_request.
 */

/** Where a request they sent stands, in the customer's words — from the job it made. */
export function requestStage(jobStatus: string | null | undefined, archived = false): { label: string; tone: "new" | "work" | "sent" | "won" | "done" | "off" } {
  if (archived) return { label: "Closed", tone: "off" };
  switch (jobStatus) {
    case "invited": case "lead": return { label: "Received", tone: "new" };
    case "consultation": case "scoping": return { label: "Pricing it", tone: "work" };
    case "quoted": return { label: "Proposal sent", tone: "sent" };
    case "won": case "scheduled": return { label: "Won", tone: "won" };
    case "in_progress": return { label: "In progress", tone: "won" };
    case "complete": case "closed": return { label: "Done", tone: "done" };
    case "lost": return { label: "Not going ahead", tone: "off" };
    default: return { label: "Received", tone: "new" };
  }
}

/** A proposal's line on the portal: signed, opened or sent. */
export function proposalState(p: { signed_at?: string | null; signed_by?: string | null; viewed?: boolean }, day: (iso: string) => string): string {
  if (p.signed_at) return `Signed${p.signed_by ? ` by ${p.signed_by}` : ""} ${day(p.signed_at)}`;
  return p.viewed ? "Opened" : "Not opened yet";
}

/** A file name storage will take: no folders, no odd characters, at most 120. */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, " ").trim();
  const clean = base.replace(/^\.+/, "") || "file";
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 8 ? clean.slice(dot) : "";
  return clean.slice(0, 120 - ext.length) + ext;
}

/** The storage path an upload goes to — the only folder sc_portal_upload_ok lets anon write. */
export function portalPath(orgId: string, portalId: string, fileId: string, name: string): string {
  return `${orgId}/portal/${portalId}/${fileId}/${safeFileName(name)}`;
}

export type PortalCategory = "plan" | "spec" | "photo" | "other";

/** A first guess at what a file is, for the customer to change. */
export function guessCategory(name: string, mime = ""): PortalCategory {
  const n = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(n)) return "photo";
  if (/spec|specification|project manual|itb|instructions/.test(n)) return "spec";
  if (/\.pdf$/.test(n) || mime === "application/pdf") return "plan";
  return "other";
}

/** The words Coy sends with the link. */
export function portalMessage(o: { customer: string | null; org: string; url: string }): { subject: string; body: string } {
  return {
    subject: `Your ${o.org} portal`,
    body: `Here's your private page with ${o.org}${o.customer ? ` for ${o.customer}` : ""}: every proposal we've sent you, and a place to send us a bid request with your plans. Save it — no login needed.\n${o.url}`,
  };
}

/** A day typed into the form: yyyy-mm-dd, today or later, within two years. */
export function validDue(day: string | null | undefined, today: string): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = Date.parse(`${day}T12:00:00Z`), t = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null;
  return d >= t - 86400000 && d <= t + 730 * 86400000 ? day : null;
}
