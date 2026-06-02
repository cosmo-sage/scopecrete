import subprocess

print('=== ROOT PATH (/) ===')
r = subprocess.run(['curl', '-s', '-I', '--max-time', '5', 'https://scopecrete.ai/'], capture_output=True, text=True, timeout=10)
print('Status line:', r.stdout.split('\n')[0])

# Follow the redirect and check
r2 = subprocess.run(['curl', '-s', '--max-time', '5', '-L', 'https://scopecrete.ai/'], capture_output=True, text=True, timeout=10)
d = r2.stdout
print('Content length:', len(d))
checks = {
    'Coming Soon': 'COMING SOON TEXT',
    'Contractor Login': 'LOGIN BUTTON',
    'ScopeCrete': 'SCOPECRETE TEXT',
    'logo-34.png': 'LOGO IMAGE IN SRC',
    'maintenance': 'MAINTENANCE PAGE MARKER',
    'calculator': 'OLD LANDING PAGE CALCULATOR (should be absent)',
}
for text, label in checks.items():
    status = 'FOUND' if text in d else 'MISSING'
    print(f'  {label}: {status}')

print()
print('=== ADMIN DASHBOARD ===')
r3 = subprocess.run(['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session', 'https://scopecrete.ai/admin/dashboard'], capture_output=True, text=True, timeout=15)
d3 = r3.stdout
checks3 = {
    'Platform Overview': 'MAIN HEADER',
    'Total Contractors': 'STAT',
    'next-error': 'NEXT ERROR',
    'ScopeCrete': 'SCOPECRETE',
    'admin': 'ADMIN',
}
for text, label in checks3.items():
    status = 'FOUND' if text in d3 else 'MISSING'
    print(f'  {label}: {status}')
print('  HTML length:', len(d3))