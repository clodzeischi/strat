# Strat launcher for Windows: gets the game, gets Node.js if needed, builds, starts the server
# and opens the game in your browser. Run it again any time to update and play.
#
#   In PowerShell:  irm https://raw.githubusercontent.com/clodzeischi/strat/main/play.ps1 | iex
#   Or double-click play.bat in the game's folder.
#
# Settings (environment variables): STRAT_DIR (where the game goes, default %USERPROFILE%\strat), PORT (default 8080).
# Node.js is installed for you only if you don't have a recent enough one, into %USERPROFILE%\.strat (no admin rights needed).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is very slow with its progress bar on
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'clodzeischi/strat'
$NodeVersion = '22.23.4'
$Port = if ($env:PORT) { $env:PORT } else { '8080' }

function Say($text) { Write-Host "==> $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "Error: $text" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }

function Test-NodeOk {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  try { $v = (& node -v).TrimStart('v').Split('.') } catch { return $false }
  $major = [int]$v[0]; $minor = [int]$v[1]
  # Vite needs Node 20.19+ or 22.12+.
  return ($major -ge 23) -or ($major -eq 22 -and $minor -ge 12) -or ($major -eq 20 -and $minor -ge 19)
}

function Expand-Zip($zip, $dest) {
  # tar.exe (Windows 10 and later) is much faster than Expand-Archive.
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  if (Get-Command tar.exe -ErrorAction SilentlyContinue) { & tar.exe -xf $zip -C $dest; if ($LASTEXITCODE -eq 0) { return } }
  Expand-Archive -Path $zip -DestinationPath $dest -Force
}

function Get-GameZip($dir) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("strat-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Repo/zip/refs/heads/main" -OutFile "$tmp\strat.zip"
    Expand-Zip "$tmp\strat.zip" $tmp
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -Path "$tmp\strat-main\*" -Destination $dir -Recurse -Force
    # Make the build below run again.
    Remove-Item "$dir\dist\index.html" -ErrorAction SilentlyContinue
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# --- The game ---
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
if ($PSScriptRoot -and (Test-Path "$PSScriptRoot\package.json") -and (Select-String -Quiet -Path "$PSScriptRoot\package.json" -Pattern '"name": "strat"')) {
  $Dir = $PSScriptRoot
} elseif ($env:STRAT_DIR) { $Dir = $env:STRAT_DIR } else { $Dir = Join-Path $HOME 'strat' }

if ((Test-Path "$Dir\.git") -and $hasGit) {
  Say "Updating the game in $Dir"
  & git -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Say "Couldn't update (offline, or files changed locally). Playing the copy you have." }
} elseif (Test-Path "$Dir\package.json") {
  Say "Updating the game in $Dir"
  try { Get-GameZip $Dir } catch { Say "Couldn't download the update. Playing the copy you have." }
} elseif (Test-Path $Dir) {
  Fail "$Dir exists but isn't the game. Move it, or set STRAT_DIR to another folder."
} elseif ($hasGit) {
  Say "Downloading the game into $Dir"
  & git clone --depth 1 "https://github.com/$Repo.git" $Dir
  if ($LASTEXITCODE -ne 0) { Fail "Couldn't download the game." }
} else {
  Say "Downloading the game into $Dir (git isn't installed, so as an archive)"
  Get-GameZip $Dir
}

# --- Node.js ---
if (Test-NodeOk) {
  Say "Using Node.js $(& node -v)"
} else {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $name = "node-v$NodeVersion-win-$arch"
  $base = Join-Path $HOME '.strat'
  if (-not (Test-Path "$base\$name\node.exe")) {
    Say "Installing Node.js $NodeVersion into $base (only the game uses it)"
    New-Item -ItemType Directory -Force -Path $base | Out-Null
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/v$NodeVersion/$name.zip" -OutFile "$base\$name.zip"
    Expand-Zip "$base\$name.zip" $base
    Remove-Item "$base\$name.zip"
  }
  $env:PATH = "$base\$name;$env:PATH"
  Say "Using Node.js $(& node -v)"
}

# --- Packages and build ---
Set-Location $Dir
$stamp = 'node_modules\.strat-lock'
if (-not (Test-Path node_modules) -or -not (Test-Path $stamp) -or ((Get-FileHash package-lock.json).Hash -ne (Get-FileHash $stamp).Hash)) {
  Say "Installing the game's packages (a minute or two the first time)"
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "Installing the packages failed." }
  Copy-Item package-lock.json $stamp
}
$built = Get-Item dist\index.html -ErrorAction SilentlyContinue
$changed = $null
if ($built) {
  $changed = Get-ChildItem -Recurse -File src, server, index.html, package-lock.json, vite.config.ts |
    Where-Object { $_.FullName -notlike "*\node_modules\*" -and $_.LastWriteTime -gt $built.LastWriteTime } | Select-Object -First 1
}
if (-not $built -or $changed) {
  Say "Building the game"
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Fail "The build failed." }
}

# --- Play ---
$url = "http://localhost:$Port"
try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null; Fail "Something is already running on port $Port (maybe the game, in another window). Close it, or set PORT to another port." } catch {}

Say "Starting the game server. Leave this window open while you play; close it or press Ctrl+C to stop."
Say "If Windows asks whether Node.js may use the network, allow it (needed only for playing with others)."
Start-Job -ArgumentList $url -ScriptBlock {
  param($url)
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null; Start-Process $url; return } catch { Start-Sleep 1 }
  }
} | Out-Null
$env:PORT = $Port
& node node_modules\tsx\dist\cli.mjs server\server.ts
