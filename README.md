# 4 Games by Alex

One small, offline-first Android app with four games in it. No ads. No
trackers. No account required.

## The games

- **Chess** — play against Stockfish 19 (single-threaded build, running in a
  Web Worker) or challenge a friend over one screen. Includes an opening
  explorer, a quiz mode ("how many legal moves are there now?") and a full
  two-player setup.
- **Flappy Bird** — the classic tap-to-fly loop, drawn fresh for this app.
- **Virtual Pet 3D** — a little pet you keep, feed and chat with. The 3D pet
  renders with three.js; chatting needs an API key you supply to the app
  (stored on-device), and is otherwise optional.
- **Horizon** — a native Android build of [Horizon](https://github.com/Vasysik/horizon-android),
  the open-source Minecraft Java client, staged into the app at packaging
  time. It is a full client: it downloads its ~500 MB of game assets from
  Mojang at first run, under Mojang's terms. No Minecraft assets are bundled
  in this repository or in the APK, and this project is not affiliated with,
  endorsed by, or validated by Mojang or Microsoft. Minecraft is a trademark
  of Mojang AB / Microsoft.

## Requirements

- Android 9 (API 28) or newer, arm64 device
- Horizon only: ~600 MB free space for the first-run asset download

## Build

```powershell
$env:GRADLE_USER_HOME = "D:\Dev\BuildTools\gradle"
$env:JAVA_HOME = "<your JDK 21 path>"
.\gradlew.bat assembleRelease
```

The release build is signed with your own keystore (`keystore.properties`,
git-ignored — create a fresh one; nothing signing-related is committed).
`.\gradlew.bat assembleDebug` works without one.

Horizon's native library is **not** part of this repository. It is staged at
packaging time by `tools/fetch-horizon.ps1` (downloads a hash-verified
upstream release) or `tools/build-horizon.ps1` (builds it locally). Neither
artifact is committed; `.gitignore` keeps them out. A checkout without them
still builds and runs — the launcher just shows Horizon as not installed.

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
- Horizon — MIT
- AndroidX / Jetpack Compose — Apache-2.0

Be precise about the trade-off: the Stockfish engine in the APK is GPL-3.0 and
stays GPL-3.0 in every distribution. The rest of the app's own code is
proprietary. If that mix does not suit you, the boundary to change is the
engine, not a file of notices.

## Releases

Signed APKs are attached to [GitHub Releases](https://github.com/shahzadp/4GamesbyAlex/releases).

If you want to build your own copy, install prerequisites as above and — if
you want Horizon inside — stage it with the scripts in `tools/`.
