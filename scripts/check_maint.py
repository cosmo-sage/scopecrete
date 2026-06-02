import subprocess

r = subprocess.run(
    ['curl', '-s', '--max-time', '10', 'https://scopecrete.ai/maintenance'],
    capture_output=True, text=True, timeout=15
)
d = r.stdout
checks = [
    'Under Construction',
    'Maintenance',
    'ScopeCrete',
    'Login',
    'Lightning',
    'Coming soon',
]
for text in checks:
    if text in d:
        print(f'FOUND: {text}')
    else:
        print(f'MISSING: {text}')
print('Response length:', len(d))