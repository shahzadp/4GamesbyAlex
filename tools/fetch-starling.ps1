# Stages the forked Starling native payload into the APK.
#
# Game 4 is Starling, a Rust Minecraft: Java Edition client that runs as a
# NativeActivity in its own process. Its ~267 MB of arm64 libraries and the
# kits it needs to prepare game files on the phone are not committed, so a
# fresh checkout has to stage them from a hash-verified release.
#
# What it produces (all gitignored - see .gitignore):
#
#   app/src/main/jniLibs/arm64-v8a/*.so       (16 libraries)
#   app/src/main/assets/prepare-kit.zip
#   app/src/main/assets/lowbudget.zip
#   app/src/main/assets/StarlingVisuals.zip
#   app/src/main/assets/diagnostic-fonts/*.ttf
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/fetch-starling.ps1
#   powershell -ExecutionPolicy Bypass -File tools/fetch-starling.ps1 -Force
#
# The download lands in D:\dev\Installers\horizon (never on C:, which is nearly
# full). -Force re-downloads and re-extracts even when everything is staged.

param([switch]$Force)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$version = '0.9.0'
$abi = 'arm64-v8a'
$asset = "starling-$version-$abi.apk"
$base = "https://github.com/starling-client/starling/releases/download/v$version"
$expected = 'fd31e8d90a0e787c315846ddaa81e66cc916607e67cba702658d2d569689a571'

$downloadDir = if ($env:HORIZON_INSTALLERS) { $env:HORIZON_INSTALLERS } else { 'D:\dev\Installers\horizon' }
$apkPath = Join-Path $downloadDir $asset

$jniDir = Join-Path $root "app\src\main\jniLibs\$abi"
$assetDir = Join-Path $root 'app\src\main\assets'
$fontDir = Join-Path $assetDir 'diagnostic-fonts'

# --- 1. Is everything already staged? -------------------------------------
$staged = (Test-Path (Join-Path $jniDir 'libhorizon_android.so')) -and
          (Test-Path (Join-Path $assetDir 'prepare-kit.zip')) -and
          (Test-Path (Join-Path $assetDir 'lowbudget.zip')) -and
          (Test-Path (Join-Path $assetDir 'StarlingVisuals.zip'))
if ($staged -and -not $Force) {
    Write-Output "ALREADY-STAGED: $jniDir"
    Write-Output 'Pass -Force to re-download and re-extract.'
    exit 0
}

# --- 2. Download and verify ------------------------------------------------

New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
if (-not (Test-Path $apkPath) -or $Force) {
    Write-Output "DOWNLOAD: $base/$asset"
    Invoke-WebRequest -Uri "$base/$asset" -OutFile $apkPath -UseBasicParsing
}
$actual = (Get-FileHash -Path $apkPath -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) {
    throw "Checksum mismatch for $asset.`n  expected $expected`n  actual   $actual`nDelete $apkPath and re-run."
}
Write-Output "VERIFIED: $actual"

# --- 3. Extract ------------------------------------------------------------
# Only the libraries and the resource kits are taken. The rest of the APK
# (its own manifest, dex and resources) belongs to Starling's app id; the
# Java bridge and manifest entries are vendored separately as sources so
# they compile against this app's package and R class.

New-Item -ItemType Directory -Force -Path $jniDir, $fontDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $count = 0
    foreach ($entry in $zip.Entries) {
        $target = $null
        if ($entry.FullName -like "lib/$abi/*") {
            $target = Join-Path $jniDir ($entry.FullName -split '/')[-1]
        } elseif ($entry.FullName -in @('assets/StarlingVisuals.zip',
                                        'assets/lowbudget.zip',
                                        'assets/prepare-kit.zip')) {
            $target = Join-Path $assetDir ($entry.FullName -split '/')[-1]
        } elseif ($entry.FullName -like 'assets/diagnostic-fonts/*') {
            $target = Join-Path $assetDir ($entry.FullName -replace '^assets/', '')
        }
        if ($target) {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
            $count++
            Write-Output ("EXTRACTED: {0}" -f $entry.FullName)
        }
    }
    Write-Output "EXTRACTED: $count entries"
}
finally {
    $zip.Dispose()
}

# --- 4. Sanity check -------------------------------------------------------
$soPath = Join-Path $jniDir 'libhorizon_android.so'
if (-not (Test-Path $soPath)) { throw "libhorizon_android.so was not staged into $jniDir." }
$bytes = [System.IO.File]::ReadAllBytes($soPath)
if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x7F -or $bytes[1] -ne 0x45 -or
    $bytes[2] -ne 0x4C -or $bytes[3] -ne 0x46) {
    throw "$soPath is not an ELF shared object."
}

Write-Output ''
Write-Output 'Starling payload staged. Build with:'
Write-Output '  .\gradlew.bat :app:assembleRelease'
