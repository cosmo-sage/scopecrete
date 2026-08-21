import os

# Read from the environment. This file used to inline the live
# service_role key; the repo was public until 2026-08-13.
import subprocess, json

svc_key = os.environ['SUPABASE_SECRET_KEY']
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