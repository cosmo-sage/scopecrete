import subprocess

# Get dashboard without cookie - should redirect
r1 = subprocess.run(['curl', '-s', '-I', '--max-time', '10', 'http://localhost:3000/dashboard'], capture_output=True, text=True, timeout=15)
print('Dashboard without cookie:', r1.stdout.split('\n')[0])

# Get dashboard with cookie - check for error
r2 = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'http://localhost:3000/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r2.stdout
print('Dashboard with cookie - length:', len(d))

# Check for various content markers
checks = ['Contractor Dashboard', 'Sacco Builders', 'Leads', 'Dusty', 'next-error', 'error']
for text in checks:
    count = d.count(text)
    print(f'  "{text}": {count} occurrences')

# Where is next-error?
idx = d.find('next-error')
if idx >= 0:
    # Find the surrounding React element
    # Look backwards for the h1 or div that contains the error
    search_start = max(0, idx - 500)
    search_end = min(len(d), idx + 300)
    print(f'\nnext-error context (chars {search_start}-{search_end}):')
    print(repr(d[search_start:search_end]))