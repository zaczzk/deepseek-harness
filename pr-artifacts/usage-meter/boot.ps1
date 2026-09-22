# Boot one real dsh web server from the recorded tree for the GIF run.
# Fresh scratch DSH_HOME/DSH_AGENTS_HOME/workspace; the provider config is
# copied (configuration only) and the API key arrives through the app's own
# credential-ref path without ever being printed.
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$RunDir
)

$ErrorActionPreference = 'Stop'
$dshHome = Join-Path $RunDir 'dsh-home'
$agents = Join-Path $RunDir 'dsh-agents'
$workspace = Join-Path $RunDir 'workspace'
New-Item -ItemType Directory -Force -Path $dshHome, $agents, $workspace | Out-Null

# Provider composition only (no credentials live in this file).
Copy-Item (Join-Path $env:DSH_HOME 'cordis.patch.yml') (Join-Path $dshHome 'cordis.patch.yml') -Force

# The API key through the application's normal credential-ref path.
$raw = Get-Content (Join-Path $env:DSH_HOME '.credentials.yaml') -Raw
$script:apiKey = [regex]::Match($raw, '(?m)^\s*MIMO_API_KEY:\s*(.+)$').Groups[1].Value.Trim().Trim("'`"")
if (-not $apiKey) { throw 'no MIMO_API_KEY in the credentials store' }

$log = Join-Path $RunDir 'server.log'
$env:DSH_HOME = $dshHome
$env:DSH_AGENTS_HOME = $agents
$env:MIMO_API_KEY = $apiKey
$env:NO_COLOR = '1'

$process = Start-Process -FilePath 'node' `
  -ArgumentList '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--patch', 'apps/web/tests/pin-browse-picker.overlay.yml', '--no-open', '--port', '3181' `
  -WorkingDirectory $Repo -RedirectStandardOutput $log -RedirectStandardError (Join-Path $RunDir 'server.err.log') `
  -PassThru -NoNewWindow
$process.Id | Out-File (Join-Path $RunDir 'server.pid') -Encoding ascii

# Wait for the printed authenticated URL (bounded).
$url = ''
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  $text = if (Test-Path $log) { Get-Content $log -Raw } else { $null }
  if (-not $text) { continue }
  $match = [regex]::Match($text, 'http://127\.0\.0\.1:\d+/[^\s]*(?:token|auth)[^\s]*')
  if (-not $match.Success) { $match = [regex]::Match($text, 'http://127\.0\.0\.1:\d+[^\s]*') }
  if ($match.Success) { $url = $match.Value; break }
}
if (-not $url) { throw "server did not print a URL; see $log" }
$url | Out-File (Join-Path $RunDir 'server.url') -Encoding ascii
Write-Output "server pid $($process.Id) url recorded"
