import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, company } = body;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseKey || !supabaseUrl) {
      return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    // Insert into a contractor_leads table (create if not exists)
    const response = await fetch(`${supabaseUrl}/rest/v1/contractor_leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email,
        name: name || null,
        company: company || null,
        source: "coming_soon_page",
        created_at: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ success: true, id: data[0]?.id });
    }

    // If table doesn't exist, try to create it first
    if (response.status === 404) {
      // Create table via SQL
      const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          query: `CREATE TABLE IF NOT EXISTS contractor_leads (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            company TEXT,
            source TEXT DEFAULT 'coming_soon_page',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );`,
        }),
      });

      if (createResponse.ok) {
        // Retry insert
        const retryResponse = await fetch(`${supabaseUrl}/rest/v1/contractor_leads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            email,
            name: name || null,
            company: company || null,
            source: "coming_soon_page",
          }),
        });

        if (retryResponse.ok) {
          return NextResponse.json({ success: true });
        }
      }

      return NextResponse.json(
        { error: "Could not create table" },
        { status: 500 }
      );
    }

    // Duplicate email - already registered
    if (response.status === 409) {
      return NextResponse.json({ success: true, message: "Already registered" });
    }

    const errorText = await response.text();
    return NextResponse.json(
      { error: `Insert failed: ${response.status}`, details: errorText },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}