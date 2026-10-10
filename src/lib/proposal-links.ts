/**
 * Sending a proposal by link (migration 075; Coy, 2026-10-03: "send the
 * proposal via text and email … track every time the customer views the
 * proposal"). Pure — tested in tests/proposal-links.test.mjs.
 *
 * ScopeCrete sends nothing (DECISIONS §10): the link goes out from Coy's own
 * phone or mail app through an sms: or mailto: link, written here.
 */

export interface LinkAssets {
  /** Every storage path the link may show — the anon storage policy reads this list. */
  paths: string[];
  logo?: string | null;
  logo_dark?: string | null;
  cover?: string | null;
  /** area id → its frozen map picture. */
  maps?: Record<string, string>;
  /** area id → its photos. */
  photos?: Record<string, string[]>;
}

/** The assets object from what the link shows; paths outside the org's own folder are left out. */
export function linkAssets(orgId: string, a: Omit<LinkAssets, "paths">): LinkAssets {
  const mine = (p: string | null | undefined): p is string => !!p && p.split("/")[0] === orgId && !p.includes("..");
  const maps: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.maps ?? {})) if (mine(v)) maps[k] = v;
  const photos: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(a.photos ?? {})) { const ok = v.filter(mine).slice(0, 4); if (ok.length) photos[k] = ok; }
  const out: LinkAssets = {
    paths: [], logo: mine(a.logo) ? a.logo : null, logo_dark: mine(a.logo_dark) ? a.logo_dark : null,
    cover: mine(a.cover) ? a.cover : null, maps, photos,
  };
  out.paths = [...new Set([out.logo, out.logo_dark, out.cover, ...Object.values(maps), ...Object.values(photos).flat()].filter(mine))];
  return out;
}

/** A link token: 24 random bytes, base64url — 32 characters. */
export function newToken(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";

/** The words that go with the link. */
export function linkMessage(o: { customer: string | null; org: string; title: string | null; url: string; options?: number }): { subject: string; body: string } {
  const hi = first(o.customer) ? `Hi ${first(o.customer)}, ` : "Hi, ";
  const what = o.title ? `the proposal for ${o.title}` : "your proposal";
  const pick = o.options && o.options > 1 ? ` It has ${o.options} options to choose from.` : "";
  return {
    subject: `${o.title ? `${o.title} — ` : ""}proposal from ${o.org}`.trim(),
    body: `${hi}here is ${what}.${pick} ${o.url}\n\n— ${o.org}`,
  };
}

/** sms: on a phone opens Messages with the number and the words; iOS and Android both read `?&body=`. */
export function smsHref(phone: string | null, body: string): string {
  const to = (phone ?? "").replace(/[^\d+]/g, "");
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string | null, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email ?? "").replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** "viewed 3 times · last 2h ago" / "not opened yet". */
export function viewLine(v: { view_count: number; last_viewed_at: string | null }, now = Date.now()): string {
  if (!v.view_count || !v.last_viewed_at) return "not opened yet";
  const mins = Math.max(0, Math.round((now - Date.parse(v.last_viewed_at)) / 60000));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  return `opened ${v.view_count === 1 ? "once" : `${v.view_count} times`} · last ${ago}`;
}

/** What the customer agrees to when they sign on the link (097) — shown beside the tick and stored with it. */
export const SIGN_CONSENT = "I agree to sign this proposal electronically, and that my signature here is as binding as one on paper.";

/** "Signed by Johnette Wilson · Oct 9, 6:24 PM" when the customer signed on the link (097), else null. */
export function signedLine(v: { status: string; decided_name?: string | null; decided_at?: string | null }): string | null {
  if (v.status !== "accepted") return null;
  const when = v.decided_at ? new Date(v.decided_at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return `Signed by ${v.decided_name?.trim() || "the customer"}${when ? ` · ${when}` : ""}`;
}

type Rec = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const pick = (r: unknown, keys: string[]): Rec | null => {
  if (!r || typeof r !== "object") return null;
  const o: Rec = {};
  for (const k of keys) if ((r as Rec)[k] !== undefined) o[k] = (r as Rec)[k];
  return o;
};

/**
 * What the customer's link carries (migration 075 `documents.shown`): the
 * frozen version's words, areas and prices AS THE CUSTOMER SEES THEM — never
 * the cost, overhead, profit or margin, never a hidden group or line (not even
 * its name), never a hidden price (its number is zeroed; the page shows "—"),
 * never the areas' notes. The snapshot itself stays in the org.
 */
export function publicSnapshot(snap: Rec, extra: { project_type: string | null; type_label: string }): Rec {
  const price = (snap.price ?? {}) as Rec;
  const display = (snap.display ?? {}) as Rec;
  const groups = Array.isArray(price.groups) ? (price.groups as Rec[]) : [];
  const shownPrice = price.ok === true ? {
    ok: true,
    groups: groups.filter((g) => !g.hidden).map((g) => ({
      key: g.key, name: g.name, sqft: n(g.sqft), hidden: false, price_hidden: !!g.price_hidden,
      sell: g.price_hidden ? 0 : n(g.sell) ?? 0,
      items: (Array.isArray(g.items) ? (g.items as Rec[]) : []).filter((i) => !i.hidden).map((i) => ({
        id: i.id, name: i.name, note: s(i.note), qty: n(i.qty), unit: s(i.unit) ?? "", hidden: false,
        price_hidden: !!i.price_hidden, addon: !!i.addon, sell: i.price_hidden ? 0 : n(i.sell) ?? 0,
      })),
    })),
    subtotal: n(price.subtotal) ?? 0, tax: n(price.tax) ?? 0, tax_shown: !!price.tax_shown, discount: n(price.discount) ?? 0,
    total: n(price.total) ?? 0, addons_total: n(price.addons_total) ?? 0,
    // Not the customer's business — kept at zero so the shape stays one type.
    cost: 0, overhead: 0, calc: 0, rounded: 0, profit: 0, margin: 0, by_type: { material: 0, labor: 0, equipment: 0, other: 0 },
  } : { ok: false, blocked: [] };
  const choices = snap.choices && typeof snap.choices === "object" ? snap.choices as Rec : null;
  const picsOff = (display.picsOff ?? {}) as Record<string, boolean>;
  return {
    number: s(snap.number), made_at: s(snap.made_at), project_type: extra.project_type, type_label: extra.type_label,
    job: pick(snap.job, ["title", "address"]),
    customer: pick(snap.customer, ["name", "address_formatted", "address_line1", "city", "state", "zip"]),
    contact: pick(snap.contact, ["name", "phone", "email"]),
    prepared_by: pick(snap.prepared_by, ["name", "phone", "email"]),
    org: { name: s((snap.org as Rec | null)?.name) },
    display: {
      off: display.off ?? {}, show_item_prices: !!display.show_item_prices, show_qty: !!display.show_qty, show_tax_line: !!display.show_tax_line,
      hide_area_pics: !!display.hide_area_pics, picsOff, all_options: !!display.all_options,
      preliminary: !!display.preliminary,
    },
    draws: Array.isArray(snap.draws) ? (snap.draws as Rec[]).map((d) => ({ pct: n(d.pct), amt: n(d.amt), when: s(d.when) ?? "" })) : [],
    scope_intro: s(snap.scope_intro),
    warranty_text: pick(snap.warranty_text, ["title", "body"]),
    terms_text: { title: s((snap.terms_text as Rec | null)?.title), clauses: Array.isArray((snap.terms_text as Rec | null)?.clauses) ? ((snap.terms_text as Rec).clauses as Rec[]).map((c) => ({ h: s(c.h) ?? "", b: s(c.b) ?? "" })) : [] },
    sections: (Array.isArray(snap.sections) ? (snap.sections as Rec[]) : []).map((x) => pick(x, ["id", "name", "work_type", "length_ft", "width_ft", "sqft_override", "depth_in", "psi", "rebar", "count_qty", "count_unit"])),
    price: shownPrice,
    choices: choices ? {
      list: (Array.isArray(choices.list) ? (choices.list as Rec[]) : []).map((c) => ({ id: c.id, label: s(c.label) ?? "", total: n(c.total), blocked: null, own: Array.isArray(c.own) ? c.own : [] })),
      shared: Array.isArray(choices.shared) ? choices.shared : [],
    } : null,
  };
}
