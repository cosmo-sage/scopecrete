import urllib.request, json

key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o'
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