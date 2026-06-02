d = open('/tmp/dash_out.txt').read() if False else __import__('subprocess').run(['curl', '-s', '--max-time', '10', '-b', 'sc_session=scopecrete_dashboard_session', 'https://scopecrete.ai/dashboard'], capture_output=True, text=True).stdout

idx = d.find('next-error')
print('next-error found at:', idx)
if idx >= 0:
    print('Context before:', repr(d[max(0,idx-100):idx]))
    print('Context after:', repr(d[idx:idx+400]))

# Check if the error is embedded within a React component or is a real error overlay
if '404' in d and 'next-error' in d:
    print('ALSO HAS 404 - multiple error states')
    idx404 = d.find('"statusCode":404')
    if idx404 >= 0:
        print('404 context:', repr(d[idx404:idx404+200]))

# Count occurrences
import re
counts = {
    'next-error': len(re.findall(r'next-error', d)),
    'error:': len(re.findall(r'"error"', d)),
    '404': len(re.findall(r'404', d)),
    '500': len(re.findall(r'500', d)),
    'Platform Overview': len(re.findall(r'Platform Overview', d)),
    'Contractor Dashboard': len(re.findall(r'Contractor Dashboard', d)),
}
for k,v in counts.items():
    print(f'{k}: {v}')