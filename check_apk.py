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
    print('alexcraft quit to title:', 'quit-to-title' in t)
    print('alexcraft skins:', 'minicraft.skin' in t and 'skin-item' in t)
    # The inventory tab: the Fly button made way for it, and the state of the
    # flight is shown by a badge now that the button is gone
    print('touch overlay has an inventory button:', '"touch-inventory"' in t)
    print('the fly button is gone:', '"touch-fly"' not in t)
    print('the flight badge is there:', '"touch-fly-badge"' in t)
    print('alexcraft inventory tab:', '"inventory-preview"' in t
          and '"inventory-canvas"' in t and '"inventory-hotbar"' in t
          and '"inventory-grid"' in t)
    print('alexcraft inventory closes:', '"inventory-close"' in t)
    print('alexcraft inventory on the E key:', '"KeyE"' in t)
    # The sneak button is a crouch button now, and the crouch leans the body
    # forwards: the body faces -Z, so a lean forwards is a negative turn
    # about X, and the head keeps its level on top of the bent torso.
    print('touch overlay has a crouch button:', '"touch-crouch"' in t)
    print('the sneak button is gone:', '"touch-sneak"' not in t)
    print('the crouch button is labelled:', '>Crouch<' in t
          and 'Toggle crouch' in t)
    print('the body leans forwards when crouching:', 'torso.rotation.x=-' in t)
    print('the head keeps its level when crouching:', 'head.rotation.x=' in t)
if css:
    print('alexcraft start page styled:', 'mc-screen' in c)
    print('alexcraft world list styled:', 'world-list' in c)
    print('alexcraft skin list styled:', 'skin-list' in c)
    # The crosshair is small and half transparent, so it stays out of the way
    print('crosshair is small:', '#cursor{' in c and 'opacity:.55' in c)
    print('alexcraft inventory styled:', '#inventory-panel' in c
          and '#inventory-preview' in c and '.inv-slot' in c)
    print('alexcraft inventory window:', '#inventory-armour' in c
          and '#inventory-craft-grid' in c and '#inventory-arrow' in c
          and '#inventory-grid' in c and '#inventory-close' in c)
    print('alexcraft inventory scales:', '--inv-scale' in c)
    print('alexcraft touch inventory styled:', '#touch-inventory' in c
          and '#touch-fly-badge' in c)

# The labels of the start page live in the page itself, not in the bundle
page = [n for n in z.namelist() if n == 'assets/alexcraft/index.html']
if page:
    h = z.read(page[0]).decode('utf-8', errors='ignore')
    print('start page buttons:', 'start-play' in h and 'start-skin' in h
          and 'start-music-volume' in h and 'Back to 4Games' in h)
    print('pause menu rows:', 'quit-to-title' in h and 'Save and Quit to Title' in h)
    # The pause menu is plain now: no sliders and one button to leave
    print('pause menu has no sliders:', 'id="render-distance-slider"' not in h
          and 'id="music-volume-slider"' not in h)
    print('pause menu has one way out:', 'change-world' not in h
          and 'exit-game' not in h)
    # The crosshair is a smaller cross now
    print('crosshair is 16 wide:', 'id="cursor"' in h and 'width="16"' in h
          and 'height="16"' in h)
    # The inventory tab and the window it lives in
    print('inventory tab is on the page:', 'id="inventory"' in h
          and 'id="inventory-preview"' in h and 'id="inventory-canvas"' in h
          and 'id="inventory-hotbar"' in h and 'id="inventory-close"' in h)
    # The vanilla window: the armour, the player, the crafting table and the
    # three rows of carried things
    print('inventory window is the vanilla one:', 'id="inventory-armour"' in h
          and 'id="inventory-craft-grid"' in h and 'id="inventory-arrow"' in h
          and 'id="inventory-grid"' in h and 'id="inventory-craft-result"' in h
          and '>Crafting<' in h)
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
