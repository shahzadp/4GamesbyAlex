/**
 * Virtual Pet - 3D stage.
 *
 * Renders the Blender-built puppy (assets/models/virtual_pet.glb) inside
 * the third game, and replays the five touch reactions on it.
 *
 * The five reactions are the same ones the 2D artwork has:
 *
 *   bark   -> head / face        (gz:hz)
 *   giggle -> torso              (gz:torso)
 *   boop   -> nose               (gz:nose)
 *   flap   -> ears               (gz:earL, gz:earR)
 *   wag    -> tail               (gz:tail)
 *
 * Every timing here mirrors the CSS keyframes in touch-dog.svg, so the
 * 3D pet reacts in the same places, at the same speed, as the 2D one.
 *
 * The rig is driven by rotating/offsetting the gz:* nodes. Each node's
 * pivot is placed by the Blender build to match the SVG's
 * transform-origin, so "rotate the head 8 degrees" means the same thing
 * in 2D and 3D.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const OUTLINE_COLOR = 0x4a2a14;   // the artwork's stroke colour
const OUTLINE_WIDTH = 0.0075;      // world units of the toon outline

/* A pointer that stays inside this box and lifts quickly is a tap, not a
 * spin. Keeping the two apart matters: a tap has to reach the five touch
 * zones, while a drag must only turn the model. */
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 650;

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** A finite number or a fallback. A NaN transform removes a node from the
 *  scene entirely, so bad channel data must never reach position/scale. */
const num = (v, fallback = 0) => (
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
);

/** Interpolate a scalar or a [x, y, z] vector. Channels use both, and
 *  `a + (b - a) * t` turns an array into NaN, which blanks the node. */
function mixValue(a, b, t) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.map((v, i) => v + ((b[i] === undefined ? v : b[i]) - v) * t);
  }
  return a + (b - a) * t;
}

/** Sample a list of [timePercent, value] keyframes. */
function sampleKeys(keys, pct) {
  if (pct <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (pct >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (pct >= t0 && pct <= t1) {
      const span = t1 - t0;
      const f = span <= 0 ? 0 : (pct - t0) / span;
      return mixValue(v0, v1, f);
    }
  }
  return last[1];
}

/** A keyframe list that holds a value, pulses to another, and holds again. */
function pulse(a, b, t0, t1) {
  return [[0, a], [t0, b], [t1, b], [100, a]];
}

/* ------------------------------------------------------------------ *
 * reaction definitions
 *
 * Each reaction is a list of channels. A channel animates one node:
 *   rot  - degrees around Z (the SVG's rotate axis)
 *   rotX - degrees around X
 *   pos  - [dx, dy, dz] offset in world units
 *   scl  - [sx, sy, sz] scale
 *
 * `show` / `hide` list node names whose visibility toggles over the
 * reaction's life, which is how the 3D model swaps its closed mouth for
 * an open one and its round eyes for happy arcs.
 * ------------------------------------------------------------------ */

const DEG = Math.PI / 180;

const REACTIONS = {
  /* 1 BARK - head and face */
  bark: {
    duration: 1000,
    channels: [
      { node: 'gz:head', rot: [
        [0, 0], [15, -12], [30, 7], [45, -9], [60, 6], [80, 0], [100, 0]
      ], pos: [
        [0, [0, 0, 0]], [15, [0, -0.045, 0]], [30, [0, 0.03, 0]],
        [45, [0, -0.03, 0]], [60, [0, 0.022, 0]], [80, [0, 0, 0]], [100, [0, 0, 0]]
      ], scl: [
        [0, [1, 1, 1]], [30, [1.05, 1.05, 1.05]], [60, [1.05, 1.05, 1.05]],
        [100, [1, 1, 1]]
      ] },
      { node: 'gz:torso', scl: pulse([1, 1, 1], [1.04, 0.96, 1], 50, 50) },
      { node: 'gz:brows', pos: [[0, [0, 0, 0]], [15, [0, 0.03, 0]], [75, [0, 0.03, 0]], [100, [0, 0, 0]]] },
    ],
    mouth: { open: true, chomp: [0, 20, 50, 80], chompMs: 330, chompCount: 3 },
  },

  /* 2 GIGGLE - torso */
  giggle: {
    duration: 1100,
    channels: [
      { node: 'gz:dog', rot: [
        [0, 0], [25, -2.2], [75, 2.2], [100, 0]
      ], pos: [
        [0, [0, 0, 0]], [25, [-0.03, -0.01, 0]], [75, [0.03, 0, 0]], [100, [0, 0, 0]]
      ] },
      { node: 'gz:head', rot: [[0, 0], [25, 2.5], [75, -2.5], [100, 0]] },
      { node: 'gz:torso', scl: pulse([1, 1, 1], [1.08, 0.91, 1.02], 50, 50) },
      { node: 'gz:brows', pos: [[0, [0, 0.026, 0]], [100, [0, 0.026, 0]]] },
    ],
    eyes: 'happy',
    mouth: { open: true, chomp: [0, 25, 50, 75], chompMs: 250, chompCount: 4 },
  },

  /* 3 BOOP -> SNEEZE - nose */
  boop: {
    duration: 1700,
    channels: [
      { node: 'gz:head', rot: [
        [0, 0], [55, -8], [62, 9], [80, -1], [100, 0]
      ], pos: [
        [0, [0, 0, 0]], [10, [0, -0.06, 0]], [40, [0, 0.015, 0]],
        [55, [0, 0.065, 0]], [62, [0, -0.07, 0]], [80, [0, 0.012, 0]],
        [100, [0, 0, 0]]
      ], scl: [
        [0, [1, 1, 1]], [10, [0.96, 0.96, 0.96]], [62, [1.1, 1.1, 1.1]],
        [100, [1, 1, 1]]
      ] },
      { node: 'gz:nose', scl: pulse([1, 1, 1], [1.5, 1.5, 1.5], 50, 50) },
      { node: 'gz:pupilL', pos: [[0, [0.03, 0, 0]], [100, [0.03, 0, 0]]] },
      { node: 'gz:pupilR', pos: [[0, [-0.03, 0, 0]], [100, [-0.03, 0, 0]]] },
      { node: 'gz:brows', pos: [
        [0, [0, 0, 0]], [10, [0, -0.02, 0]], [55, [0, -0.02, 0]],
        [62, [0, 0.04, 0]], [80, [0, 0.04, 0]], [100, [0, 0, 0]]
      ] },
    ],
    mouth: { open: true, sneeze: true },
  },

  /* 4 EAR FLAP - ears */
  flap: {
    duration: 1200,
    channels: [
      /* Negative on the left and positive on the right swings both ears
         away from the skull; the old signs tucked them inside the head. */
      { node: 'gz:earL', rot: [[0, 0], [50, -34], [100, 0]] },
      { node: 'gz:earR', rot: [[0, 0], [50, 34], [100, 0]] },
      { node: 'gz:head', rot: [[0, 0], [25, -9], [75, 9], [100, 0]] },
    ],
  },

  /* 5 TAIL WAG + HOP - tail */
  wag: {
    duration: 1600,
    channels: [
      { node: 'gz:tail', rot: [[0, -34], [50, 34], [100, -34]] },
      { node: 'gz:dog', pos: [
        [0, [0, 0, 0]], [50, [0, 0.12, 0]], [100, [0, 0, 0]]
      ] },
    ],
    mouth: { open: true, chomp: [0, 50, 100], chompMs: 500, chompCount: 3 },
    hearts: true,
  },
};

/* ------------------------------------------------------------------ *
 * the stage
 * ------------------------------------------------------------------ */

export class PetStage {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.ready = false;
    this.failed = false;
    this.active = true;

    this.model = null;
    this.nodes = {};
    this.reaction = null;
    this.reactionStart = 0;
    this.raycaster = new THREE.Raycaster();

    // orbit state
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.spinVelocity = 0;
    this.dragging = false;
    this.dragMoved = 0;
    this.hadDrag = false;
    this.pointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.downTime = 0;

    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    this.onWindowResize = () => this.resize();

    this.initRenderer();
    if (this.failed) return;
    this.initScene();
    this.bindPointer();
    this.watchSize();
    this.animate();
  }

  /* ---------------- renderer ---------------- */

  initRenderer() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      this.failed = true;
      if (this.options.onFailure) this.options.onFailure(err);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    /* The Blender model is 2.07 world units tall and stands on y = 0.
       Camera at y = 1.03 looks at the middle of the dog, and z = 3.9
       leaves a little headroom for the ear tips. */
    this.camera.position.set(0, 1.03, 3.9);
    this.camera.lookAt(0, 1.03, 0);

    const hemi = new THREE.HemisphereLight(0xfff3e0, 0x2a3a2c, 1.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
    key.position.set(-1.9, 2.8, 2.6);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
    fill.position.set(2.6, 1.0, 1.4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0.6, 1.6, -2.4);
    this.scene.add(rim);

    // soft contact shadow under the paws
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 40),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.004, 0.02);
    shadow.renderOrder = -1;
    this.scene.add(shadow);
    this.shadow = shadow;

    // the model sits in a pivot group so the orbit spins it in place
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
  }

  /* ---------------- loading ---------------- */

  load(url) {
    if (!this.renderer) return Promise.resolve(false);
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;
          this.prepareModel();
          this.pivot.add(this.model);
          this.ready = true;
          this.resize();
          if (this.options.onReady) this.options.onReady(this);
          resolve(true);
        },
        undefined,
        (err) => {
          this.failed = true;
          if (this.options.onFailure) this.options.onFailure(err);
          resolve(false);
        }
      );
    });
  }

  prepareModel() {
    /* three.js' GLTFLoader runs every node name through
     * PropertyBinding.sanitizeNodeName(), which strips ':' and other
     * reserved characters. That turns the Blender rig's "gz:head" into
     * "gzhead", so the lookup table below would never match and none of
     * the idle/reaction code would run. Restore the authored names here;
     * the glTF name stays on userData for debugging. */
    const canonicalName = (name) => (
      name.startsWith('gz') && !name.startsWith('gz:')
        ? 'gz:' + name.slice(2)
        : name
    );

    const found = {};
    this.model.traverse((obj) => {
      if (!obj.name) return;
      const name = canonicalName(obj.name);
      if (name !== obj.name) {
        obj.userData.gltfNodeName = obj.name;
        obj.name = name;
      }
      found[name] = obj;
    });
    this.nodes = found;

    // Blender writes the rig nodes as glTF nodes; make sure every one of
    // them survives the round trip.
    const required = [
      'gz:dog', 'gz:torso', 'gz:head', 'gz:hz', 'gz:nose',
      'gz:earL', 'gz:earR', 'gz:tail', 'gz:eyes', 'gz:happy',
      'gz:brows', 'gz:mouthOpen', 'gz:mouthClosed',
    ];
    for (const name of required) {
      if (!found[name]) {
        console.warn('[pet3d] missing rig node', name);
      }
    }

    // Record every animated node's rest transform so reactions can be
    // applied as offsets from rest rather than accumulated.
    this.rest = new Map();
    this.model.traverse((obj) => {
      if (!obj.name) return;
      this.rest.set(obj.name, {
        pos: obj.position.clone(),
        rot: obj.rotation.clone(),
        scl: obj.scale.clone(),
        visible: obj.visible,
      });
    });

    // toon materials + inverted-hull outlines
    const outlineTargets = [];
    this.model.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat, i) => {
        if (!mat) return;
        const toon = mat.clone();
        toon.color = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
        if (toon.map) toon.map = mat.map;
        toon.side = THREE.FrontSide;
        if (Array.isArray(obj.material)) obj.material[i] = toon;
        else obj.material = toon;
      });
      // The eyes are thin decals lying on the skull. An inverted hull
      // around a decal is a slightly larger copy of it floating above the
      // face, so at an angle it slides across the pupil and hides it.
      // They get their definition from the sclera's own rim instead.
      if (/^gz:(eyeWhite|pupilMesh|sparkle)/.test(obj.name)) return;
      outlineTargets.push(obj);
    });

    this.buildOutlines(outlineTargets);
    this.applyIdleVisibility();
  }

  /**
   * Inverted-hull outline: a copy of every mesh pushed out along its
   * normals and drawn with back faces only. That reproduces the thick
   * dark stroke the 2D artwork has, without needing a texture.
   */
  buildOutlines(meshes) {
    this.outlineGroup = new THREE.Group();
    this.outlineGroup.name = 'gz:outlines';
    for (const mesh of meshes) {
      const geo = mesh.geometry.clone();
      const pos = geo.attributes.position;
      if (!pos) continue;
      const normal = geo.attributes.normal;
      if (!normal) geo.computeVertexNormals();
      const nrm = geo.attributes.normal;
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        n.fromBufferAttribute(nrm, i);
        v.addScaledVector(n, OUTLINE_WIDTH);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      const outline = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: OUTLINE_COLOR,
          side: THREE.BackSide,
        })
      );
      outline.name = (mesh.name || 'mesh') + '__outline';
      outline.userData.outlineFor = mesh.name;
      outline.renderOrder = -1;
      mesh.add(outline);
    }
  }

  /* ---------------- idle state ---------------- */

  applyIdleVisibility() {
    const n = this.nodes;
    if (n['gz:happy']) n['gz:happy'].visible = false;
    if (n['gz:mouthOpen']) n['gz:mouthOpen'].visible = false;
    if (n['gz:mouthClosed']) n['gz:mouthClosed'].visible = true;
    if (n['gz:hearts']) n['gz:hearts'].visible = false;
    if (n['gz:blink']) n['gz:blink'].visible = false;
    if (n['gz:eyes']) n['gz:eyes'].visible = true;
  }

  /* ---------------- reaction playback ---------------- */

  /**
   * Play one of the five reactions.
   * @param {string} name bark | giggle | boop | flap | wag
   */
  react(name) {
    const def = REACTIONS[name];
    if (!def || !this.ready) return false;
    this.reaction = def;
    this.reactionName = name;
    this.reactionStart = performance.now();
    this.resetRig();
    this.applyIdleVisibility();

    if (def.eyes === 'happy') {
      if (this.nodes['gz:eyes']) this.nodes['gz:eyes'].visible = false;
      if (this.nodes['gz:happy']) this.nodes['gz:happy'].visible = true;
      if (this.nodes['gz:happyPupilMeshL']) this.nodes['gz:happyPupilMeshL'].visible = true;
      if (this.nodes['gz:happyPupilMeshR']) this.nodes['gz:happyPupilMeshR'].visible = true;
    }
    if (def.mouth && def.mouth.open && this.nodes['gz:mouthOpen']) {
      this.nodes['gz:mouthOpen'].visible = true;
      if (this.nodes['gz:mouthClosed']) {
        this.nodes['gz:mouthClosed'].visible = false;
      }
    }
    if (def.hearts && this.nodes['gz:hearts']) {
      this.nodes['gz:hearts'].visible = true;
    }
    return true;
  }

  /** Put every rig node back to its rest transform. */
  resetRig() {
    if (!this.rest) return;
    for (const [name, rest] of this.rest) {
      const node = this.nodes[name];
      if (!node) continue;
      node.position.copy(rest.pos);
      node.rotation.copy(rest.rot);
      node.scale.copy(rest.scl);
    }
    if (this.nodes['gz:happy']) this.nodes['gz:happy'].visible = false;
    if (this.nodes['gz:mouthOpen']) this.nodes['gz:mouthOpen'].visible = false;
    if (this.nodes['gz:mouthClosed']) this.nodes['gz:mouthClosed'].visible = true;
    if (this.nodes['gz:hearts']) this.nodes['gz:hearts'].visible = false;
    if (this.nodes['gz:eyes']) this.nodes['gz:eyes'].visible = true;
  }

  updateReaction(now) {
    const def = this.reaction;
    if (!def) return;
    const elapsed = now - this.reactionStart;
    const pct = clamp((elapsed / def.duration) * 100, 0, 100);

    for (const channel of def.channels || []) {
      const node = this.nodes[channel.node];
      if (!node) continue;
      const rest = this.rest.get(channel.node);
      if (!rest) continue;
      if (channel.rot) {
        node.rotation.z = rest.rot.z + sampleKeys(channel.rot, pct) * DEG;
      }
      if (channel.rotX) {
        node.rotation.x = rest.rot.x + sampleKeys(channel.rotX, pct) * DEG;
      }
      if (channel.pos) {
        const off = sampleKeys(channel.pos, pct) || [];
        node.position.set(
          rest.pos.x + num(off[0]),
          rest.pos.y + num(off[1]),
          rest.pos.z + num(off[2])
        );
      }
      if (channel.scl) {
        const s = sampleKeys(channel.scl, pct) || [];
        node.scale.set(
          rest.scl.x * num(s[0], 1),
          rest.scl.y * num(s[1], 1),
          rest.scl.z * num(s[2], 1)
        );
      }
    }

    // mouth chomp / sneeze
    const mouthNode = this.nodes['gz:mouthOpen'];
    if (mouthNode && def.mouth) {
      if (def.mouth.chomp) {
        const [t0, t1] = def.mouth.chomp;
        const phase = ((pct - t0) / Math.max(1, t1 - t0)) * def.mouth.chompCount;
        const local = phase % 1;
        const closed = Math.abs(Math.cos(local * Math.PI));
        const rest = this.rest.get('gz:mouthOpen');
        const s = lerp(0.2, 1.0, closed);
        mouthNode.scale.set(rest.scl.x, rest.scl.y * s, rest.scl.z);
      } else if (def.mouth.sneeze) {
        const rest = this.rest.get('gz:mouthOpen');
        const open = pct > 56 && pct < 78 ? 1 : 0.2;
        mouthNode.scale.set(rest.scl.x, rest.scl.y * open, rest.scl.z);
      }
    }

    // floating hearts - each one pops out, drifts up and fades. The heart
    // pivots sit at the hearts' own centres, so scaling them does not drag
    // them toward the body the way scaling the group did.
    const hearts = this.nodes['gz:hearts'];
    if (hearts && def.hearts) {
      hearts.children.forEach((heart, i) => {
        const rest = this.rest.get(heart.name);
        if (!rest) return;
        const t = clamp((pct - i * 10) / 80, 0, 1);
        const fade = Math.sin(t * Math.PI);
        heart.position.set(rest.pos.x, rest.pos.y + 0.22 * t, rest.pos.z);
        heart.scale.setScalar(Math.max(0.01, fade));
      });
    }

    if (elapsed >= def.duration) {
      this.finishReaction();
    }
  }

  finishReaction() {
    this.reaction = null;
    this.reactionName = null;
    this.resetRig();
  }

  /* ---------------- idle loop ---------------- */

  updateIdle(now) {
    if (this.reducedMotion) return;
    const t = now * 0.001;

    // breathing
    const torso = this.nodes['gz:torso'];
    if (torso && !this.reaction) {
      const rest = this.rest.get('gz:torso');
      const k = 1 + Math.sin(t * (Math.PI * 2 / 3.0)) * 0.011;
      torso.scale.set(rest.scl.x, rest.scl.y * k, rest.scl.z);
    }

    // head bob
    const head = this.nodes['gz:head'];
    if (head && !this.reaction) {
      const rest = this.rest.get('gz:head');
      head.rotation.z = rest.rot.z + Math.sin(t * (Math.PI * 2 / 4.0)) * 1.5 * DEG;
    }

    // tail idle wag
    const tail = this.nodes['gz:tail'];
    if (tail && !this.reaction) {
      const rest = this.rest.get('gz:tail');
      tail.rotation.z = rest.rot.z + Math.sin(t * (Math.PI * 2 / 2.4)) * 8 * DEG;
    }

    // pupils stay at rest - no movement that could hide them
    const pl = this.nodes['gz:pupilL'];
    const pr = this.nodes['gz:pupilR'];
    if (pl && pr && !this.reaction) {
      const rl = this.rest.get('gz:pupilL');
      const rr = this.rest.get('gz:pupilR');
      pl.position.copy(rl.pos);
      pr.position.copy(rr.pos);
    }
  }

  /* ---------------- pointer: orbit + hit testing ---------------- */

  bindPointer() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'pan-y';

    const releasePointer = (event) => {
      if (canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      }
    };

    const endGesture = () => {
      this.dragging = false;
      this.pointerId = null;
      this.hadDrag = false;
      this.dragMoved = 0;
      canvas.classList.remove('is-dragging');
    };

    const onDown = (event) => {
      if (!this.active || this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      this.dragging = true;
      this.hadDrag = false;
      this.dragMoved = 0;
      this.downTime = performance.now();
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.spinVelocity = 0;
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      }
    };

    const onMove = (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);

      // Once the pointer has travelled far enough, this is a spin, not a
      // tap. The class only flips the cursor; the threshold is what keeps
      // the two gestures from fighting over the same lift.
      if (!this.hadDrag && this.dragMoved > TAP_SLOP_PX) {
        this.hadDrag = true;
        canvas.classList.add('is-dragging');
      }

      // horizontal drag spins the pet, vertical drag tilts it a little
      if (this.hadDrag) {
        const rect = canvas.getBoundingClientRect();
        const perPx = 220 / Math.max(1, rect.width);
        this.targetYaw += dx * perPx;
        this.spinVelocity = dx * perPx;
        this.targetPitch = clamp(this.targetPitch + dy * perPx * 0.45, -18, 18);
        event.preventDefault();
      }
    };

    const onUp = (event) => {
      if (event.pointerId !== this.pointerId) return;
      const elapsed = performance.now() - this.downTime;
      const isTap = !this.hadDrag && this.dragMoved <= TAP_SLOP_PX && elapsed <= TAP_MAX_MS;
      releasePointer(event);
      endGesture();

      if (!isTap || !this.ready || typeof this.options.onTap !== 'function') return;
      const zone = this.hitZone(event.clientX, event.clientY);
      if (!zone) return;
      const rect = canvas.getBoundingClientRect();
      const relativeX = clamp(
        (event.clientX - rect.left) / Math.max(1, rect.width),
        0,
        1
      );
      this.options.onTap(zone, relativeX);
    };

    const onCancel = (event) => {
      if (event.pointerId !== this.pointerId) return;
      releasePointer(event);
      endGesture();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onCancel);
  }

  /**
   * Which reaction zone was touched? The names match the SVG's zone
   * ids so the app can keep one table for both renderers.
   * @returns {string} bark | giggle | boop | flap | wag
   */
  hitZone(clientX, clientY) {
    if (!this.ready || !this.raycaster) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    const hits = this.raycaster.intersectObject(this.model, true);
    for (const hit of hits) {
      const zone = this.zoneForObject(hit.object);
      if (zone) return zone;
    }
    return null;
  }

  /** Map a hit mesh to one of the five reaction zones. */
  zoneForObject(object) {
    let node = object;
    const seen = [];
    while (node) {
      if (node.name) seen.push(node.name);
      node = node.parent;
    }
    const has = (n) => seen.indexOf(n) !== -1;

    if (has('gz:earL') || has('gz:earR')) return 'flap';
    if (has('gz:nose')) return 'boop';
    if (has('gz:tail')) return 'wag';
    if (has('gz:hz')) return 'bark';
    if (has('gz:torso')) return 'giggle';
    if (has('gz:head')) return 'bark';
    return null;
  }

  /* ---------------- frame loop ---------------- */

  /** Start/stop rendering when the pet page is opened or left.
   * The loop keeps its RAF slot but does no GPU work while inactive. */
  setActive(active) {
    const next = Boolean(active);
    if (this.active === next) return;
    this.active = next;
    if (!next) {
      this.dragging = false;
      this.pointerId = null;
      this.hadDrag = false;
      this.canvas.classList.remove('is-dragging');
      return;
    }
    this.clock.getDelta();
    this.resize();
  }

  watchSize() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    window.addEventListener('resize', this.onWindowResize);
  }

  resize() {
    if (!this.renderer) return;
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.aspect = aspect;
    // keep the whole pet in frame on narrow screens
    this.camera.position.z = aspect < 0.72 ? 4.6 : 3.9;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      if (!this.renderer || !this.active) return;

      const now = performance.now();

      // smooth orbit: ease toward the target, add inertia after a flick
      if (!this.dragging) {
        this.spinVelocity *= 0.92;
        if (Math.abs(this.spinVelocity) > 0.0005) {
          this.targetYaw += this.spinVelocity;
        }
      }
      this.yaw += (this.targetYaw - this.yaw) * 0.14;
      this.pitch += (this.targetPitch - this.pitch) * 0.14;

      if (this.pivot) {
        this.pivot.rotation.y = this.yaw * DEG;
        this.pivot.rotation.x = this.pitch * DEG;
      }

      if (this.ready) {
        this.updateIdle(now);
        this.updateReaction(now);
      }

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer) this.renderer.dispose();
  }
}

export default PetStage;
