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

# The Alexcraft bundle has to carry the suspend hooks, or the game keeps
# drawing after it is closed and drags every other game down with it.
if js:
    print('alexcraft suspend hooks:', '__alexcraftPause' in t and '__alexcraftResume' in t)
    print('alexcraft auto jump:', 'AUTO_JUMP_ENABLED' in t)

# The launcher carries the Flappy Bird work: the fixed timestep loop, the
# capped pixel ratio, the score ramp and the day-night cycle.
launcher = [n for n in z.namelist() if n == 'assets/app.js']
if launcher:
    a = z.read(launcher[0]).decode('utf-8', errors='ignore')
    print('flappy dpr cap:', 'FLAPPY_DPR_CAP' in a)
    print('flappy fixed timestep:', 'FLAPPY_STEP' in a)
    print('flappy day cycle:', 'DAY_PER_POINT' in a and 'dayPhase' in a)
    print('flappy score ramp:', 'currentSpeed' in a and 'currentGap' in a)
    # The feel of the game: a short jump, a limit on the fall and a hitbox
    # that is smaller than the bird is drawn
    print('flappy short jump:', 'jumpPower: -5.9' in a)
    print('flappy fall limit:', 'maxFallSpeed' in a)
    print('flappy forgiving hitbox:', 'hitInset' in a)
    # The frame is drawn between two steps, so a late frame does not look
    # like a mistimed tap
    print('flappy drawn between steps:', 'prevBirdY' in a and 'FLAPPY_STEP' in a)
    print('launcher pauses on hide:', '__alexcraftPause' in a and 'visibilitychange' in a)
else:
    print('assets/app.js: MISSING')
