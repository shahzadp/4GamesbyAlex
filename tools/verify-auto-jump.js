/* Walks the player into a one-block ledge and into a two-block wall and
 * reports whether the hop happens.
 *
 * Usage:
 *   node tools/verify-auto-jump.js [url]
 *
 * The world is edited in place, so the probe builds its own platform next to
 * the spawn and clears the corridor in front of it. The headless browser has
 * its own profile, so the save it writes never touches the real one.
 */
const { evaluate, key, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const WIDTH = 900;
const HEIGHT = 420;

/** Builds the platform, the corridor and the wall, and puts the player in front of it */
const buildScenario = (wallHeight) => `
(function () {
  const game = window.game;
  const world = game.world;
  const player = game.player;
  // Stone from the creative palette
  const stone = player.hotbar.slots[2];
  const AIR = 0;

  const bx = Math.floor(player.pos.x);
  const bz = Math.floor(player.pos.z);
  // The block the player is standing on
  const floorY = Math.floor(player.pos.y - 0.05);

  // Flat floor and an empty corridor
  for (let x = bx - 2; x <= bx + 2; x++) {
    for (let z = bz - 10; z <= bz + 2; z++) {
      world.setBlock(x, floorY, z, stone);
      for (let y = floorY + 1; y <= floorY + 4; y++) {
        world.setBlock(x, y, z, AIR);
      }
    }
  }

  // The wall in front of the player, ${wallHeight} block(s) high and three
  // blocks deep so there is room to stand on it
  for (let x = bx - 1; x <= bx + 1; x++) {
    for (let h = 0; h < ${wallHeight}; h++) {
      for (let d = 0; d < 3; d++) {
        world.setBlock(x, floorY + 1 + h, bz - 2 - d, stone);
      }
    }
  }
  // A back stop, so the player cannot walk off the end of the platform
  for (let x = bx - 1; x <= bx + 1; x++) {
    for (let y = floorY + 1; y <= floorY + 3; y++) {
      world.setBlock(x, y, bz - 6, stone);
    }
  }

  player.placeFeet(bx + 0.5, floorY + 1, bz + 0.5);
  // Forward is -Z at yaw 0
  player.setLook(0, 0);
  return { bx: bx, bz: bz, floorY: floorY };
})()`;

async function main() {
  const { cdp, close } = await launchEdge({ width: WIDTH, height: HEIGHT });
  let exitCode = 1;
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    let ready = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `Boolean(window.game && window.game.world && window.game.world.initialLoadComplete)`
      );
      if (ready) break;
    }
    if (!ready) throw new Error("the game never came up");

    await evaluate(
      cdp,
      `(function () {
         const resume = document.getElementById('resume');
         if (resume) resume.click();
         else window.game.setPauseVisible(false);
       })()`
    );
    await sleep(400);

    // Per-tick trace: the sampler in Node is far too coarse to see the hop
    if (process.env.TRACE) {
      await evaluate(
        cdp,
        `(function () {
           const physics = window.game.physics;
           const original = physics.tick;
           window.__trace = [];
           physics.tick = function (player, world) {
             original.call(this, player, world);
             window.__trace.push({
               y: +player.pos.y.toFixed(3),
               z: +player.pos.z.toFixed(3),
               vy: +player.velocity.y.toFixed(3),
               vz: +player.velocity.z.toFixed(3),
               ground: player.onGround,
               hit: player.horizontalCollision,
             });
           };
         })()`
      );
    }

    const failures = [];

    /**
     * Holds the forward key and watches the player. The walk stops as soon as
     * the player is standing on top of the wall, so they cannot walk off the
     * end of the platform.
     */
    const walkInto = async (wallHeight) => {
      const spot = await evaluate(cdp, buildScenario(wallHeight));
      await sleep(200);
      if (process.env.TRACE) {
        await evaluate(cdp, `window.__trace = []`);
      }

      const onTopOfWall = spot.floorY + 2 - 0.2;
      await key(cdp, "KeyW", "keyDown");
      let maxY = spot.floorY + 1;
      let minZ = spot.bz + 0.5;
      for (let step = 0; step < 32; step++) {
        await sleep(80);
        const state = JSON.parse(
          await evaluate(
            cdp,
            `JSON.stringify({
               y: window.game.player.pos.y,
               z: window.game.player.pos.z,
               ground: window.game.player.onGround,
             })`
          )
        );
        if (process.env.TRACE) {
          console.log(
            `  y=${state.y.toFixed(3)} z=${state.z.toFixed(3)}` +
              ` ground=${state.ground ? 1 : 0}`
          );
        }
        maxY = Math.max(maxY, state.y);
        minZ = Math.min(minZ, state.z);
        // Stop once the player is past the face of the wall, or once they are
        // standing on it
        if (state.z < spot.bz - 0.8 || (state.y >= onTopOfWall && state.ground)) {
          break;
        }
      }
      await key(cdp, "KeyW", "keyUp");
      await sleep(250);

      if (process.env.TRACE) {
        const trace = JSON.parse(
          await evaluate(cdp, `JSON.stringify(window.__trace || [])`)
        );
        for (const tick of trace) {
          console.log(
            `  y=${tick.y} z=${tick.z} vy=${tick.vy} vz=${tick.vz}` +
              ` ground=${tick.ground ? 1 : 0} hit=${tick.hit ? 1 : 0}`
          );
        }
      }

      const final = JSON.parse(
        await evaluate(
          cdp,
          `JSON.stringify({
             y: window.game.player.pos.y,
             z: window.game.player.pos.z,
           })`
        )
      );
      return {
        spot,
        maxY,
        minZ,
        finalY: final.y,
        finalZ: final.z,
        rise: maxY - (spot.floorY + 1),
        walked: spot.bz + 0.5 - minZ,
      };
    };

    // One block high: the player has to hop over it
    const runs = Number(process.env.RUNS || 1);
    for (let run = 0; run < runs; run++) {
      const ledge = await walkInto(1);
      console.log(
        `one-block ledge   rise=${ledge.rise.toFixed(2)}  ` +
          `walked=${ledge.walked.toFixed(2)}  ` +
          `final y=${ledge.finalY.toFixed(2)} (floor ${ledge.spot.floorY})`
      );
      if (ledge.rise < 0.3) {
        failures.push(
          `run ${run}: the player did not leave the ground (rise ${ledge.rise.toFixed(2)})`
        );
      }
      // Over the ledge means standing on it, or walking past it: the samples
      // are coarse enough that the player can be further along than the top
      const gotOver =
        Math.abs(ledge.finalY - (ledge.spot.floorY + 2)) <= 0.3 ||
        ledge.walked >= 1.5;
      if (!gotOver) {
        failures.push(
          `run ${run}: the player did not get over the ledge (walked ${ledge.walked.toFixed(2)}, y ${ledge.finalY.toFixed(2)})`
        );
      }
      if (ledge.finalY < ledge.spot.floorY + 0.9) {
        failures.push(
          `run ${run}: the player fell off the platform (y ${ledge.finalY.toFixed(2)})`
        );
      }
    }

    // Two blocks high: a wall still stops the player
    const wall = await walkInto(2);
    console.log(
      `two-block wall    rise=${wall.rise.toFixed(2)}  ` +
        `walked=${wall.walked.toFixed(2)}  ` +
        `final y=${wall.finalY.toFixed(2)} (floor ${wall.spot.floorY})`
    );
    if (wall.rise > 0.4) {
      failures.push(
        `the player hopped over a two-block wall (rise ${wall.rise.toFixed(2)})`
      );
    }
    if (wall.walked >= 1.5) {
      failures.push(
        `the player got over a two-block wall (walked ${wall.walked.toFixed(2)})`
      );
    }
    if (Math.abs(wall.finalY - (wall.spot.floorY + 1)) > 0.3) {
      failures.push(
        `the player left the ground in front of the wall (y ${wall.finalY.toFixed(2)})`
      );
    }

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the player hops over a ledge and stops at a wall");
    }
    exitCode = failures.length ? 1 : 0;
  } finally {
    close();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
