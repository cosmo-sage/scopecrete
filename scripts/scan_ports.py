import urllib.request, json

ports = [11434, 8000, 8080]
for p in ports:
    try:
        req = urllib.request.Request(
            f'http://100.113.194.47:{p}/v1/models',
            headers={'Content-Type': 'application/json'}
        )
        r = urllib.request.urlopen(req, timeout=3)
        print(f'port {p}: UP status={r.getcode()}')
    except Exception as e:
        print(f'port {p}: DOWN {str(e)[:60]}')