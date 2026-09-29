import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The org's cost settings and monthly overhead — what the costing engine and
 * the bid floor read (DECISIONS.md §3, §4). Session client, org from session.
 *
 * WHY EVERY FIELD IS WRITTEN EXPLICITLY
 *
 * `org_cost_settings` (migration 004) carries the Gulfline reference rates as
 * COLUMN DEFAULTS — concrete $236.13, form & finish $1.43, markups 30.61 /
 * 41.77 / 30.12 and so on. An upsert that sent only the three fields Coy typed
 * would get the other fifteen filled in by the database, and the screen would
 * show a price built from numbers nobody entered for this business.
 *
 * So PUT requires the whole object. Every nullable rate is written, as null
 * when blank. The NOT NULL numbers and the pay-yourself mode must be
 * supplied — a blank there is a 400 naming the field, not a silent default.
 *
 * Step 3b (migration 050): a job is priced only by its budget (cost cards), so
 * the old per-yard / per-sq-ft / mobilization rates are no longer read or
 * shown. They are still WRITTEN, as null, so a first save cannot pull the
 * Gulfline column defaults into this business's row. tax_applies_to (NOT
 * NULL) is written as 'materials' and unused: each card says if it is taxed.
 */

export const dynamic = "force-dynamic";

/** Nullable numeric columns. Blank means "not recorded" and is stored as null. */
const RATES = [
  "concrete_overage_pct", "shortload_threshold_cy", "sales_tax_pct",
  "markup_material_pct", "markup_labor_pct", "markup_equipment_pct", "markup_subcontract_pct",
  "comp_monthly_draw", "comp_profit_pct",
] as const;
/** Retired by step 3b — always written as null (see above), never read. */
const RETIRED = ["concrete_price_per_cy", "shortload_pct", "form_finish_per_sqft", "demo_per_sqft", "mobilization_fee"] as const;

/** NOT NULL numeric columns — must be given. */
const REQUIRED_NUM = ["owner_fee_pct", "estimator_fee_pct", "tax_reserve_pct", "assumed_billable_days"] as const;

const COLUMNS = [...RATES, ...REQUIRED_NUM, "comp_mode", "use_measured_days", "updated_at"].join(", ");

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const [settings, overhead] = await Promise.all([
    supabase.from("org_cost_settings").select(COLUMNS).eq("org_id", orgId).maybeSingle(),
    supabase.from("overhead_items")
      .select("id, label, category, amount, cadence, active, notes, due_day")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  if (settings.error) return applyCookies(NextResponse.json({ error: `org_cost_settings: ${settings.error.message}` }, { status: 500 }));
  if (overhead.error) return applyCookies(NextResponse.json({ error: `overhead_items: ${overhead.error.message}` }, { status: 500 }));

  // null settings = no row = nothing recorded. The client renders blanks, not defaults.
  return applyCookies(NextResponse.json({ settings: settings.data ?? null, overhead: overhead.data ?? [] }));
}

export async function PUT(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const row: Record<string, unknown> = { org_id: orgId };
  const bad: string[] = [];
  const missing: string[] = [];

  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

  for (const f of RATES) {
    const v = body[f];
    if (v === null || v === undefined || v === "") { row[f] = null; continue; }
    const n = num(v);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) bad.push(f); else row[f] = n;
  }
  for (const f of REQUIRED_NUM) {
    const v = body[f];
    if (v === null || v === undefined || v === "") { missing.push(f); continue; }
    const n = num(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000) bad.push(f); else row[f] = n;
  }
  if (typeof row.assumed_billable_days === "number" && row.assumed_billable_days <= 0) bad.push("assumed_billable_days");

  if (body.comp_mode === "fixed_draw" || body.comp_mode === "pct_profit") row.comp_mode = body.comp_mode;
  else missing.push("comp_mode");
  for (const f of RETIRED) row[f] = null;
  row.tax_applies_to = "materials";
  // Measured crew-days do not exist yet (no receipts, no daily logs), so this
  // stays false until they do. Not client-settable.
  row.use_measured_days = false;

  const offTop = ["owner_fee_pct", "estimator_fee_pct", "tax_reserve_pct"]
    .reduce((a, k) => a + (typeof row[k] === "number" ? (row[k] as number) : 0), 0);
  if (offTop >= 100) bad.push("off-the-top adds to 100% or more");

  if (missing.length || bad.length) {
    return applyCookies(NextResponse.json({
      error: [
        missing.length ? `Required: ${missing.join(", ")}.` : "",
        bad.length ? `Not a valid value: ${bad.join(", ")}.` : "",
      ].filter(Boolean).join(" "),
      missing, bad,
    }, { status: 400 }));
  }

  const { data, error } = await supabase
    .from("org_cost_settings")
    .upsert(row, { onConflict: "org_id" })
    .select(COLUMNS)
    .single();

  if (error) return applyCookies(NextResponse.json({ error: `org_cost_settings: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ settings: data }));
}
