import subprocess, sys

result = subprocess.run(
    ['ssh', 'root@2.24.30.51', 'grep -r "localhost:8000" /var/www/scopecrete-dashboard/src/ 2>/dev/null'],
    capture_output=True, text=True, timeout=15
)
if result.stdout.strip():
    print('FOUND REMAINING localhost:8000 references:')
    print(result.stdout)
else:
    print('CLEAN - no localhost:8000 references in src/')