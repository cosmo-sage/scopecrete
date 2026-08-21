import { createClient } from "@supabase/supabase-js";

/**
 * The ONE service-role client. SERVER ONLY.
 *
 * Consolidated from two duplicate definitions that both exported `supabaseAdmin`
 * (src/lib/supabase.ts and the entirely unimported src/lib/supabaseAdmin.ts).
 *
 * WHY THIS THROWS RATHER THAN FALLING BACK
 *
 * Both old versions ended their key lookup with `|| supabaseAnonKey`. A missing
 * or misspelled service key therefore produced a WORKING client with anon
 * privileges — every query silently RLS-filtered, most returning zero rows, and
 * nothing anywhere saying why. That is the same failure shape that hid
 * findOpenLead returning the wrong object for the life of the intake pipeline,
 * and hid the enricher 404ing on a decommissioned model for two months.
 *
 * A credential that is absent is a configuration error, not a degraded mode.
 * It fails loudly, at the first attempt to use it, naming the variable.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// SUPABASE_SECRET_KEY (sb_secret_…) is the replacement for the legacy
// service_role JWT. The legacy name stays in the chain ONLY so the two survive
// side by side during the rotation — remove it once the legacy key is disabled.
const serviceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
}
if (!serviceKey) {
  throw new Error(
    "No Supabase service credential. Set SUPABASE_SECRET_KEY (preferred) or " +
      "SUPABASE_SERVICE_ROLE_KEY. Refusing to fall back to the anon key — " +
      "that silently degrades every admin query to RLS-filtered results."
  );
}

// A legacy service_role key is a JWT and starts with "eyJ"; the new secret keys
// do not. Surfaces "still on the old key" during the rotation without failing.
if (serviceKey.startsWith("eyJ")) {
  console.warn(
    "[supabase-admin] Using the LEGACY service_role JWT. Set SUPABASE_SECRET_KEY " +
      "to complete the rotation; this key stops working when legacy keys are disabled."
  );
}

/** Bypasses RLS. Never import this from a client component. */
export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The credential the admin client is using, for server-to-server calls. */
export const supabaseServiceKey = serviceKey;
