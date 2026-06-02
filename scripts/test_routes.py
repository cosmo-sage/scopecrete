import subprocess

tests = [
    ('GET', 'https://scopecrete.ai/', 'landing or maintenance'),
    ('GET', 'https://scopecrete.ai/dashboard-login', 'login page'),
    ('GET', 'https://scopecrete.ai/dashboard', 'contractor dashboard'),
    ('GET', 'https://scopecrete.ai/admin/dashboard', 'admin dashboard'),
    ('POST', 'https://scopecrete.ai/api/admin/login', 'admin login api'),
]

for method, url, label in tests:
    extra = []
    if method == 'POST':
        extra = ['-X', 'POST']
    r = subprocess.run(
        ['curl', '-s', '--max-time', '10', '-I'] + extra + [url],
        capture_output=True, text=True, timeout=15
    )
    first_line = r.stdout.strip().split('\n')[0] if r.stdout.strip() else 'NO RESPONSE'
    print(f'{label}: {first_line}')

# Also test if middleware is protecting /dashboard
r2 = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-I', 'https://scopecrete.ai/dashboard'],
    capture_output=True, text=True, timeout=15
)
print(f'---')
print(f'/dashboard redirect status: {r2.stdout.strip().split(chr(10))[0]}')