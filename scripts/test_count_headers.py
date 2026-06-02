import urllib.request, json

svc_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o'
supabase_url = 'https://cxiusuewtrvcpqequueh.supabase.co'

# Simulate the exact queries from admin dashboard page.tsx
queries = [
    ('orgs', supabase_url + '/rest/v1/orgs?select=*&count=exact'),
    ('org_members', supabase_url + '/rest/v1/org_members?select=*&count=exact'),
    ('leads', supabase_url + '/rest/v1/leads?select=*&count=exact'),
    ('leads_won', supabase_url + '/rest/v1/leads?select=estimate_total&status=eq.won&count=exact'),
    ('recent_orgs', supabase_url + '/rest/v1/orgs?select=id,name,slug,plan_tier,created_at&order=created_at&asc=false&limit=5'),
]

for name, url in queries:
    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + svc_key,
        'apikey': svc_key
    })
    try:
        r = urllib.request.urlopen(req, timeout=10)
        body = r.read()
        # Check for count in headers
        count_header = r.headers.get('content-range', '')
        print(f'{name}: status={r.getcode()}, content-range={count_header[:30]}, body_len={len(body)}')
        if r.getcode() == 200 and len(body) < 200:
            print('  body:', body.decode()[:200])
    except Exception as e:
        print(f'{name}: FAIL - {str(e)[:80]}')