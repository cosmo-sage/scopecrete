/**
 * Dusty's chat window (Claude Design "Emblem States", 2026-10-10): the quick
 * selects a fresh chat offers for the page that is open, and the status line
 * beside his emblem. Pure, so it is tested (tests/dusty-quick.test.mjs).
 */

export interface Quick {
  label: string;
  /** Sent as Coy's message on the tap. */
  ask?: string;
  /** "›" — put in the box for Coy to finish, not sent. */
  more?: string;
  /** Opens a form instead of asking (the + menu's own). */
  create?: "contact" | "job" | "customer" | "vendor" | "receipt" | "quote" | "bill" | "group" | "card";
}

/** The quick selects for a page: a job's views, the Dashboard, a thread or customer, and each main
 *  page's own (Coy, 2026-10-10: "Dusty will have different prompt buttons depending on what menu
 *  page it's opened inside of"). */
export function quickFor(pathname: string): Quick[] {
  const p = pathname.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/^\/dashboard\/scope\/[^/]+/.test(p)) return [
    { label: "Daily brief", ask: "Give me a daily brief on this job — where it stands and what's next." },
    { label: "Price this job", more: "Price this job: " },
    { label: "Takeoff from the plans", ask: "What should I measure from the plans for this job, sheet by sheet?" },
    { label: "Market rates", more: "Look up going rates for " },
    { label: "Write the proposal", more: "Write the proposal's " },
    { label: "File a receipt", ask: "Help me file a receipt on this job — which budget line does it go on?" },
    { label: "Crew and days", ask: "How many crew and days does this job need, from its budget?" },
  ];
  if (p === "/dashboard") return [
    { label: "Daily brief", ask: "Give me a daily brief — what came in, what's due, what needs me today." },
    { label: "What needs me", ask: "What needs me right now?" },
    { label: "Price a new job", more: "Price a new job: " },
    { label: "Who hasn't heard back", ask: "Who hasn't heard back from me — customers waiting on an answer or a price?" },
  ];
  if (/^\/dashboard\/messages\/[^/]+/.test(p)) return [
    { label: "New text", more: "Write a text to them that " },
    { label: "New email", more: "Write an email to them that " },
    { label: "Summarize this thread", ask: "Summarize this thread — where it stands and the next steps." },
    { label: "Make a job from this", ask: "Make a job from this conversation." },
  ];
  if (p === "/dashboard/messages") return [
    { label: "Who needs a reply", ask: "Who is waiting on a reply from me — texts, calls and emails I haven't answered?" },
    { label: "New text", more: "Write a text to " },
    { label: "New email", more: "Write an email to " },
  ];
  if (p === "/dashboard/scope-builder") return [
    { label: "New scope", create: "job" },
    { label: "What's next", ask: "Which scopes need me next, and what does each one wait on?" },
  ];
  if (p === "/dashboard/scope") return [
    { label: "New job", create: "job" },
    { label: "What needs moving", ask: "Which jobs have sat in their stage too long, and what's the next step on each?" },
  ];
  if (p === "/dashboard/map") return [
    { label: "Where leads come from", ask: "Which cities and parishes have my latest leads come from?" },
  ];
  if (p === "/dashboard/customers") return [
    { label: "New customer", create: "customer" },
    { label: "Who to follow up", ask: "Which customers should I follow up with this week?" },
  ];
  if (p === "/dashboard/vendors") return [
    { label: "Vendor", create: "vendor" },
    { label: "Receipt", create: "receipt" },
    { label: "Quote", create: "quote" },
    { label: "Bill", create: "bill" },
  ];
  if (p === "/dashboard/price-book") return [
    { label: "New group", create: "group" },
    { label: "New card", create: "card" },
    { label: "Build an assembly", more: "Build an assembly for " },
  ];
  if (p === "/dashboard/roadmap") return [
    { label: "Funny take on feedback", ask: "Give me a funny observation about the feedback on the Roadmap." },
  ];
  if (/^\/dashboard\/customers\/[^/]+/.test(p)) return [
    { label: "Summarize this thread", ask: "Summarize this thread — where it stands and the next steps." },
    { label: "Draft a reply", more: "Draft a reply that " },
    { label: "Make a job from this", ask: "Make a job from this conversation." },
    { label: "File the texted photos", ask: "File the photos they texted onto their job." },
  ];
  if (p === "/dashboard/contacts") return [
    { label: "Add a contact", create: "contact" },
    { label: "Scan a business card", create: "contact" },
  ];
  return [];
}

export type StatusState = "idle" | "listening" | "thinking" | "reading" | "answering" | "done" | "warn" | "sleeping";

/** The detail line under "Ready" / "Thinking…" … — real data only, never invented. */
export function statusDetail(state: StatusState, o: { about?: string | null; quick?: boolean; desktop?: boolean; hearing?: boolean; note?: string | null }): string {
  switch (state) {
    case "listening": return o.hearing ? "writing down your voice note" : o.desktop ? "Go on — Ctrl + Enter sends it" : "Go on — ↑ sends it";
    case "thinking": return o.about || "your question";
    case "answering": return "writing the answer";
    case "done": return o.note || "done";
    case "warn": return o.note || "couldn't answer — try again";
    case "sleeping": return "nothing is being read";
    case "reading": return o.note || "reading";
    default: return o.about
      ? `Ask about ${o.about}${o.quick ? ", or pick something above" : ""}`
      : o.quick ? "Ask anything, or pick something above" : "Ask anything about your business";
  }
}
