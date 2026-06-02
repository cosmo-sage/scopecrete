import subprocess

# Test each stat query with service role key
svc_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o'
supabase_url = 'https://cxiusuewtrvcpqequueh.supabase.co'

tables = ['orgs', 'org_members', 'leads', 'market_pricing', 'admin_chat_sessions']
for table in tables:
    r = subprocess.run(
        ['curl', '-s', '--max-time', '10',
         '-H', 'Authorization: Bearer ' + svc_key,
         '-H', 'apikey: ' + svc_key,
         supabase_url + '/rest/v1/' + table + '?select=*&count=exact&limit=1'],
        capture_output=True, text=True, timeout=15
    )
    d = r.stdout
    if 'infinite recursion' in d:
        print(table + ': INFINITE RECURSION')
    elif '"code"' in d and '"message"' in d:
        import json
        try:
            err = json.loads(d)
            print(table + ': ERROR - ' + str(err.get('message', err.get('code', 'unknown'))[:80]))
        except:
            print(table + ': ERROR - ' + d[:100])
    elif r.returncode == 0:
        print(table + ': OK, response=' + d[:100])
    else:
        print(table + ': FAIL http ' + str(r.returncode))