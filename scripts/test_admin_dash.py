import subprocess

r = subprocess.run(
    ['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session',
     'https://scopecrete.ai/admin/dashboard'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout
if 'Platform Overview' in d:
    print('ADMIN DASHBOARD: LOADED - shows Platform Overview')
elif 'Loading' in d:
    print('ADMIN DASHBOARD: Loading state')
elif 'Unauthorized' in d or 'login' in d.lower():
    print('ADMIN DASHBOARD: Redirected to login')
else:
    print('ADMIN DASHBOARD: Response len=' + str(len(d)))
    # Check for JS bundle errors
    if 'Error' in d and 'chunk' in d:
        print('POSSIBLE JS ERROR in chunk')
    # Find any visible text
    import re
    texts = re.findall(r'<h1[^>]*>([^<]+)</h1>', d)
    print('H1 tags found:', texts[:3])