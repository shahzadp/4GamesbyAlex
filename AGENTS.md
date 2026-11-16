# AGENTS.md — project conventions

## Builds

- Test changes are always verified with the **release** build, never just
  debug: `.\gradlew.bat :app:assembleRelease`. The owner tests on the
  release APK, so anything verified only on `assembleDebug` is effectively
  unverified.
- Release applies R8. `GameWebViewActivity$AndroidBridge` survives via
  `proguard-rules.pro`'s `@JavascriptInterface` keeps; any new bridge
  method is covered by that rule, and the release build itself is the check.
- `assembleRelease` needs the same `keystore.properties` the owner already
  has; `assembleDebug` remains the fallback for a keyless checkout.
