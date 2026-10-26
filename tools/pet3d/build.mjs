/**
 * Bundles the Virtual Pet 3D runtime into the app's assets.
 *
 *   node tools/pet3d/build.mjs
 *
 * Output:
 *   app/src/main/assets/pet3d/pet3d.js
 *
 * The app ships everything it needs inside the APK and serves it from
 * local assets over an https origin, so the 3D runtime cannot be pulled
 * from a CDN at runtime. This bundles three.js and the GLTF loader into
 * a single classic script the WebView can load directly.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

const outfile = resolve(repo, 'app/src/main/assets/pet3d/pet3d.js');

await build({
  entryPoints: [resolve(here, 'src/entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2018'],
  legalComments: 'none',
  outfile,
  logLevel: 'info',
  banner: {
    js: '/* Virtual Pet 3D stage - built from tools/pet3d (three.js vendored). */',
  },
});

console.log('wrote', outfile);
