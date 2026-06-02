import subprocess, json

svc_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o'
supabase_url = 'https://cxiusuewtrvcpqequueh.supabase.co'

# Test without count param first
tables = ['orgs', 'org_members', 'leads']
for table in tables:
    r = subprocess.run(
        ['curl', '-s', '--max-time', '10',
         '-H', 'Authorization: Bearer ' + svc_key,
         '-H', 'apikey: ' + svc_key,
         supabase_url + '/rest/v1/' + table + '?limit=1'],
        capture_output=True, text=True, timeout=15
    )
    d = r.stdout.strip()
    if d.startswith('{'):
        try:
            err = json.loads(d)
            print(table + ': ERROR - ' + str(err.get('message', d[:80])))
        except:
            print(table + ': UNKNOWN JSON: ' + d[:80])
    elif d.startswith('['):
        print(table + ': OK rows=' + d[:100])
    else:
        print(table + ': UNEXPECTED: ' + d[:100])