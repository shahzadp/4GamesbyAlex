# Builds Horizon from source instead of fetching a release binary.
#
# This is the "real" path for game 4: Horizon is a Rust project, and building
# it here would let us patch it, pin a commit and ship a binary we compiled
# ourselves rather than trusting an upstream APK. It is not wired up yet
# because the toolchain it needs is not installed on this machine.
#
# What Horizon's own tools/android_build.py requires, and what this machine has:
#
#   Rust 1.95         pinned in Horizon's rust-toolchain.toml. Installed here:
#                     the stable channel only.
#   Android NDK       Horizon needs one to link the aarch64 target and to
#                     provide llvm-strip. Installed here: none. $ANDROID_HOME
#                     has no ndk/ directory.
#   Android SDK 35+   Present (D:\dev\SDKs\android-sdk, platform 36).
#   Python 3.11+      Present.
#   Gradle 8.14       Horizon's packaging script shells out to its own Gradle
#                     wrapper. Present here: 9.1.0 and 9.3.1.
#   JDK 17            Present (D:\dev\BuildTools\gradle\jdks).
#
# The gap is the NDK and the Rust version. Installing an NDK is ~2 GB and a
# Rust 1.95 toolchain another ~1 GB; neither is on C:, so they belong under
# D:\dev\SDKs and D:\dev\BuildTools\rustup respectively.
#
# Note also that a release build of Horizon is ThinLTO with a single codegen
# unit. On this machine (4 cores, ~8 GB) that is expected to take hours and is
# a real out-of-memory risk. A `--profile fast` debug build is the sane first
# target: it proves the JNI wiring end to end and is usable for play-testing.
#
# Until this script is implemented, tools/fetch-horizon.ps1 is the supported
# path: it stages a hash-verified upstream release with the same file layout, so
# nothing downstream of it changes when the source build lands.
#
# Usage once implemented:
#   powershell -ExecutionPolicy Bypass -File tools/build-horizon.ps1
#   powershell -ExecutionPolicy Bypass -File tools/build-horizon.ps1 -Profile fast

param(
    [ValidateSet('fast', 'release')]
    [string]$Profile = 'fast',

    # Path to a Horizon source checkout. Defaults to the mirrored study copy
    # used while assessing the swap.
    [string]$Source = 'D:\dev\Scratch\horizon-android'
)

$ErrorActionPreference = 'Stop'

function Fail($message) {
    Write-Output "NOT-BUILT: $message"
    Write-Output ''
    Write-Output 'Use tools/fetch-horizon.ps1 to stage a verified upstream release instead.'
    exit 1
}

if (-not (Test-Path (Join-Path $Source 'Cargo.toml'))) {
    Fail "no Horizon checkout at $Source"
}

# Both of these are checked before anything expensive happens so the failure
# message names the missing piece rather than surfacing as a linker error three
# minutes into a Cargo build.
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
if (-not $sdk -or -not (Test-Path (Join-Path $sdk 'ndk'))) {
    Fail "no Android NDK under '$sdk\ndk'. Install one into D:\dev\SDKs\android-sdk\ndk."
}

$rustc = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustc) {
    Fail 'rustc is not on PATH.'
}
$rustVersion = (& $rustc.Source --version) -replace '^rustc ', ''
if ($rustVersion -notmatch '^1\.9[5-9]|^1\.[1-9][0-9]{2}') {
    Fail "Rust $rustVersion is installed but Horizon pins 1.95 (rust-toolchain.toml). Install it with: rustup toolchain install 1.95.0"
}

# Deliberately unimplemented. The real body is three steps:
#
#   1. rustup target add aarch64-linux-android
#   2. python tools/android_prepare.py      (generates engine-data.zip)
#   3. python tools/android_build.py --abi arm64-v8a $(if ($Profile -eq 'release') { '--public' } else { '--profile', 'fast' })
#
# then copy the same four artefacts tools/fetch-horizon.ps1 extracts:
#
#   .local/android/<abi>/libhorizon_android.so  -> app/src/main/jniLibs/<abi>/
#   .local/android/engine-data*.zip             -> app/src/main/assets/engine-data.zip
#   LICENSE.txt, THIRD_PARTY_NOTICES.md         -> app/src/main/assets/horizon/
#
# Keeping that copy step identical is the point: the APK wiring does not care
# where the binary came from.
Fail 'source build is not implemented in this script yet'
