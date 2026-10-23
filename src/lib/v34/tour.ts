/**
 * The first-login tour (Coy, 2026-10-22: "some kind of Tour on mobile and desktop with bubbles
 * that pop up and highlight the functions and features of the app … so he's not confused when he
 * first logs in"). Pure: which steps, in what order, for which layout, and where a bubble goes.
 * Drawn by src/components/v34/tour.tsx.
 *
 * Two tours: `shell` (the rail, the drawer, search, alerts, Dusty, Settings) the first time
 * someone opens the dashboard, and `job` (a job's views) the first time they open a job. Each is
 * marked seen on the account once finished or skipped (`tours_seen` in /api/prefs);
 * Settings → Account → Take the tour again clears both.
 */

export type TourKind = "shell" | "job" | "takeoffs" | "budget";
export const TOUR_KINDS: TourKind[] = ["shell", "job", "takeoffs", "budget"];
export type TourLayout = "desktop" | "phone";

export interface TourStep {
  id: string;
  /** CSS selectors tried in order; the first one on screen is highlighted. None = a centred card. */
  targets?: string[];
  title: string;
  body: string;
  /** Phone: the Work Spaces slide out from under the page for this step. */
  spaces?: boolean;
  /** A button on the last card. */
  cta?: { label: string; href: string };
}

export interface TourOpts {
  layout: TourLayout;
  /** The Spaces navigation (on unless switched off in Settings → Appearance). */
  spaces: boolean;
  name?: string | null;
  /** The org has sample records in (migration 119). */
  sample?: { job_id: string | null } | null;
}

const first = (name?: string | null) => {
  const w = (name ?? "").trim().split(/\s+/)[0];
  return w && !/[@\d]/.test(w) ? w : "";
};

export function tourSteps(kind: TourKind, o: TourOpts): TourStep[] {
  return kind === "job" ? jobSteps(o) : kind === "takeoffs" ? takeoffSteps(o) : kind === "budget" ? budgetSteps(o) : shellSteps(o);
}

function shellSteps(o: TourOpts): TourStep[] {
  const hi = first(o.name);
  const phone = o.layout === "phone";
  const steps: TourStep[] = [{
    id: "welcome",
    title: hi ? `Welcome to ScopeCrete, ${hi}` : "Welcome to ScopeCrete",
    body: (o.sample
      ? "A one-minute look around. We put in a sample customer, two sample jobs and a few Price book items so there's something to click. Each says \"sample\" and they come out with one tap in Settings → Account. "
      : "A one-minute look around. ")
      + "Next walks you through it; Skip ends it. You can take it again any time from Settings → Account.",
  }];
  if (o.spaces) {
    if (phone) {
      steps.push({
        id: "talk", targets: [".sc-talk-bar"],
        title: "Ask Dusty anything",
        body: "Dusty is your estimating assistant. Type here about the page you're on: price this job, draft a text to the customer, what's left to scope. He suggests the steps; nothing changes until you tap Apply.",
      });
    }
    steps.push(
      {
        id: "rail", targets: [".sc-spaces-rail"], spaces: true,
        title: "Work Spaces",
        body: phone
          ? "Swipe right from the left edge of any page (or tap ☰) to bring these out. Each open job and its customer gets a tile here; + makes a Work Space of your own."
          : "The rail down the left. Each open job and its customer gets a tile; + makes a Work Space of your own. Drag tiles to put them in your order.",
      },
      {
        id: "home", targets: [".sc-spaces-rail .sc-space-home"], spaces: true,
        title: "Home is Dusty",
        body: "The top tile is Home: your chat with Dusty, and the shelves of tools you use every day. Your full list of Customers, Jobs, Vendors and Contacts can also be found here.",
      },
      {
        id: "drawer", targets: [".sc-spaces-drawer", ".sc-spaces-strip"], spaces: true,
        title: "The drawer",
        body: "Whatever you pick on the rail opens here. Shelves hold the tools (Jobs, Customers, Price book, Vendors, Files) and the channels: Phone, Email and Internal threads. The gear on a shelf changes what's on it.",
      },
      {
        id: "search", targets: [".sc-spaces-search"], spaces: true,
        title: "Search everything",
        body: "Customers, jobs, texts, call notes, files and the words inside them, all from one box.",
      },
      {
        id: "alerts", targets: ['.sc-spaces-bar button[aria-label^="Alerts"]'], spaces: true,
        title: "Alerts",
        body: "Texts, calls and emails that came in over the last three days. Each one opens its thread.",
      },
    );
    if (!phone) {
      steps.push({
        id: "dusty", targets: [".sc-dusty-sheet", ".sc-dusty-strip"],
        title: "Dusty, beside every page",
        body: "Ask him to price a job, read the plans, draft a proposal or a text. He knows the page you're on. He suggests the steps; nothing changes until you tap Apply. The arrow folds him away.",
      });
    }
    steps.push({
      id: "settings", targets: ['.sc-spaces-rail a[aria-label="Settings"]'], spaces: true,
      title: "Settings",
      body: "Your name, your company's logo, people and what they can open, your cost book and templates. Take this tour again from Settings → Account.",
    });
  } else {
    steps.push(
      {
        id: "menu", targets: phone ? ['nav[aria-label="Main"]', ".sc-tab"] : [".sc-rail"],
        title: "Your pages",
        body: phone
          ? "Your three main pages and Dusty sit on the footer; the Toolbox holds the rest."
          : "Every page, in your order. Menu settings at the foot changes the order and colors.",
      },
      {
        id: "dusty", targets: [".sc-tab-dusty", ".sc-dusty-sheet"],
        title: "Dusty",
        body: "Your estimating assistant. He suggests; nothing changes until you tap Apply.",
      },
    );
  }
  steps.push({
    id: "done",
    title: "That's the lay of the land",
    body: "The first time you open a job we'll show you how a scope runs: Files → Takeoffs → Budget → Proposal."
      + (o.sample?.job_id ? " The sample driveway job is a good one to start with." : ""),
    cta: o.sample?.job_id ? { label: "Open the sample job", href: `/dashboard/scope/${o.sample.job_id}/summary` } : undefined,
  });
  return steps;
}

function jobSteps(o: TourOpts): TourStep[] {
  const phone = o.layout === "phone";
  return [
    {
      id: "job-welcome",
      title: "Inside a job",
      body: "Every job runs the same way, left to right: Summary, Files, Takeoffs, Budget, Proposal. Here's where each lives.",
    },
    {
      id: "job-views",
      targets: [".sc-job-tabs", ".sc-spaces-drawer"],
      spaces: o.spaces,
      title: "The job's views",
      body: o.spaces
        ? "This job's drawer: Summary (who it's for, the site, what's next), Takeoffs (measure on the plans or a satellite clip), Market rate, Proposed budget, Actual costs and the Proposal."
        : "Summary (who it's for, what's next) · Files (plans, photos) · Takeoffs (measure on the plans) · Budget (cost items from your Price book) · Proposal (what the customer sees and signs).",
    },
    {
      id: "job-name",
      targets: [".sc-job-switch", ".sc-job-name"],
      title: "Switch jobs",
      body: "Tap the job's name to jump to another job without going back to the list. The pencil renames it.",
    },
    {
      id: "job-dusty",
      targets: phone ? [".sc-talk-bar", ".sc-dusty-page-btn"] : [".sc-dusty-sheet", ".sc-dusty-strip", ".sc-dusty-page-btn"],
      title: "Let Dusty do the legwork",
      body: "On a job, ask Dusty to write the scope of work, fill a section's budget from its size and the specs, look up going rates, or draft the proposal. Every change waits for your Apply.",
    },
    {
      id: "job-done",
      title: "You're set",
      body: "Proposals go to the customer as a link they open on their phone, approve and sign. Settings → Account → Take the tour again shows all this again.",
    },
  ];
}

/**
 * Takeoffs, the first time it is opened (Coy, 2026-10-23: "a tour guide of Takeoffs and budgets").
 * Its parts are found by the labels takeoff.tsx already gives them, so the page carries no tour hooks.
 */
function takeoffSteps(o: TourOpts): TourStep[] {
  const phone = o.layout === "phone";
  return [
    {
      id: "tk-welcome",
      title: "Takeoffs",
      body: "This is where you measure the plans. Pick a sheet, set its scale, then draw areas, lines and counts. What you measure becomes the budget's sections.",
    },
    {
      id: "tk-sheets",
      targets: phone ? ['[aria-label^="Sheets, "]'] : ['.sc-param-panel [role="tablist"]', ".sc-param-panel"],
      title: "Sheets",
      body: phone
        ? "Every page of the plans you added on Files, and any satellite clip from the Map. Tap one to measure on it."
        : "Every page of the plans you added on Files, and any satellite clip from the Map. Pick one to measure on, or tick two to four to compare them side by side.",
    },
    {
      id: "tk-scale",
      targets: ['[title^="Recalibrate"]'],
      title: "Set the scale first",
      body: "Nothing on a sheet is counted until it has a scale. Use the scale it prints, pick a preset, or click the two ends of a dimension you know.",
    },
    {
      id: "tk-tools",
      targets: phone ? ['[aria-label="Measuring tools"]'] : ['[aria-label="Takeoff tools"]'],
      title: "Measuring tools",
      body: phone
        ? "Pan and Select, then this button for every measuring tool: Area, Rectangle, Fill, Cutout, Linear, Count. Finish a line by tapping its last point again."
        : "Area, Rectangle, Fill (click inside an outline and it is traced for you), Cutout, Linear, Count and the Ruler. Each one's key is in its tooltip. Finish a line by clicking its last point again.",
    },
    {
      id: "tk-params",
      targets: phone ? ['[aria-label^="Parameters, "]'] : [".sc-param-panel"],
      title: "Parameters",
      body: "Your measurements in groups (Sidewalk 4\", Curb …) with their totals. The eye hides a group on the sheet, and $ Group sends a whole group to the budget as a section that keeps following your edits.",
    },
    {
      id: "tk-ai",
      targets: ['[title^="AI Takeoff"]'],
      title: "AI Takeoff",
      body: "Dusty finds the thickness zones from the legend, or the control joints, and draws them for you to check. Nothing is saved until you press Keep.",
    },
    {
      id: "tk-undo",
      targets: ['[aria-label="Undo"]'],
      title: "Back and Forward",
      body: phone ? "Undo or redo your last changes on the plans." : "Undo or redo your last changes on the plans (Ctrl + Z, Ctrl + Shift + Z).",
    },
    {
      id: "tk-ask",
      targets: ['[title^="Ask someone about a spot"]'],
      title: "Ask about a spot",
      body: "Pin a question on the sheet. It goes to that person's thread with a link that opens the sheet right at the spot.",
    },
    {
      id: "tk-done",
      title: "That's Takeoffs",
      body: "Measure, send it to the budget, then price each section there. Settings → Account → Take the tour again shows these again.",
    },
  ];
}

/** The Budget (the job page itself), the first time it is opened. Found by the page's own labels. */
function budgetSteps(o: TourOpts): TourStep[] {
  const phone = o.layout === "phone";
  const items = "Ask Dusty to add this section's items";
  return [
    {
      id: "bd-welcome",
      title: "The budget",
      body: "Each section is one piece of the work, a driveway or a curb run, with its size and its cost items. The price comes only from those items.",
    },
    {
      id: "bd-section",
      targets: ["[data-sec-id]"],
      title: "A section",
      body: phone
        ? "Tap it to open. Its size comes from Takeoffs, or type it in. Hold the grip and drag to reorder."
        : "Click it to open. Its size comes from Takeoffs, or type it in. Drag the grip to reorder.",
    },
    {
      id: "bd-measured",
      targets: ['[aria-label="Measured by"]'],
      title: "How it's measured",
      body: "Length × width, area, linear feet or a count. A cost item in the same unit takes its quantity from here.",
    },
    {
      id: "bd-sow",
      targets: ['[aria-label="Ask Dusty to write the scope of work"]'],
      title: "Scope of work",
      body: "The steps from start to finish, as bullets. The emblem has Dusty write them, and they show on the proposal too.",
    },
    {
      id: "bd-items",
      targets: [`div:has(> [aria-label="${items}"])`, `[aria-label="${items}"]`],
      title: "Cost items",
      body: "+ Add item opens your Price book. The emblem asks Dusty to fill the section from its size, the plans and the specs, and nothing goes on until you press Apply.",
    },
    {
      id: "bd-totals",
      targets: ['section[aria-label="Budget"]'],
      title: "Job totals",
      body: "Whole-job costs (mobilization, a pump day), sales tax, and the cost analysis: labor, materials, equipment, overhead and profit, per SF and per day.",
    },
    {
      id: "bd-price",
      targets: ['aside:has([aria-label="Profit margin on this job"])'],
      title: "The price",
      body: "Cost, overhead and profit, the margin slider, and where your price sits in the going-rate range near the job.",
    },
    {
      id: "bd-tools",
      targets: [".sc-budget-tabs", ".sc-spaces-drawer"],
      spaces: o.spaces,
      title: "Market rate and Actual costs",
      body: "Market rate looks up going prices for each section. Actual costs tracks what the job really costs once it's won, against this budget.",
    },
    {
      id: "bd-done",
      title: "That's the budget",
      body: "When it's priced, the Proposal turns it into what the customer sees and signs. Settings → Account → Take the tour again shows these again.",
    },
  ];
}

/** `tours_seen` as saved; anything else reads as nothing seen. */
export function seenTours(v: unknown): TourKind[] {
  if (!Array.isArray(v)) return [];
  return v.filter((k): k is TourKind => (TOUR_KINDS as unknown[]).includes(k));
}

export function markSeen(v: unknown, kind: TourKind): TourKind[] {
  const s = seenTours(v);
  return s.includes(kind) ? s : [...s, kind];
}

/** Which tour, if any, starts on its own on this page. */
export function autoTour(path: string, seen: TourKind[]): TourKind | null {
  if (!seen.includes("shell")) return path.startsWith("/dashboard") ? "shell" : null;
  const job = /^\/dashboard\/scope\/[0-9a-f-]{36}(\/.*)?$/.exec(path);
  if (!job) return null;
  // The job tour first; each page's own the first time that page is opened after it.
  if (!seen.includes("job")) return "job";
  const rest = job[1] ?? "";
  if (/^\/plans\/?$/.test(rest) && !seen.includes("takeoffs")) return "takeoffs";
  if (/^\/?$/.test(rest) && !seen.includes("budget")) return "budget";
  return null;
}

export interface Box { top: number; left: number; width: number; height: number }
export type Side = "below" | "above" | "right" | "left" | "center";

/**
 * Where the bubble goes beside a highlighted box: below it if there's room, else above, else to
 * the right, else to the left, else over it; always inside the screen with a margin.
 */
export function placeBubble(target: Box | null, bubble: { width: number; height: number }, view: { width: number; height: number }, gap = 12, margin = 10): { top: number; left: number; side: Side } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - bubble.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - bubble.height - margin));
  if (!target) return { top: clampY((view.height - bubble.height) / 2), left: clampX((view.width - bubble.width) / 2), side: "center" };
  const cx = target.left + target.width / 2 - bubble.width / 2;
  const cy = target.top + target.height / 2 - bubble.height / 2;
  const below = target.top + target.height + gap;
  if (below + bubble.height <= view.height - margin) return { top: below, left: clampX(cx), side: "below" };
  const above = target.top - gap - bubble.height;
  if (above >= margin) return { top: above, left: clampX(cx), side: "above" };
  const right = target.left + target.width + gap;
  if (right + bubble.width <= view.width - margin) return { top: clampY(cy), left: right, side: "right" };
  const left = target.left - gap - bubble.width;
  if (left >= margin) return { top: clampY(cy), left, side: "left" };
  return { top: clampY(view.height - bubble.height - margin), left: clampX(cx), side: "center" };
}
