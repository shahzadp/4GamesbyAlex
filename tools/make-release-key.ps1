# Generates a LOCAL DEVELOPMENT release keystore.
#
# The keystore and its credentials are written to files that are already in
# .gitignore (release-keys/ and keystore.properties), so nothing secret is
# ever staged for commit. The password is generated randomly here and never
# printed - read it from keystore.properties if you ever need it.
#
# This is a development key. If you ever publish to Play Store you must use a
# key you control the lifetime of: losing it means you can never update the
# listing again, and Play will reject a different key for the same package.

$ErrorActionPreference = 'Stop'
$root = 'D:\GitHub-Projects\4GamesbyAlex'
$keyDir = Join-Path $root 'release-keys'
$keyPath = Join-Path $keyDir 'release.jks'
$propsPath = Join-Path $root 'keystore.properties'

if (Test-Path $keyPath) {
    Write-Output "KEYSTORE-EXISTS: $keyPath"
    exit 0
}

New-Item -ItemType Directory -Force -Path $keyDir | Out-Null

# 32 chars of cryptographic randomness, base64-free so it needs no escaping
# in either the properties file or a shell command line.
$bytes = New-Object 'System.Byte[]' 24
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$pw = [System.Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''

# JAVA_HOME is not set on every machine (it is empty here), so fall back to
# whatever keytool is on PATH before giving up. Join-Path against a null
# env var throws, so probe it defensively rather than assuming.
$keytool = $null
if ($env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
    if (Test-Path $candidate) { $keytool = $candidate }
}
if (-not $keytool) {
    $onPath = Get-Command keytool -ErrorAction SilentlyContinue
    if ($onPath) { $keytool = $onPath.Source }
}
if (-not $keytool) { throw "keytool not found. Set JAVA_HOME or add keytool to PATH." }

Write-Output "KEYTOOL: $keytool"

# keytool writes its progress ("Generating 2048-bit RSA key pair...") to stderr.
# In Windows PowerShell 5.1 a native command's stderr redirected with 2>&1
# becomes ErrorRecord objects, and under ErrorActionPreference='Stop' those are
# promoted to a terminating error - so the script aborts even though keytool
# succeeded. Relax the preference for this one call and judge success by
# whether the keystore file actually appeared, not by the exit text.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$keytoolOutput = & $keytool -genkeypair `
    -keystore $keyPath `
    -storetype PKCS12 `
    -storepass $pw `
    -keypass $pw `
    -alias release `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10950 `
    -dname "CN=4GamesbyAlex, OU=Dev, O=4GamesbyAlex, L=NA, S=NA, C=NA" 2>&1
$ErrorActionPreference = $previousPreference

if (-not (Test-Path $keyPath)) {
    throw "keytool did not produce $keyPath. Output: $keytoolOutput"
}

# No BOM: java.util.Properties reads this as ISO-8859-1 and a BOM would corrupt
# the first key name.
$props = @(
    "storeFile=release-keys/release.jks"
    "storePassword=$pw"
    "keyAlias=release"
    "keyPassword=$pw"
) -join "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($propsPath, $props, $utf8NoBom)

Write-Output "KEYSTORE-CREATED: $keyPath"
Write-Output "PROPS-CREATED: $propsPath (gitignored, password not printed)"
