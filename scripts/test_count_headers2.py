import urllib.request, json

svc_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o'
supabase_url = 'https://cxiusuewtrvcpqequueh.supabase.co'

# Try with Prefer header
queries = [
    ('orgs', supabase_url + '/rest/v1/orgs?select=*', [('Prefer', 'count=exact')]),
    ('orgs_limit5', supabase_url + '/rest/v1/orgs?select=id,name,slug,plan_tier,created_at&order=created_at.desc&limit=5', []),
    ('leads_recent', supabase_url + '/rest/v1/leads?select=id,customer_name,status,source_channel,estimate_total,created_at,orgs(name)&not=org_id,is=null&order=created_at.desc&limit=10', []),
    ('leads_orphaned', supabase_url + '/rest/v1/leads?select=id,customer_name,customer_phone,project_description,status,estimate_total,created_at,source_channel&is=org_id,is=null', []),
]

for name, url, extra_headers in queries:
    headers = {'Authorization': 'Bearer ' + svc_key, 'apikey': svc_key, 'Prefer': 'count=exact'}
    for k, v in extra_headers:
        headers[k] = v
    req = urllib.request.Request(url, headers=headers)
    try:
        r = urllib.request.urlopen(req, timeout=10)
        body = r.read()
        print(f'{name}: status={r.getcode()}, body_len={len(body)}, headers={str(r.headers)[:80]}')
        if r.getcode() != 200:
            print('  body:', body.decode()[:200])
    except Exception as e:
        print(f'{name}: FAIL - {str(e)[:80]}')