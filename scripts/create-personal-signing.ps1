$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$privateDir = Join-Path $projectRoot '.android-toolchain'
$keyFile = Join-Path $privateDir 'scirun-personal.jks'
$propertiesFile = Join-Path $privateDir 'signing.properties'
if ((Test-Path -LiteralPath $keyFile) -and (Test-Path -LiteralPath $propertiesFile)) {
  Write-Output 'Existing personal signing key retained.'
  exit 0
}
if ((Test-Path -LiteralPath $keyFile) -or (Test-Path -LiteralPath $propertiesFile)) {
  throw 'Incomplete personal signing files; restore the matching key and properties before building.'
}
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
$jdk = Get-ChildItem -LiteralPath (Join-Path $privateDir 'jdk') -Directory | Select-Object -First 1
if (-not $jdk) { throw 'Local JDK 21 is missing.' }
$keytool = Join-Path $jdk.FullName 'bin/keytool.exe'
$password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
& $keytool -genkeypair -v -keystore $keyFile -alias scirun-personal -keyalg RSA -keysize 3072 -validity 36500 -storepass $password -keypass $password -dname 'CN=SciRun Personal, OU=Personal, O=SciRun, C=RO'
if ($LASTEXITCODE -ne 0) { throw 'Android signing key generation failed.' }
$properties = "storePassword=$password`nkeyAlias=scirun-personal`nkeyPassword=$password`n"
[System.IO.File]::WriteAllText($propertiesFile, $properties, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Personal signing key created and stored outside Git tracking.'
