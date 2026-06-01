import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Test: try to read body as text
  const text = await request.text();
  return NextResponse.json({ received: text });
}