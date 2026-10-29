import zipfile

apk = 'app/build/outputs/apk/release/app-release.apk'
z = zipfile.ZipFile(apk)
js = [n for n in z.namelist() if 'assets/alexcraft/assets/index-' in n and n.endswith('.js')]
css = [n for n in z.namelist() if 'assets/alexcraft/assets/index-' in n and n.endswith('.css')]
print('JS files:', js)
print('CSS files:', css)
if js:
    t = z.read(js[0]).decode('utf-8', errors='ignore')
    print('pointerdown:', 'pointerdown' in t)
    print('touchstart:', 'touchstart' in t)
    print('toolbar-slot:', 'toolbar-slot' in t)
if css:
    # The hotbar has to paint above the touch overlay (z-index 900) or the
    # overlay's look surface swallows every tap meant for a slot.
    c = z.read(css[0]).decode('utf-8', errors='ignore')
    print('hotbar above overlay:', 'z-index:950' in c)
