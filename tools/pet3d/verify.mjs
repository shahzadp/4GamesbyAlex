/**
 * Verifies the exported Virtual Pet model and the app-side 3D wiring.
 *
 *   node tools/pet3d/verify.mjs
 *
 * The Blender build writes app/src/main/assets/models/virtual_pet.glb.
 * This is the check that the file that actually ships is complete:
 *
 *   - the GLB container is well formed (magic, version, chunk lengths)
 *   - every buffer view / accessor stays inside the binary chunk
 *   - every mesh primitive has positions and normals
 *   - the rig nodes app.js animates are present
 *   - the dog stands on y = 0 and is the expected height
 *   - the runtime, model, canvas and page hooks are all wired up
 *
 * Exits non-zero on the first category that fails, so it can be used as a
 * pre-release gate next to tools/check-asset-paths.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const glbPath = path.join(repo, 'app', 'src', 'main', 'assets', 'models', 'virtual_pet.glb');
const runtimePath = path.join(repo, 'app', 'src', 'main', 'assets', 'pet3d', 'pet3d.js');
const appPath = path.join(repo, 'app', 'src', 'main', 'assets', 'app.js');
const htmlPath = path.join(repo, 'app', 'src', 'main', 'assets', 'index.html');

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readGlb(file) {
  const buf = fs.readFileSync(file);
  check(buf.length >= 20, 'GLB is shorter than its header');
  check(buf.toString('ascii', 0, 4) === 'glTF', 'GLB magic is not "glTF"');
  const version = buf.readUInt32LE(4);
  const declaredLength = buf.readUInt32LE(8);
  check(version === 2, `GLB version is ${version}, expected 2`);
  check(declaredLength === buf.length, `GLB header length ${declaredLength} != file size ${buf.length}`);

  let offset = 12;
  const chunks = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    check(start + length <= buf.length, 'GLB chunk runs past the end of the file');
    chunks.push({ type, start, length });
    offset = start + length;
  }
  check(offset === buf.length, 'GLB chunks do not add up to the file size');

  const jsonChunk = chunks.find((c) => c.type === 0x4e4f534a);
  const binChunk = chunks.find((c) => c.type === 0x004e4942);
  check(jsonChunk, 'GLB has no JSON chunk');
  check(binChunk, 'GLB has no BIN chunk');
  if (!jsonChunk || !binChunk) return null;

  const json = JSON.parse(buf.toString('utf8', jsonChunk.start, jsonChunk.start + jsonChunk.length));
  return { buf, json, binChunk };
}

function verifyModel(glb) {
  const { json, binChunk } = glb;
  const nodes = json.nodes || [];
  const meshes = json.meshes || [];
  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];

  check(Array.isArray(json.scenes) && json.scenes.length === 1, 'expected exactly one glTF scene');
  const scene = json.scenes && json.scenes[0];
  check(scene && Array.isArray(scene.nodes) && scene.nodes.length === 1, 'scene must have one root node');

  // Parent links: each node may have at most one parent.
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) {
      check(child >= 0 && child < nodes.length, `node ${index} has an out-of-range child ${child}`);
      check(!parents.has(child), `node ${child} has more than one parent`);
      parents.set(child, index);
    }
  });
  const roots = nodes.map((_, i) => i).filter((i) => !parents.has(i));
  check(roots.length === 1, `expected one root node, found ${roots.length}`);

  // Buffer views and accessors must fit inside the BIN chunk.
  bufferViews.forEach((view, index) => {
    check(
      view.byteOffset + view.byteLength <= binChunk.length,
      `bufferView ${index} extends past the BIN chunk`
    );
    check(
      view.buffer === 0,
      `bufferView ${index} points at buffer ${view.buffer}, expected 0`
    );
  });
  accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined) return;
    check(accessor.bufferView < bufferViews.length, `accessor ${index} has an unknown bufferView`);
    const view = bufferViews[accessor.bufferView];
    if (!view) return;
    const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type] || 1;
    const elementBytes = componentBytes * components;
    const stride = view.byteStride || elementBytes;
    const needed = (accessor.byteOffset || 0) + Math.max(0, accessor.count - 1) * stride + elementBytes;
    check(needed <= view.byteLength, `accessor ${index} reads past its bufferView`);
  });

  const requiredRig = [
    'gz:dog', 'gz:torso', 'gz:head', 'gz:hz', 'gz:nose',
    'gz:earL', 'gz:earR', 'gz:tail', 'gz:eyes', 'gz:happy',
    'gz:brows', 'gz:mouthOpen', 'gz:mouthClosed', 'gz:hearts',
    'gz:pupilL', 'gz:pupilR',
  ];
  const names = new Set(nodes.map((n) => n.name).filter(Boolean));
  for (const name of requiredRig) {
    check(names.has(name), `missing rig node ${name}`);
  }

  let triangles = 0;
  meshes.forEach((mesh, meshIndex) => {
    check(Array.isArray(mesh.primitives) && mesh.primitives.length > 0, `mesh ${meshIndex} has no primitives`);
    for (const prim of mesh.primitives || []) {
      check(prim.attributes && prim.attributes.POSITION !== undefined, `mesh ${meshIndex} primitive has no POSITION`);
      check(prim.attributes && prim.attributes.NORMAL !== undefined, `mesh ${meshIndex} primitive has no NORMAL`);
      if (prim.indices !== undefined) {
        const indexAccessor = accessors[prim.indices];
        check(indexAccessor, `mesh ${meshIndex} references a missing index accessor`);
        if (indexAccessor) triangles += indexAccessor.count / 3;
      } else if (prim.attributes && prim.attributes.POSITION !== undefined) {
        triangles += accessors[prim.attributes.POSITION].count / 3;
      }
    }
  });
  notes.push(`${meshes.length} meshes, ${Math.round(triangles)} triangles, ${nodes.length} nodes`);

  // World-space bounds. The model is authored Y-up, and the dog must stand
  // on y = 0 so the contact shadow and camera framing stay valid.
  const parentOf = new Map();
  nodes.forEach((node, index) => (node.children || []).forEach((child) => parentOf.set(child, index)));
  const world = new Map();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const local = (node) => {
    pos.fromArray(node.translation || [0, 0, 0]);
    quat.fromArray(node.rotation || [0, 0, 0, 1]);
    scale.fromArray(node.scale || [1, 1, 1]);
    return new THREE.Matrix4().compose(pos.clone(), quat.clone(), scale.clone());
  };
  const worldOf = (index) => {
    if (world.has(index)) return world.get(index);
    const matrix = local(nodes[index]);
    if (parentOf.has(index)) matrix.premultiply(worldOf(parentOf.get(index)));
    world.set(index, matrix);
    return matrix;
  };

  const box = new THREE.Box3();
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    const matrix = worldOf(index);
    for (const prim of meshes[node.mesh].primitives || []) {
      const accessor = accessors[prim.attributes.POSITION];
      if (!accessor || !accessor.min || !accessor.max) continue;
      const bounds = new THREE.Box3(
        new THREE.Vector3().fromArray(accessor.min),
        new THREE.Vector3().fromArray(accessor.max)
      ).applyMatrix4(matrix);
      box.union(bounds);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  notes.push(
    `bounds y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)} (height ${size.y.toFixed(3)})`
  );
  check(Math.abs(box.min.y) < 0.02, `dog does not stand on y = 0 (min y ${box.min.y.toFixed(3)})`);
  check(size.y > 1.9 && size.y < 2.2, `unexpected model height ${size.y.toFixed(3)}`);
  check(size.x > 0.9 && size.x < 1.5, `unexpected model width ${size.x.toFixed(3)}`);

  // The rig is code-driven. An exported animation would fight the reaction
  // table in pet3d.js, so it must stay absent until someone deliberately
  // moves that logic into Blender.
  check(!json.animations || json.animations.length === 0, 'GLB unexpectedly contains animations');
}

function verifyWiring() {
  check(fs.existsSync(runtimePath), 'pet3d runtime bundle is missing');
  if (fs.existsSync(runtimePath)) {
    const runtime = fs.readFileSync(runtimePath, 'utf8');
    check(runtime.length > 100_000, 'pet3d runtime bundle is implausibly small');
    check(runtime.includes('window.PetStage'), 'runtime bundle does not publish window.PetStage');
  }

  const app = fs.readFileSync(appPath, 'utf8');
  check(app.includes('function initPet3D'), 'app.js has no initPet3D');
  check(app.includes('models/virtual_pet.glb'), 'app.js does not load the exported GLB');
  check(app.includes('window.ensurePet3D'), 'app.js does not expose ensurePet3D to switchPage');
  check(app.includes('window.setPet3DActive'), 'app.js does not pause the stage off-page');
  check(app.includes('onTap: (zone, relativeX) => handlePetTap'), '3D taps are not routed to the pet');
  check(app.includes('petStage.react(name)'), 'tap reactions are not replayed on the 3D pet');

  const html = fs.readFileSync(htmlPath, 'utf8');
  check(html.includes('id="pet-canvas"'), 'index.html has no pet canvas');
  check(html.includes('pet3d/pet3d.js'), 'index.html does not load the 3D runtime');
  check(html.includes('id="pet-bubble"'), 'index.html has no 3D speech bubble');
}

/* three.js is vendored next to the build script, so the verifier can use the
 * same transform maths the runtime does without another dependency. */
const THREE = await import(
  new URL('./node_modules/three/build/three.module.js', import.meta.url)
);

const glb = readGlb(glbPath);
if (glb) verifyModel(glb);
verifyWiring();

console.log('Virtual Pet 3D verification');
console.log('  model   : ' + path.relative(repo, glbPath));
console.log('  runtime : ' + path.relative(repo, runtimePath));
notes.forEach((note) => console.log('  ' + note));
console.log('');

if (failures.length) {
  console.log('FAIL: ' + failures.length + ' problem(s)');
  failures.forEach((failure) => console.log('  x ' + failure));
  process.exit(1);
}

console.log('PASS: GLB is complete and the app 3D wiring is in place');
