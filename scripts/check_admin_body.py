import subprocess

# Check exactly what the admin dashboard body contains
r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/admin/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout

# Check if the body content renders the dashboard or an error
print('Body text snippet (chars 500-1500):')
print(d[500:1500])

# Check for error overlay
print()
print('Error overlay check:')
if 'next-error' in d:
    print('  next-error class FOUND (error boundary rendered)')
if 'error-boundary' in d:
    print('  error-boundary FOUND')

# Check if main content rendered
print()
print('Main content check:')
if 'Platform Overview' in d:
    idx = d.find('Platform Overview')
    print(f'  "Platform Overview" FOUND at {idx}')
    # Show what's around it
    print(f'  Surrounding HTML: {d[idx-50:idx+100]}')

# Check what JS errors appear in the page
import re
js_errors = re.findall(r'\"message\":\"([^\"]{5,80})\"', d)
if js_errors:
    print()
    print('JS error messages found:', js_errors[:5])