# Casper xCloud — yeni sürüm yayınla
# Kullanım:  .\release.ps1 1.0.1 "Değişiklik notları"
# Sürümü günceller, imzalı kurulumu derler, latest.json üretir ve GitHub Releases'a yükler.
# Yüklü uygulamalar açılışta bu sürümü görüp kendini günceller.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Notes = "Casper xCloud $Version"
)
$ErrorActionPreference = "Stop"
$Repo = "CASPER00531453/casper-xcloud"
$Key = "$env:USERPROFILE\.tauri\casper-xcloud-updater.key"
if (-not (Test-Path $Key)) { throw "İmza anahtarı yok: $Key (bu anahtar olmadan güncelleme yayınlanamaz)" }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Sürüm x.y.z biçiminde olmalı" }
Set-Location $PSScriptRoot

# 1) Sürümü üç yerde güncelle
foreach ($f in "src-tauri\tauri.conf.json", "package.json") {
    $t = Get-Content $f -Raw
    $t = [regex]::Replace($t, '(?m)^  "version": "[^"]+"', "  `"version`": `"$Version`"", 1)
    [IO.File]::WriteAllText((Resolve-Path $f), $t)
}
$c = Get-Content "src-tauri\Cargo.toml" -Raw
$c = [regex]::Replace($c, '(?m)^version = "[^"]+"', "version = `"$Version`"", 1)
[IO.File]::WriteAllText((Resolve-Path "src-tauri\Cargo.toml"), $c)

# 2) İmzalı derleme
Get-Process casper-xcloud -ErrorAction SilentlyContinue | Stop-Process -Force
$env:TAURI_SIGNING_PRIVATE_KEY = $Key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npx tauri build
if ($LASTEXITCODE -ne 0) { throw "Derleme başarısız" }

# 3) Yayın dosyaları (GitHub boşlukları sevmez: dosya adında tire)
$nsis = "src-tauri\target\release\bundle\nsis"
$out = "release-out\$Version"
New-Item -ItemType Directory -Force $out | Out-Null
$setup = "Casper-xCloud_${Version}_x64-setup.exe"
Copy-Item "$nsis\Casper xCloud_${Version}_x64-setup.exe" "$out\$setup" -Force
Copy-Item "$nsis\Casper xCloud_${Version}_x64-setup.exe.sig" "$out\$setup.sig" -Force
$sig = (Get-Content "$out\$setup.sig" -Raw).Trim()
$plat = @{ signature = $sig; url = "https://github.com/$Repo/releases/download/v$Version/$setup" }
$latest = [ordered]@{
    version   = $Version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{ "windows-x86_64" = $plat; "windows-x86_64-nsis" = $plat }
}
[IO.File]::WriteAllText((Join-Path (Resolve-Path $out) "latest.json"), ($latest | ConvertTo-Json -Depth 5))
$hash = (Get-FileHash "$out\$setup" -Algorithm SHA256).Hash.ToLower()

# 4) GitHub Releases
$body = "$Notes`n`nDestek: [Casper Technology](https://casper-technology.vercel.app/)`n`nSHA-256 (setup.exe): ``$hash``"
gh release create "v$Version" -R $Repo --title "Casper xCloud $Version" --notes $body "$out\$setup" "$out\$setup.sig" "$out\latest.json"
Write-Host "Yayınlandı: https://github.com/$Repo/releases/tag/v$Version"
