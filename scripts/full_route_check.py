import subprocess

tests = [
    ('/dashboard without cookie', 'https://scopecrete.ai/dashboard', ''),
    ('/dashboard with cookie', 'https://scopecrete.ai/dashboard', 'sc_session=scopecrete_dashboard_session'),
    ('/admin/login no cookie', 'https://scopecrete.ai/admin/login', ''),
    ('/admin/dashboard with cookie', 'https://scopecrete.ai/admin/dashboard', 'sc_session=scopecrete_dashboard_session'),
    ('/maintenance', 'https://scopecrete.ai/maintenance', ''),
]

for label, url, cookie in tests:
    args = ['curl', '-s', '-I', '--max-time', '10', url]
    if cookie:
        args += ['-b', cookie]
    r = subprocess.run(args, capture_output=True, text=True, timeout=15)
    status = r.stdout.split('\n')[0] if r.stdout else 'NO RESPONSE'
    print(f'{label}: {status}')

# Also check the dashboard actual content with cookie
r2 = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r2.stdout
checks = ['Contractor Dashboard', 'Dusty', 'FAB', 'main', 'Leads', 'Platform Overview', 'error', '500']
print()
print('Dashboard content checks:')
for text in checks:
    found = text in d
    print(f'  {text}: {"FOUND" if found else "MISSING"}')