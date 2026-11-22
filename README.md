# 4 Games by Alex

One small, offline-first Android app with four games in it. No ads. No
trackers. No account required (the optional Lichess online mode in Chess
signs in through lichess.org, in your browser, and stores the token
encrypted on the device; everything else works offline and signed out).

## The games

- **Chess** — play against Stockfish 19 (single-threaded build, running in a
  Web Worker) or challenge a friend over one screen. Includes an opening
  explorer, a quiz mode ("how many legal moves are there now?") and a full
  two-player setup. The 2-player tab offers **Pass & Play** (over-the-board)
  and, optionally, **Lichess online** — sign in with your Lichess account in
  the browser, sync your ratings, and play Rapid games against random
  opponents with real clocks, resign and draw buttons. Optional; everything
  else in the app works offline with no account.
- **Flappy Bird** — the classic tap-to-fly loop, drawn fresh for this app.
  A Customize button in the toolbar bundles looks as whole sets — sky, bird,
  pipes and ground travel together, so they can never clash. Classic day
  plus Sunset Bay, Midnight Metro, Halloween, Christmas, New Year,
  Valentine's, Easter, Candy Land and Coral Lagoon.
- **Virtual Pet 3D** — a little pet you keep, feed and chat with. The 3D pet
  renders with three.js; chatting needs an API key you supply to the app
  (stored on-device), and is otherwise optional.
- **Starling** — a native Android build of [Starling](https://github.com/starling-client/starling),
  the open-source Minecraft: Java Edition client, forked into this app. It runs
  in its own process and downloads its ~2 GB of game files from Mojang on first
  run, under Mojang's terms. No Minecraft assets are bundled in this repository
  or in the APK, and this project is not affiliated with, endorsed by, or
  validated by Mojang or Microsoft. Minecraft is a trademark of Mojang AB /
  Microsoft.

## Requirements

- Android 9 (API 28) or newer, arm64 device
- Starling only: ~2 GB free space for its first-run game-file download

Starling also asks for two extra permissions that the other three games never
use: **manage external storage**, for its `Starling` folder that shows up in the
Files app, and **install unknown apps**, for installing updates. Both are
granted by the player on the device; declining them leaves Starling working
with game files inside the app's own storage.

The launcher itself checks this repository's GitHub releases on start. When a
newer build is published it offers to download the signed APK, verifies the
release's SHA-256 digest, and hands it to Android's installer. "Later" dismisses
that specific release; the next one is offered normally.

## Build

```powershell
$env:GRADLE_USER_HOME = "D:\Dev\BuildTools\gradle"
$env:JAVA_HOME = "<your JDK 21 path>"
.\gradlew.bat assembleRelease
```

The release build is signed with your own keystore (`keystore.properties`,
git-ignored — create a fresh one; nothing signing-related is committed).
`.\gradlew.bat assembleDebug` works without one.

Starling's native library is **not** part of this repository. It is staged at
packaging time by `tools/fetch-starling.ps1`, which downloads a hash-verified
upstream release and extracts the libraries and resource kits. Neither artifact
is committed; `.gitignore` keeps them out. A checkout without them still builds
and runs — the other three games work and the Starling card simply has no game
until the staging step is run.

## License

This repository's own code and assets are **© 2026 shahzadp, all rights
reserved** — see [`LICENSE`](LICENSE). It is a proprietary application.

Third-party components keep their own licenses; they are listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) with full license texts in
[`licenses/`](licenses/):

- Stockfish 19 / Stockfish.js — GPL-3.0 (source pointer: what ships is the
  unmodified upstream build)
- Cburnett chess pieces — CC BY-SA 3.0
- three.js — MIT
- Starling (and its Horizon base) — MIT
- AndroidX / Jetpack Compose — Apache-2.0

Be precise about the trade-off: the Stockfish engine in the APK is GPL-3.0 and
stays GPL-3.0 in every distribution. The rest of the app's own code is
proprietary. If that mix does not suit you, the boundary to change is the
engine, not a file of notices.

## Releases

Signed APKs are attached to [GitHub Releases](https://github.com/shahzadp/4GamesbyAlex/releases).

If you want to build your own copy, install the prerequisites above.
