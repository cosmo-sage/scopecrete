import urllib.request, json

req = urllib.request.Request(
    'http://localhost:8000/v1/chat/completions',
    data=json.dumps({'model': 'qwen2.5:0.5b', 'messages': [{'role': 'user', 'content': 'hi'}], 'stream': False}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    r = urllib.request.urlopen(req, timeout=5)
    print('Ollama: OK', r.status)
except Exception as e:
    print('Ollama: DOWN', str(e)[:100])