import subprocess, re

r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/admin/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout

# Check for key content markers
checks = [
    ('Platform Overview', 'MAIN HEADER'),
    ('Total Contractors', 'STAT: TOTAL CONTRACTORS'),
    ('Total Users', 'STAT: TOTAL USERS'),
    ('Total Leads', 'STAT: TOTAL LEADS'),
    ('Monthly Revenue', 'STAT: MONTHLY REVENUE'),
    ('Recent Contractors', 'RECENT CONTRACTORS SECTION'),
    ('Recent Leads', 'RECENT LEADS SECTION'),
    ('Orphaned', 'ORPHANED LEADS ALERT'),
    ('sc_session', 'SESSION COOKIE PRESENT'),
    ('next-error', 'NEXT ERROR PAGE'),
    ('Loading', 'LOADING STATE'),
]

for text, label in checks:
    status = 'FOUND' if text in d else 'MISSING'
    print(f'{label}: {status}')

# Check for JS bundle references
js_bundles = re.findall(r'/_next/static/chunks/[^"]+\.js', d)
print(f'JS bundles referenced: {len(js_bundles)}')

# Check the page title
title_match = re.findall(r'<title>([^<]+)</title>', d)
print(f'Page title: {title_match[0] if title_match else "none"}')

print(f'HTML length: {len(d)} chars')
if 'error' in d.lower() and 'next' in d.lower():
    print('WARNING: Possible error page detected')