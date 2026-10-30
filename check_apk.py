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
    # The start page and the pages behind it
    print('alexcraft start page:', 'start-menu' in t and 'start-play' in t)
    print('alexcraft play page:', 'play-menu' in t and 'world-list' in t)
    print('alexcraft skin page:', 'skin-menu' in t and 'skin-list' in t)
    # The worlds are saved side by side, each with its own name and its own
    # chunks, and only the one that is played is read
    print('alexcraft named worlds:', 'listWorlds' in t and 'There is already a world called' in t)
    print('alexcraft world chunks:', 'saveChunks' in t and 'loadChunks' in t)
    print('alexcraft old world moved over:', 'migrateLegacyWorld' in t)
    print('alexcraft change world:', 'change-world' in t)
    print('alexcraft skins:', 'minicraft.skin' in t and 'skin-item' in t)
if css:
    print('alexcraft start page styled:', 'mc-screen' in c)
    print('alexcraft world list styled:', 'world-list' in c)
    print('alexcraft skin list styled:', 'skin-list' in c)

# The labels of the start page live in the page itself, not in the bundle
page = [n for n in z.namelist() if n == 'assets/alexcraft/index.html']
if page:
    h = z.read(page[0]).decode('utf-8', errors='ignore')
    print('start page buttons:', 'start-play' in h and 'start-skin' in h
          and 'start-music-volume' in h and 'Back to 4Games' in h)
    print('pause menu rows:', 'change-world' in h and 'Back to Games' in h)
else:
    print('assets/alexcraft/index.html: MISSING')

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
    # The game takes the whole screen on its own, and there is one mode
    print('flappy fullscreen by default:', 'enterFullscreen' in a)
    print('flappy one mode:', 'hardcore' not in a and 'btn-hardcore' not in a)
    # The sun and the moon sit in the sky instead of on top of it: soft
    # gradients rather than a solid disc with a hard rim
    print('flappy soft sun and moon:', 'createRadialGradient' in a and 'drawCelestial' in a)
    launcher_css = [n for n in z.namelist() if n == 'assets/styles.css']
    if launcher_css:
        s = z.read(launcher_css[0]).decode('utf-8', errors='ignore')
        # The game keeps its shape when the screen is of another shape
        print('flappy keeps its shape:', 'MIN_WORLD_HEIGHT' in a and 'object-fit' in s)
        print('no fullscreen button style:', '.btn-fullscreen' not in s)
    else:
        print('assets/styles.css: MISSING')
    print('launcher pauses on hide:', '__alexcraftPause' in a and 'visibilitychange' in a)
else:
    print('assets/app.js: MISSING')
