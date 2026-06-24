module.exports = {
  apps: [{
    name: 'scopecrete',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/dev.saccobuilt.com/calculator',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://cxiusuewtrvcpqequueh.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQyMzQsImV4cCI6MjA5MjU2MDIzNH0.V4-ORThPINsHYoEOhMavp127ylqpXlH_DtBmNOH3PRA',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o',
    }
  }]
};
