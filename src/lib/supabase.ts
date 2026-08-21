import { createBrowserClient } from "@supabase/ssr";

/**
 * PUBLIC client — respects RLS. Safe to import from client components.
 *
 * The service-role client deliberately does NOT live here any more. It is in
 * ./supabase-admin, which no client component imports, so a browser bundle can
 * never pull in a module whose whole purpose is bypassing RLS.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
}
if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
}

// Cookie-backed (not localStorage) so proxy.ts and server route handlers can
// read the session too.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
