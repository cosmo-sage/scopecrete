import { NextRequest, NextResponse } from "next/server";
import { APP_MANIFEST, installable } from "@/lib/install";

// The app's manifest, only where ScopeCrete may be installed (src/lib/install.ts).
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  if (!installable(request.headers.get("host"))) {
    return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(APP_MANIFEST, {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
