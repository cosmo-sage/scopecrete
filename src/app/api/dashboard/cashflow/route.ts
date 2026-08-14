import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

  try {
    const [
      { data: jobs, error: jobsErr },
      { data: invoices, error: invErr },
      { data: payments, error: payErr },
      { data: receipts, error: recErr },
      { data: overhead, error: ohErr },
      { data: costSettings },
      { data: anchorRows },
      { data: estimates },
      { data: closeRateRows },
    ] = await Promise.all([
      supabase.from("jobs").select("id, job_number, title, status").eq("org_id", orgId),
      supabase.from("invoices").select("id, job_id, milestone_label, amount, due_on, status").eq("org_id", orgId),
      supabase.from("payments").select("id, invoice_id, job_id, amount, received_on").eq("org_id", orgId),
      supabase.from("receipts").select("id, job_id, vendor_name, amount, purchased_on, cost_type").eq("org_id", orgId),
      supabase.from("overhead_items").select("id, label, category, amount, cadence, due_day, due_month, active").eq("org_id", orgId),
      supabase.from("org_cost_settings").select("comp_mode, comp_monthly_draw, comp_profit_pct, owner_fee_pct, estimator_fee_pct, tax_reserve_pct").eq("org_id", orgId).maybeSingle(),
      supabase.from("balance_checkpoints").select("as_of_date, balance, expected_balance").eq("org_id", orgId).order("as_of_date", { ascending: false }).limit(1),
      supabase.from("estimates").select("job_id, quote_amount, created_at").eq("org_id", orgId).not("job_id", "is", null),
      supabase.rpc("sc_close_rate", { p_org_id: orgId, p_months: 12 }),
    ]);

    const err = jobsErr || invErr || payErr || recErr || ohErr;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const invoicesByJob: Record<string, number> = {};
    for (const inv of invoices ?? []) {
      invoicesByJob[inv.job_id] = (invoicesByJob[inv.job_id] ?? 0) + Number(inv.amount || 0);
    }
    const latestEstimateByJob: Record<string, number> = {};
    for (const est of estimates ?? []) {
      if (!est.job_id || est.quote_amount == null) continue;
      // rows arrive unordered across jobs; keep the most recently created per job
      const prev = latestEstimateByJob[`${est.job_id}__at`];
      if (!prev || est.created_at > prev) {
        latestEstimateByJob[est.job_id] = Number(est.quote_amount);
        latestEstimateByJob[`${est.job_id}__at`] = est.created_at as any;
      }
    }

    const outJobs = (jobs ?? []).map((j) => {
      const invoiced = invoicesByJob[j.id] ?? 0;
      const estimated = latestEstimateByJob[j.id] ?? 0;
      const total = j.status === "won" ? (invoiced || estimated || 0) : (estimated || invoiced || 0);
      return { id: j.id, num: j.job_number || j.id.slice(0, 8), name: j.title || "Untitled job", status: j.status, total };
    });

    const outInvoices = (invoices ?? []).map((i) => ({
      id: i.id,
      job: i.job_id,
      label: i.milestone_label || "Invoice",
      amount: Number(i.amount || 0),
      due_on: i.due_on,
      status: i.status,
    }));

    const outPayments = (payments ?? []).map((p) => ({
      id: p.id,
      inv: p.invoice_id,
      job: p.job_id,
      amount: Number(p.amount || 0),
      received_on: p.received_on,
    }));

    const outReceipts = (receipts ?? []).map((r) => ({
      id: r.id,
      job: r.job_id,
      vendor: r.vendor_name || "Unknown vendor",
      amount: Number(r.amount || 0),
      on: r.purchased_on,
      type: r.cost_type || "other",
    }));

    const outOverhead = (overhead ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      category: o.category,
      amount: Number(o.amount || 0),
      cadence: o.cadence,
      due_day: o.due_day,
      due_month: o.due_month,
      active: o.active,
    }));

    const offTopPct = costSettings
      ? Number(costSettings.owner_fee_pct || 0) + Number(costSettings.estimator_fee_pct || 0) + Number(costSettings.tax_reserve_pct || 0)
      : 11;

    const anchorRow = anchorRows?.[0];
    const today = new Date().toISOString().slice(0, 10);
    const anchor = anchorRow
      ? { as_of: anchorRow.as_of_date, balance: Number(anchorRow.balance), expected: anchorRow.expected_balance != null ? Number(anchorRow.expected_balance) : Number(anchorRow.balance) }
      : { as_of: today, balance: 0, expected: 0 };

    const closeRateRow = Array.isArray(closeRateRows) ? closeRateRows[0] : closeRateRows;

    return NextResponse.json({
      today,
      anchor,
      jobs: outJobs,
      invoices: outInvoices,
      payments: outPayments,
      receipts: outReceipts,
      overhead: outOverhead,
      comp: {
        mode: costSettings?.comp_mode || "fixed_draw",
        monthly_draw: Number(costSettings?.comp_monthly_draw || 0),
        // draw_day isn't in org_cost_settings yet — see DECISIONS.md open items.
        draw_day: 28,
        profit_pct: Number(costSettings?.comp_profit_pct || 0),
      },
      offTopPct,
      close: {
        rate: Number(closeRateRow?.close_rate_pct || 0),
        sample: Number(closeRateRow?.sample_size || 0),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
