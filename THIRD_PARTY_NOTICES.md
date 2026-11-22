# Third-party notices

This project bundles components whose rights belong to third parties. This file
lists them, the notices their licenses require, and where the complete license
texts live (`licenses/`). First-party works — everything this notice does not
list — are copyright 2026 shahzadp and licensed under the top-level `LICENSE`.

When distributing this application, keep the attribution notices already present
in the distributed assets (for example the header of `chess-pieces.js`), and
include this file and its `licenses/` texts with the distribution, or point to
the repository.

---

## 1. Stockfish 19 — GNU General Public License, version 3

- **Files:** `app/src/main/assets/engine/stockfish-19-lite-single.js` and
  `app/src/main/assets/engine/stockfish-19-lite-single.wasm`
- **Upstream:** Stockfish.js 19, copyright 2026 Chess.com, LLC,
  <https://github.com/nmrugg/stockfish.js>. Based on Stockfish, copyright
  2008-2024 T. Romstad, M. Costalba, J. Kiiski, G. Linscott and contributors,
  <https://github.com/official-stockfish/Stockfish>. Evaluation network by
  Chris Bao (sscg13), network `nn-61e7af4bb97d`
  (<https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d>).
- **License:** GNU GPL version 3 — full text in [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt).
- **How the engine is used:** bundled unmodified; it runs as a UCI engine in a
  Web Worker (`chess-engine.js`), called by the chess UI. The chess rules
  engine (`chess-core.js`), quiz, opening explorer and engine client are
  first-party code (see §7).
- **Obligations when you distribute:** recipients must get the GPL text (or
  `licenses/GPL-3.0.txt`) and a source pointer for the engine — the two
  upstream repositories above satisfy the Corresponding Source requirement for
  an unmodified upstream build. The engine has not been patched in this tree.
- **Plain statement:** Stockfish is GPL-3.0 and stays GPL-3.0. It is **not**
  covered by this project's `LICENSE`. Whether a licensee could treat the
  aggregation with the rest of the app as a "combined work" is a question of
  the relevant copyright law; expect the engine itself to remain firmly
  GPL-3.0 in every distribution. If you want the distribution to carry zero
  copyleft components, replace the engine rather than argue the boundary.

## 2. Cburnett chess piece set — Creative Commons Attribution-ShareAlike 3.0

- **Files:** `app/src/main/assets/chess-pieces.js`
- **Upstream:** the "Cburnett" twelve-piece chess set by Colin M.L. Burnett,
  originally published on Wikimedia Commons
  (<https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces>), and shipped
  by chess.com and lichess (`public/piece/cburnett` in
  <https://github.com/lichess-org/lila>), both under CC BY-SA 3.0. The
  upstream SVG sources are also offered under the GFDL.
- **Modifications:** the SVGs were re-stroked/recoloured for this project
  ("bold outline figures"); copies embedded in `chess-pieces.js` are
  adaptations of the Cburnett artwork.
- **License:** CC Attribution-ShareAlike 3.0 Unported — full text in
  [`licenses/CC-BY-SA-3.0.txt`](licenses/CC-BY-SA-3.0.txt). Upstream also offers
  GFDL as an alternative license; this project uses CC BY-SA 3.0.
- **Required attribution (satisfied by this file and the header of
  `chess-pieces.js`, both of which ship in the APK):**
  "Chess piece artwork: the Cburnett set by Colin M.L. Burnett, CC BY-SA 3.0,
  via Wikimedia Commons / lichess. Changes: re-stroked and recoloured."
- **ShareAlike:** the artwork (and any adaptation of it) must be distributed
  under this license or a compatible ShareAlike license; it may not be placed
  under the proprietary `LICENSE`. The licence covers the piece artwork only,
  not the rest of the application.

## 3. three.js — MIT

- **Files:** `pet3d.js` (bundled three.js runtime for the Virtual Pet 3D
  renderer; matches `tools/pet3d/package.json`, `three ^0.160.1`, r160-era).
- **Upstream:** [three.js](https://github.com/mrdoob/three.js), copyright
  2010-present the three.js authors.
- **License:** MIT — full text in [`licenses/MIT.txt`](licenses/MIT.txt).
  The copyright notice in that file is satisfied by this entry and by
  retaining `licenses/MIT.txt` with any distribution.

## 4. Starling (Minecraft Java client for Android) — MIT

- **Not committed to this repository.** The native libraries, Java bridge and
  game-file preparation kits are staged at build time from the hash-verified
  0.9.0 release by `tools/fetch-starling.ps1` (see `.gitignore`) into
  `app/src/main/jniLibs/arm64-v8a/` and `app/src/main/assets/`.
- **Upstream:** Starling, copyright 2026 JuanLuci, Vasysik and the Starling
  contributors, MIT — <https://github.com/starling-client/starling>. Starling
  is built on Horizon, copyright 2026 Ludovic Marie and the Horizon
  contributors, MIT — <https://github.com/ludovic111/horizon>.
- **In this APK:** Starling's Rust engine libraries, its Android Java bridge,
  the resource-preparation kits and Starling Visuals. Its third-party notices
  ship in the staged `prepare-kit.zip`. Starling downloads Mojang assets to the
  device at runtime under Mojang's terms; this repository and the distributed
  APK contain **no** Mojang/Minecraft code, textures or assets. The application
  is not affiliated with, endorsed by, or validated by Mojang AB, Mojang
  Studios, or Microsoft. Minecraft is a trademark of Mojang AB / Microsoft.
- **License:** MIT — full text in [`licenses/MIT.txt`](licenses/MIT.txt).

## 5. Android platform libraries (present in release builds) — Apache-2.0

Present under their respective artifact licenses, Apache License 2.0 (full
text in [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt)), copyright
Android Open Source Project / Google:

- androidx.compose.* (Compose BOM), androidx.activity:activity-compose (1.x),
  androidx.core:core-ktx, androidx.lifecycle:lifecycle-runtime-ktx,
  androidx.webkit

## 6. Development- and test-only dependencies (not present in release builds)

Included for completeness; their absence from shipped binaries means their
obligations are only informational:

- JUnit 4 (junit:junit) — EPL-1.0
- AndroidX Test (androidx.test:*), Espresso — Apache-2.0
- kotlinx-coroutines-test — Apache-2.0
- esbuild (build tooling) — MIT
- Gradle Wrapper, Kotlin compiler/stdlib — Apache-2.0

## 7. First-party works covered by the proprietary LICENSE

Everything not listed above — the launcher shell (Kotlin/Compose screens,
launcher logic), the Flappy Bird implementation, the chess rules engine, quiz,
engine client and opening explorer (excluding §1 and §2), the Virtual Pet 3D
application logic and `virtual_pet.glb`, and all original tooling — is
copyright 2026 shahzadp and licensed under the top-level [`LICENSE`](LICENSE)
(proprietary, all rights reserved).
