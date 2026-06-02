import subprocess

r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/admin/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout
checks = [
    ('Platform Overview', 'MAIN HEADER'),
    ('Total Contractors', 'STAT LABELS'),
    ('Orphaned', 'ORPHANED ALERT'),
    ('Recent Contractors', 'RECENT CONTRACTORS'),
    ('Recent Leads', 'RECENT LEADS'),
    ('Monthly Revenue', 'REVENUE STAT'),
]
found = []
for text, label in checks:
    if text in d:
        found.append(label)
        print(label + ': FOUND')
    else:
        print(label + ': MISSING')

if not found:
    print('EMPTY - showing:', d[:500])