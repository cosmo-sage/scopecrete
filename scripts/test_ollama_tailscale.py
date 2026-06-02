import urllib.request, json

# Test 100.113.194.47:8000 from VPS
for path in ['/v1/chat/completions', '/v1/models']:
    try:
        req = urllib.request.Request(
            f'http://100.113.194.47:8000{path}',
            data=json.dumps({'model': 'qwen2.5:0.5b', 'messages': [{'role': 'user', 'content': 'hi'}], 'stream': False}).encode(),
            headers={'Content-Type': 'application/json'}
        )
        r = urllib.request.urlopen(req, timeout=5)
        print(f'{path}: UP status={r.getcode()}, response={r.read().decode()[:100]}')
    except Exception as e:
        print(f'{path}: DOWN {str(e)[:80]}')