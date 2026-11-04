# Run this YOURSELF in a PowerShell window:  powershell -ExecutionPolicy Bypass -File scripts\meta-activate.ps1
# 1. Asks for the Meta API key (hidden input; never printed, never stored in the repo).
# 2. GET https://api.meta.ai/v1/models: shows the model IDs your account can use (no paid call).
# 3. Writes the key and the reviewed live-approval settings as Edge Function Secrets of ONE project,
#    always named explicitly with --project-ref (this repo's linked project is production).
# Staging (default): approval for 23 hours (the gateway refuses anything over 24 h). Run again to renew.
# Production (-Production): the live site, approval for 60 days (the gateway refuses over 62). Run again to renew.
# Turn off: add -Disable (with -Production for the live site).

param([switch]$Disable, [switch]$Production)
$ErrorActionPreference = 'Stop'
$StagingRef = 'coftskrofgcfzsuqdtpn'
$ProductionRef = 'aywgulopittrbkkbwjwn'
$Ref = if ($Production) { $ProductionRef } else { $StagingRef }
$Name = if ($Production) { 'PRODUCTION (canli site)' } else { 'staging' }

if ($Disable) {
  npx --no-install supabase secrets set --project-ref $Ref AI_BACKEND_MODE=disabled
  Write-Host "$Name : AI_BACKEND_MODE=disabled. SQL editor ($Name): update ai_private.control set enabled=false where id;"
  exit 0
}

if ($Production) {
  $answer = Read-Host "Canli site ($ProductionRef) icin Meta anahtari yazilacak. Devam icin EVET yaz"
  if ($answer -cne 'EVET') { throw 'Iptal edildi.' }
}

$secure = Read-Host -AsSecureString 'Meta API key'
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $key) { throw 'Bos anahtar.' }

$models = Invoke-RestMethod -Uri 'https://api.meta.ai/v1/models' -Headers @{ Authorization = "Bearer $key" }
$ids = @($models.data | ForEach-Object { $_.id })
if (-not $ids.Count) { throw 'Model listesi bos geldi; anahtar veya hesap erisimini kontrol et.' }
Write-Host "Erisilebilen modeller:"; $ids | ForEach-Object { Write-Host "  $_" }

$default = if ($ids -contains 'muse-spark-1.3') { 'muse-spark-1.3' } else { $ids[0] }
$model = Read-Host "Kullanilacak model [$default]"
if (-not $model) { $model = $default }
if ($ids -notcontains $model) { throw "Listede yok: $model" }

$now = (Get-Date).ToUniversalTime()
$file = Join-Path $env:TEMP ("meta-secrets-" + [guid]::NewGuid() + '.env')
try {
  $common = @(
    "META_API_KEY=$key",
    "META_MODEL_ID=$model",
    "META_MODEL_VERIFIED_AT=$($now.ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    'META_MODEL_VERIFICATION_SOURCE=https://api.meta.ai/v1/models',
    'META_TOKEN_BOUND_VERIFIED=true'
  )
  $target = if ($Production) {
    $inRate = Read-Host 'Meta giris fiyati, USD / 1M token [1.25]'; if (-not $inRate) { $inRate = '1.25' }
    $outRate = Read-Host 'Meta cikis fiyati, USD / 1M token [4.25]'; if (-not $outRate) { $outRate = '4.25' }
    @(
      "META_INPUT_USD_PER_MILLION=$inRate",
      "META_OUTPUT_USD_PER_MILLION=$outRate",
      "AI_STAGING_PROJECT_REF=$StagingRef",
      "AI_PRODUCTION_PROJECT_REF=$ProductionRef",
      'AI_ALLOWED_ORIGINS=https://notanota.online,https://www.notanota.online',
      'AI_PRODUCTION_TASKS=practice-feedback,adaptive-exercises,teacher-chat,weekly-report,score-screen',
      'AI_PRODUCTION_LIVE_APPROVAL=APPROVED_BOUNDED_META_PRODUCTION',
      "AI_PRODUCTION_APPROVAL_EXPIRES_AT=$($now.AddDays(60).ToString('yyyy-MM-ddTHH:mm:ssZ'))",
      'AI_BACKEND_MODE=production-meta'
    )
  } else {
    @(
      'AI_STAGING_LIVE_APPROVAL=APPROVED_BOUNDED_META_STAGING',
      "AI_STAGING_APPROVAL_EXPIRES_AT=$($now.AddHours(23).ToString('yyyy-MM-ddTHH:mm:ssZ'))",
      'AI_BACKEND_MODE=staging-meta'
    )
  }
  ($common + $target) | Set-Content -Path $file -Encoding ascii
  npx --no-install supabase secrets set --project-ref $Ref --env-file $file
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set basarisiz.' }
} finally {
  Remove-Item -Force $file -ErrorAction SilentlyContinue
  $key = $null
}

Write-Host ""
if ($Production) {
  Write-Host "Tamam: canli site sirlari yazildi (model $model, onay 60 gun)."
  Write-Host "SQL Editor adimi (out-sql\production-ai-launch.sql) yapilmadiysa simdi yap; AI ancak ondan sonra acilir."
} else {
  Write-Host "Tamam: staging sirlari yazildi (model $model, onay 23 saat)."
  Write-Host "Son adim, Supabase panosu > staging projesi > SQL Editor:"
  Write-Host "  update ai_private.control set enabled=true, project_ref='$StagingRef' where id;"
}
