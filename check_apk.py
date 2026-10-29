import zipfile
apk='app/build/outputs/apk/release/app-release.apk'
z=zipfile.ZipFile(apk)
js=[n for n in z.namelist() if 'assets/alexcraft/assets/index-' in n and n.endswith('.js')]
print('JS files:', js)
if js:
    t=z.read(js[0]).decode('utf-8', errors='ignore')
    print('click event:', 'addEventListener("click"' in t)
    print('touchstart:', 'touchstart' in t)
    print('toolbar-slot:', 'toolbar-slot' in t)
