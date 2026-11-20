# Yayın başlatıcı (Windows): oyun sunucusu + panel (tarayıcı) + OBS ("TikTok Dernek" profili, "Dernek" sahnesi).
# Kullanım: yayin.cmd'ye çift tıkla ya da  powershell -ExecutionPolicy Bypass -File yayin.ps1
# OBS kapanınca, betiğin başlattığı oyun sunucusu da kapanır.
# Profil/sahne yoksa ilk çalıştırmada oluşturulur; varsa dokunulmaz (girilen yayın anahtarı korunur).
$ErrorActionPreference = 'Stop'
# OBS BOM'lu dosya okuyamaz; PowerShell 5.1 Set-Content UTF8 BOM ekler
function Out-Dosya($Yol, [Parameter(ValueFromPipeline)]$Metin) { process { [IO.File]::WriteAllText($Yol, $Metin) } }
Set-Location $PSScriptRoot

$obs = "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe"
if (-not (Test-Path $obs)) {
  Write-Host 'OBS kurulu değil. Kur:  winget install OBSProject.OBSStudio' -ForegroundColor Red
  Read-Host 'Kapatmak için Enter'; exit 1
}

# --- OBS profili ve sahne koleksiyonu (yayin.sh'deki Linux profiliyle aynı ayarlar) ---
$obsDir = "$env:APPDATA\obs-studio\basic"
$profil = "$obsDir\profiles\TikTok_Dernek"
if (-not (Test-Path "$profil\basic.ini")) {
  New-Item -ItemType Directory -Force $profil | Out-Null
  $kayit = "$env:USERPROFILE\Videos\obs_records"
  New-Item -ItemType Directory -Force $kayit | Out-Null
  @"
[General]
Name=TikTok Dernek

[Video]
BaseCX=1080
BaseCY=1920
OutputCX=1080
OutputCY=1920
FPSType=0
FPSCommon=30

[Output]
Mode=Simple

[SimpleOutput]
StreamEncoder=nvenc
RecEncoder=nvenc
VBitrate=6000
ABitrate=160
RecQuality=Stream
FilePath=$kayit
RecFormat=mp4
RecFormat2=mp4
FilenameFormatting=dernek_%CCYY-%MM-%DD_%hh-%mm-%ss
"@ | Out-Dosya "$profil\basic.ini"
  # Yayın adresi ve anahtarı boş: TikTok'tan alınıp Ayarlar → Yayın → Özel'e girilir
  '{"type":"rtmp_custom","settings":{"server":"","key":""}}' | Out-Dosya "$profil\service.json"
  Write-Host "OBS profili oluşturuldu: $profil"
}

$sahne = "$obsDir\scenes\Dernek.json"
if (-not (Test-Path $sahne)) {
  New-Item -ItemType Directory -Force "$obsDir\scenes" | Out-Null
  $sahneId = [guid]::NewGuid().ToString(); $oyunId = [guid]::NewGuid().ToString()
  @{
    name = 'Dernek'; current_scene = 'Sahne'; current_program_scene = 'Sahne'
    scene_order = @(@{ name = 'Sahne' })
    sources = @(
      @{ id = 'scene'; versioned_id = 'scene'; name = 'Sahne'; uuid = $sahneId
         settings = @{ id_counter = 1; items = @(@{ name = 'Oyun'; source_uuid = $oyunId; id = 1; visible = $true
           pos = @{ x = 0; y = 0 }; scale = @{ x = 1; y = 1 }; bounds_type = 0 }) } },
      # Ses OBS üzerinden gider, hoparlörden de duyulur (monitoring_type 2 = izle ve çıkışa ver)
      @{ id = 'browser_source'; versioned_id = 'browser_source'; name = 'Oyun'; uuid = $oyunId; monitoring_type = 2
         settings = @{ url = 'http://localhost:5173/'; width = 1080; height = 1920; fps = 30; reroute_audio = $true } }
    )
  } | ConvertTo-Json -Depth 10 | Out-Dosya $sahne
  Write-Host "OBS sahnesi oluşturuldu: $sahne"
}

# --- Oyun sunucusu ---
$adres = 'http://localhost:5173'
function Test-Sunucu { try { Invoke-WebRequest "$adres/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $true } catch { $false } }

$sunucu = $null
if (-not (Test-Sunucu)) {
  if (-not (Test-Path node_modules)) { npm ci }
  $log = "$env:TEMP\dernek-vite.log"
  $sunucu = Start-Process node -ArgumentList 'node_modules/vite/bin/vite.js', 'client', '--host', '--port', '5173', '--strictPort' `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  foreach ($i in 1..60) { if (Test-Sunucu) { break }; Start-Sleep -Milliseconds 500 }
  if (-not (Test-Sunucu)) { Write-Host "Oyun sunucusu açılmadı, bkz. $log" -ForegroundColor Red; Read-Host; exit 1 }
}

try {
  # Panel motoru çalıştırır: yalnızca BİR panel sekmesi açık olmalı (iki panel = iki motor, çakışır)
  Start-Process "$adres/dashboard.html"
  # OBS kendi klasöründen çalıştırılmalı, yoksa dil/eklenti dosyalarını bulamaz
  Start-Process $obs -ArgumentList '--profile', '"TikTok Dernek"', '--collection', 'Dernek' -WorkingDirectory (Split-Path $obs) -Wait
} finally {
  if ($sunucu) { Stop-Process -Id $sunucu.Id -Force -ErrorAction SilentlyContinue }
}
