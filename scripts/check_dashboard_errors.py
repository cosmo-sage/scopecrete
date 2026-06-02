import subprocess

# Check the actual dashboard HTML response for error content
r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout

# Find 500 in context
idx500 = d.find('500')
if idx500 >= 0:
    print('500 found at:', idx500)
    print('Context:', d[max(0,idx500-100):idx500+200])
    print()

# Find error in context
idxerr = d.find('error')
if idxerr >= 0:
    print('error found at:', idxerr)
    print('Context:', d[max(0,idxerr-100):idxerr+200])
    print()

# Check if it's a Next.js error page
if 'next-error' in d:
    print('NEXT ERROR PAGE DETECTED')
    idx = d.find('next-error')
    print('Context:', d[max(0,idx-50):idx+300])

# Look for the page title
import re
title = re.findall(r'<title>([^<]+)</title>', d)
print('Page title:', title[0] if title else 'none')

# Check for main content
main_texts = ['Leads', 'Customers', 'Estimates', 'Revenue', 'Recent', 'Contractor']
for text in main_texts:
    idx = d.find(text)
    if idx >= 0:
        print(f'Found "{text}" at {idx}:', d[idx:idx+80])