import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieOptionsFor } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface EstimateEntry {
  amount: number;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  // Session-scoped client: RLS applies. org_id is never taken from the
  // request — it's resolved from the authenticated user's org_members row,
  // so a caller can only ever see their own org's financials.
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(req),
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => { cookiesToSet.push(...toSet); },
    },
  });

  const applyCookies = (res: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
    return res;
  };

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return applyCookies(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
  }

  const { data: membership, error: memberErr } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberErr || !membership) {
    return applyCookies(NextResponse.json({ error: "No org membership for this user" }, { status: 403 }));
  }
  const orgId = membership.org_id;

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
      supabase.from("jobs").select("id, job_number, title, status").eq("org_id", orgId).is("archived_at", null),
      supabase.from("invoices").select("id, job_id, milestone_label, amount, due_on, status").eq("org_id", orgId),
      supabase.from("payments").select("id, invoice_id, job_id, amount, received_on").eq("org_id", orgId),
      supabase.from("receipts").select("id, job_id, vendor_name, amount, purchased_on, cost_type").eq("org_id", orgId),
      supabase.from("overhead_items").select("id, label, category, amount, cadence, due_day, due_month, active").eq("org_id", orgId),
      supabase.from("org_money_settings").select("comp_mode, comp_monthly_draw, comp_profit_pct").eq("org_id", orgId).maybeSingle(),
      supabase.from("balance_checkpoints").select("as_of_date, balance, expected_balance").eq("org_id", orgId).order("as_of_date", { ascending: false }).limit(1),
      supabase.from("estimates").select("job_id, quote_amount, created_at").eq("org_id", orgId).not("job_id", "is", null),
      supabase.rpc("sc_close_rate", { p_org_id: orgId, p_months: 12 }),
    ]);

    const err = jobsErr || invErr || payErr || recErr || ohErr;
    if (err) return applyCookies(NextResponse.json({ error: err.message }, { status: 500 }));

    const invoicesByJob: Record<string, number> = {};
    for (const inv of invoices ?? []) {
      invoicesByJob[inv.job_id] = (invoicesByJob[inv.job_id] ?? 0) + Number(inv.amount || 0);
    }
    const latestEstimateByJob: Record<string, EstimateEntry> = {};
    for (const est of estimates ?? []) {
      if (!est.job_id || est.quote_amount == null) continue;
      const prev = latestEstimateByJob[est.job_id];
      if (!prev || est.created_at > prev.createdAt) {
        latestEstimateByJob[est.job_id] = { amount: Number(est.quote_amount), createdAt: est.created_at };
      }
    }

    const outJobs = (jobs ?? []).map((j) => {
      const invoiced = invoicesByJob[j.id] ?? 0;
      const estimated = latestEstimateByJob[j.id]?.amount ?? 0;
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

    const anchorRow = anchorRows?.[0];
    const today = new Date().toISOString().slice(0, 10);
    // NULL when no balance checkpoint has been recorded. The old shape returned
    // balance: 0, which the UI printed as "$0" — a statement that the account is
    // empty, when the truth is that nobody has told us what is in it. Starting
    // cash is a manual checkpoint (DECISIONS.md §5); absent is not zero.
    const anchor = anchorRow
      ? {
          as_of: anchorRow.as_of_date,
          balance: Number(anchorRow.balance),
          expected: anchorRow.expected_balance != null ? Number(anchorRow.expected_balance) : Number(anchorRow.balance),
        }
      : null;

    const closeRateRow = Array.isArray(closeRateRows) ? closeRateRows[0] : closeRateRows;

    return applyCookies(NextResponse.json({
      today,
      anchor,
      jobs: outJobs,
      invoices: outInvoices,
      payments: outPayments,
      receipts: outReceipts,
      overhead: outOverhead,
      // comp is null with no settings row. Defaulting mode to "fixed_draw" made
      // the UI assert a pay-yourself mode nobody had chosen — the value showed
      // "—" while the label underneath still claimed "the bid floor must cover
      // this". The value was honest and the sentence beside it was not.
      comp: costSettings?.comp_mode
        ? {
            mode: costSettings.comp_mode,
            monthly_draw: Number(costSettings.comp_monthly_draw || 0),
            // draw_day isn't recorded yet — see DECISIONS.md open items.
            draw_day: 28,
            profit_pct: Number(costSettings.comp_profit_pct || 0),
          }
        : null,
      close: {
        rate: Number(closeRateRow?.close_rate_pct || 0),
        sample: Number(closeRateRow?.sample_size || 0),
      },
    }));
  } catch (e) {
    console.error(e);
    return applyCookies(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
