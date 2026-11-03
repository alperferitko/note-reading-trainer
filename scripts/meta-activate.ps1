# Run this YOURSELF in a PowerShell window:  powershell -ExecutionPolicy Bypass -File scripts\meta-activate.ps1
# 1. Asks for the Meta API key (hidden input; never printed, never stored in the repo).
# 2. GET https://api.meta.ai/v1/models: shows the model IDs your account can use (no paid call).
# 3. Writes the key and the reviewed live-approval settings as Edge Function Secrets of the STAGING
#    project only (explicit --project-ref; this repo's linked project is production).
# Approval expires after 23 hours (the gateway refuses anything over 24 h). Run again to renew.
# Turn off: powershell -ExecutionPolicy Bypass -File scripts\meta-activate.ps1 -Disable

param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$StagingRef = 'coftskrofgcfzsuqdtpn'

if ($Disable) {
  npx --no-install supabase secrets set --project-ref $StagingRef AI_BACKEND_MODE=disabled
  Write-Host "AI_BACKEND_MODE=disabled. SQL editor (staging): update ai_private.control set enabled=false where id;"
  exit 0
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
  @(
    "META_API_KEY=$key",
    "META_MODEL_ID=$model",
    "META_MODEL_VERIFIED_AT=$($now.ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    'META_MODEL_VERIFICATION_SOURCE=https://api.meta.ai/v1/models',
    'META_TOKEN_BOUND_VERIFIED=true',
    'AI_STAGING_LIVE_APPROVAL=APPROVED_BOUNDED_META_STAGING',
    "AI_STAGING_APPROVAL_EXPIRES_AT=$($now.AddHours(23).ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    'AI_BACKEND_MODE=staging-meta'
  ) | Set-Content -Path $file -Encoding ascii
  npx --no-install supabase secrets set --project-ref $StagingRef --env-file $file
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set basarisiz.' }
} finally {
  Remove-Item -Force $file -ErrorAction SilentlyContinue
  $key = $null
}

Write-Host ""
Write-Host "Tamam: staging sirlari yazildi (model $model, onay 23 saat)."
Write-Host "Son adim, Supabase panosu > staging projesi > SQL Editor:"
Write-Host "  update ai_private.control set enabled=true, project_ref='$StagingRef' where id;"
