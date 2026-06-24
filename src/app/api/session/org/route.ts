import { NextResponse } from "next/server";

export async function GET() {
  const orgId = process.env.DEV_ORG_ID || "61e26b09-da88-4c9f-bd0c-a47054b86234";
  return NextResponse.json({ orgId });
}
