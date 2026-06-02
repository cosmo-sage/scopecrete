import subprocess

print('=== ADMIN DASHBOARD - ERROR ANALYSIS ===')
r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/admin/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout

# Find error content
if 'next-error' in d:
    # Extract error area
    idx = d.find('next-error')
    print('Found next-error at index:', idx)
    print('Context around error:', d[max(0,idx-100):idx+300])
    print()

# Find any error-like content
import re
error_patterns = [
    r'<title>[^<]*error[^<]*</title>',
    r'<h1[^>]*>[^<]*error[^<]*</h1>',
    r'"message":"[^"]*"',
    r'"error":"[^"]*"',
    r'Error:\s*[^\n"]+',
]
for pattern in error_patterns:
    matches = re.findall(pattern, d, re.IGNORECASE)
    if matches:
        print(f'Pattern {pattern}: {matches[:3]}')

# Check if it's a client-side hydration error (script would run after page loads)
# Look for hydration-related content
if 'Hydration' in d or 'hydration' in d:
    print('HYDRATION ERROR DETECTED')
    idx = d.lower().find('hydration')
    print('Context:', d[max(0,idx-50):idx+200])

# Check JS bundle 404s
js_bundles = re.findall(r'/_next/static/chunks/[^"]+\.js', d)
print(f'\nJS bundles referenced: {len(js_bundles)}')
if js_bundles:
    print('First bundle:', js_bundles[0])

# Check if there are multiple h1 or main content areas
h1s = re.findall(r'<h1[^>]*>([^<]+)</h1>', d)
print(f'\nH1 tags found: {h1s}')

# Check what the actual body content says
body_idx = d.find('<body')
if body_idx >= 0:
    body_content = d[body_idx:body_idx+500]
    print(f'\nBody start: {body_content[:300]}')