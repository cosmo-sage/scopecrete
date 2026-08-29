import { NextRequest, NextResponse } from "next/server";

interface LeadPayload {
  session_id?: string;
  source_channel: "insta_quote" | "dusty_chat" | "phone" | "sms" | "email";
  customer_name?: string;
  customer_phone: string;
  customer_email?: string;
  project_type: string;
  length_ft?: number;
  width_ft?: number;
  sqft: number;
  depth_in: number;
  psi?: number;
  zip?: string;
  estimate_range_min: number;
  estimate_range_max: number;
  estimate_mode: "ballpark" | "firm";
  engine: string;
  calibration_source?: string;
  conversation_log?: unknown;
  wizard_snapshot?: unknown;
}

const REQUIRED_FIELDS: (keyof LeadPayload)[] = [
  "source_channel",
  "customer_phone",
  "project_type",
  "sqft",
  "depth_in",
  "estimate_range_min",
  "estimate_range_max",
  "estimate_mode",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const missing = REQUIRED_FIELDS.filter((f) => {
      const val = body[f];
      return val === undefined || val === null || val === "";
    });
    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing required: ${missing.join(", ")}` }, { status: 400 });
    }

    // This is the public door: a customer filling in the estimator. Two things
    // used to go wrong here and both reported success.
    //
    // The key chain ended `|| NEXT_PUBLIC_SUPABASE_ANON_KEY`, so a missing
    // service credential produced a working client with anon privileges —
    // the insert RLS-filtered away, and nothing saying why. And when both
    // were absent the route returned a fabricated `mock-<timestamp>` id with
    // HTTP 200, so the customer saw a confirmation for a lead that was never
    // written. A dropped lead that announces itself as saved is the worst
    // outcome available here.
    //
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY were deleted with the dead
    // project's integration. SUPABASE_SECRET_KEY is the surviving credential,
    // matching the chain in src/lib/supabase-admin.ts.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Log the lead so it is recoverable from the function logs rather than
      // lost outright, then fail honestly.
      console.error("[POST /api/leads] REFUSING: no Supabase service credential. Lead not saved:", {
        source_channel: body.source_channel,
        customer_phone: body.customer_phone,
        project_type: body.project_type,
        sqft: body.sqft,
        estimate_range: `${body.estimate_range_min}–${body.estimate_range_max}`,
      });
      return NextResponse.json(
        { error: "Lead capture is not configured on this deployment. Nothing was saved." },
        { status: 503 },
      );
    }

    const insertPayload = {
      source_channel: body.source_channel,
      customer_name: body.customer_name || null,
      customer_phone: body.customer_phone,
      customer_email: body.customer_email || null,
      project_type: body.project_type,
      length_ft: body.length_ft || null,
      width_ft: body.width_ft || null,
      sqft: body.sqft,
      depth_in: body.depth_in,
      psi: body.psi || 3000,
      zip: body.zip || null,
      estimate_range_min: body.estimate_range_min,
      estimate_range_max: body.estimate_range_max,
      estimate_mode: body.estimate_mode,
      engine: body.engine || null,
      calibration_source: body.calibration_source || null,
      wizard_snapshot: body.wizard_snapshot || null,
      conversation_log: body.conversation_log || null,
      status: "new",
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[POST /api/leads] Supabase error:", res.status, errText);
      return NextResponse.json(
        { error: `Supabase error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data[0] || data, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/leads] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
