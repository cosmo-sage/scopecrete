// PM2 config for the VPS deployment.
//
// Credentials are READ FROM THE ENVIRONMENT, never written here. This file
// previously inlined both the anon key and the live service_role key; the repo
// was public until 2026-08-13, so both are treated as compromised and rotated.
//
// Provide these via the process manager's env file or shell, e.g.
//   pm2 start ecosystem.config.js --env production
// with SUPABASE_SECRET_KEY exported. See DECISIONS.md §9.
module.exports = {
  apps: [{
    name: 'scopecrete',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/dev.saccobuilt.com/calculator',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    }
  }]
};
