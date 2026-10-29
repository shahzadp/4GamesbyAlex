import os
js = [f for f in os.listdir('alexcraft-src/dist/assets') if f.startswith('index-') and f.endswith('.js')][0]
t = open('alexcraft-src/dist/assets/'+js).read()
print('click event:', 'addEventListener("click"' in t)
print('touchstart:', 'touchstart' in t)
print('pointerdown:', 'pointerdown' in t)
