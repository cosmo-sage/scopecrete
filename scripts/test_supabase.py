import os

# Read from the environment. This file used to inline the live
# service_role key; the repo was public until 2026-08-13.
import urllib.request, json

key = os.environ['SUPABASE_SECRET_KEY']
req = urllib.request.Request(
    'https://cxiusuewtrvcpqequueh.supabase.co/rest/v1/orgs?limit=1',
    headers={'Authorization': 'Bearer ' + key, 'apikey': key}
)
try:
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print('Supabase: OK, status=' + str(r.getcode()) + ', orgs=' + str(len(d)))
except Exception as e:
    print('Supabase: FAIL ' + str(e)[:80])