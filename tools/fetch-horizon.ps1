# Stages the Horizon native payload into the APK.
#
# Game 4 is Horizon, a Rust Minecraft client that runs as a NativeActivity. Its
# binary is ~61 MB of arm64 machine code and is not committed, so a fresh
# checkout has to fetch it before the Horizon card can start. This script does
# that from a hash-verified upstream release.
#
# What it produces (all gitignored - see .gitignore):
#
#   app/src/main/jniLibs/arm64-v8a/libhorizon_android.so
#   app/src/main/assets/engine-data.zip
#   app/src/main/assets/horizon/LICENSE.txt
#   app/src/main/assets/horizon/THIRD_PARTY_NOTICES.md
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/fetch-horizon.ps1
#   powershell -ExecutionPolicy Bypass -File tools/fetch-horizon.ps1 -Force
#
# -Force re-downloads and re-extracts even when the staged files are present.
#
# The download lands in D:\dev\Installers\horizon (never on C:, which is nearly
# full) and the script is idempotent: with the files already staged and the hash
# matching, it does nothing.

param([switch]$Force)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$version = '0.7.7'
$abi = 'arm64-v8a'
$asset = "Horizon-Android-$version-$abi.apk"
$base = "https://github.com/Vasysik/horizon-android/releases/download/v$version"

$downloadDir = if ($env:HORIZON_INSTALLERS) { $env:HORIZON_INSTALLERS } else { 'D:\dev\Installers\horizon' }
$apkPath = Join-Path $downloadDir $asset
$sumPath = Join-Path $downloadDir 'SHA256SUMS.txt'

$jniDir = Join-Path $root "app\src\main\jniLibs\$abi"
$assetDir = Join-Path $root 'app\src\main\assets'
$noticeDir = Join-Path $assetDir 'horizon'

$soPath = Join-Path $jniDir 'libhorizon_android.so'
$enginePath = Join-Path $assetDir 'engine-data.zip'

# --- 1. Is everything already staged? -------------------------------------
#
# The hash check is skipped when the staged files exist and -Force was not
# passed: they are only ever written by this script, and re-hashing 70 MB on
# every build would make the check annoying enough to skip.

$staged = (Test-Path $soPath) -and (Test-Path $enginePath)
if ($staged -and -not $Force) {
    Write-Output "ALREADY-STAGED: $soPath"
    Write-Output "ALREADY-STAGED: $enginePath"
    Write-Output 'Pass -Force to re-download and re-extract.'
    exit 0
}

# --- 2. Download -----------------------------------------------------------

New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

if (-not (Test-Path $sumPath) -or $Force) {
    Write-Output "DOWNLOAD: $base/SHA256SUMS.txt"
    Invoke-WebRequest -Uri "$base/SHA256SUMS.txt" -OutFile $sumPath -UseBasicParsing
}

if (-not (Test-Path $apkPath) -or $Force) {
    Write-Output "DOWNLOAD: $base/$asset"
    Invoke-WebRequest -Uri "$base/$asset" -OutFile $apkPath -UseBasicParsing
}

# --- 3. Verify -------------------------------------------------------------
#
# The checksum list is the only thing that says the bytes are the release and
# not a truncated download or something swapped in transit. Compare against it
# rather than a hash hardcoded here, so bumping $version above is enough to
# move to a new release.

# -SimpleMatch already treats the pattern as a literal, so it must NOT be
# regex-escaped: an escaped asset name contains backslashes and matches
# nothing, which fails the build with "no entry" for a file that is there.
$expectedLine = Select-String -Path $sumPath -SimpleMatch -Pattern $asset |
    Select-Object -First 1
if (-not $expectedLine) {
    throw "SHA256SUMS.txt has no entry for $asset. Refusing to stage an unverified binary."
}
$expected = ($expectedLine.Line -split '\s+')[0].ToLower()
$actual = (Get-FileHash -Path $apkPath -Algorithm SHA256).Hash.ToLower()

if ($expected -ne $actual) {
    throw "Checksum mismatch for $asset.`n  expected $expected`n  actual   $actual`nDelete $apkPath and re-run."
}
Write-Output "VERIFIED: $actual"

# --- 4. Extract ------------------------------------------------------------
#
# Only four entries are taken. The rest of the APK (its manifest, resources,
# dex) belongs to Horizon's own app id and would be wrong to merge into this
# one: the activities and provider are vendored separately as Java sources so
# they compile against this app's package, and the Rust library finds them by
# its own fixed JNI name.

New-Item -ItemType Directory -Force -Path $jniDir, $noticeDir | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $map = @{
        "lib/$abi/libhorizon_android.so" = $soPath
        'assets/engine-data.zip'         = $enginePath
        'assets/LICENSE.txt'             = (Join-Path $noticeDir 'LICENSE.txt')
        'assets/THIRD_PARTY_NOTICES.md'  = (Join-Path $noticeDir 'THIRD_PARTY_NOTICES.md')
    }

    foreach ($entry in $zip.Entries) {
        $target = $map[$entry.FullName]
        if (-not $target) { continue }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        Write-Output ("EXTRACTED: {0,-40} {1,12:N0} bytes" -f $entry.FullName, $entry.Length)
    }

    $missing = $map.Keys | Where-Object { -not (Test-Path $map[$_]) }
    if ($missing) {
        throw "The APK did not contain: $($missing -join ', ')"
    }
}
finally {
    $zip.Dispose()
}

# --- 5. Sanity check -------------------------------------------------------
#
# Purely so a silent packaging mistake is caught here rather than as a blank
# screen on the phone: engine-data.zip must be at the assets ROOT because
# android_main.rs opens the literal asset name "engine-data.zip", and the
# library must be a real shared object rather than an LFS pointer or HTML error
# page saved with a .so name.

if (-not (Test-Path $enginePath)) {
    throw "engine-data.zip was not staged into $assetDir."
}

$soBytes = [System.IO.File]::ReadAllBytes($soPath)
if ($soBytes.Length -lt 4 -or
    $soBytes[0] -ne 0x7F -or $soBytes[1] -ne 0x45 -or
    $soBytes[2] -ne 0x4C -or $soBytes[3] -ne 0x46) {
    throw "$soPath is not an ELF shared object."
}

Write-Output ''
Write-Output 'Horizon payload staged. Build with:'
Write-Output '  .\gradlew.bat :app:assembleRelease'
