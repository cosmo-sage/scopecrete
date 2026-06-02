import urllib.request, json

url = 'https://scopecrete.ai/api/admin/login'
data = json.dumps({'username': 'admin', 'password': 'scopecrete2026'}).encode()

req = urllib.request.Request(url, data=data, headers={
    'Content-Type': 'application/json',
    'User-Agent': 'curl/7.88.1'
})

try:
    r = urllib.request.urlopen(req, timeout=10)
    body = r.read()
    print('Status:', r.getcode())
    print('Headers:', dict(r.headers))
    print('Body:', body.decode()[:200])
except urllib.error.HTTPError as e:
    print('HTTP Error:', e.code, e.reason)
    body = e.read()
    print('Error body:', body.decode()[:200])
except Exception as e:
    print('Error:', str(e))