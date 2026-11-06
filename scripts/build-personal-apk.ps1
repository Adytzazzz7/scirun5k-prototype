$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$toolchain = Join-Path $projectRoot '.android-toolchain'
$localJdk = Get-ChildItem -LiteralPath (Join-Path $toolchain 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
if (-not $env:JAVA_HOME) { throw 'JDK 21 is required.' }
$localSdk = Join-Path $toolchain 'sdk'
if (Test-Path -LiteralPath $localSdk) { $env:ANDROID_SDK_ROOT = $localSdk; $env:ANDROID_HOME = $localSdk }
if (-not $env:ANDROID_SDK_ROOT) { throw 'Android SDK 36 is required.' }
$env:GRADLE_USER_HOME = Join-Path $toolchain 'gradle'
& (Join-Path $PSScriptRoot 'create-personal-signing.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Signing setup failed.' }
& node (Join-Path $PSScriptRoot 'build-web.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Web asset build failed.' }
& (Join-Path $projectRoot 'node_modules/.bin/cap.cmd') sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
& (Join-Path $projectRoot 'android/gradlew.bat') -p android assembleRelease --offline --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
$releaseDir = Join-Path $projectRoot 'android/app/build/outputs/apk/release'
$metadataFile = Join-Path $releaseDir 'output-metadata.json'
if (-not (Test-Path -LiteralPath $metadataFile)) { throw 'Release APK metadata was not generated.' }
$metadata = Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json
if ($metadata.applicationId -ne 'com.scirun.personal5k' -or $metadata.variantName -ne 'release') { throw 'Unexpected release APK metadata.' }
$releaseEntry = @($metadata.elements | Where-Object { $_.type -eq 'SINGLE' -and $_.outputFile -eq 'app-release.apk' })
if ($releaseEntry.Count -ne 1 -or [int]$releaseEntry[0].versionCode -lt 2) { throw 'Release APK version metadata is invalid.' }
$versionName = [string]$releaseEntry[0].versionName
if ($versionName -notmatch '^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$') { throw 'Release APK version name is invalid.' }
$source = Join-Path $releaseDir $releaseEntry[0].outputFile
if (-not (Test-Path -LiteralPath $source)) { throw 'Release APK was not generated.' }
$destinationDir = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
$destination = Join-Path $destinationDir "SciRun-5K-$versionName-android.apk"
Copy-Item -LiteralPath $source -Destination $destination -Force
$apksigner = Join-Path $env:ANDROID_SDK_ROOT 'build-tools/36.0.0/apksigner.bat'
& $apksigner verify --verbose $destination
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$apk = Get-Item -LiteralPath $destination
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
Write-Output "APK: $($apk.FullName)"
Write-Output "Size: $($apk.Length) bytes"
Write-Output "SHA256: $hash"
