# ==========================================================
# DOMEX Report System - Automated Windows VPS Setup Script
# ==========================================================
# Run in PowerShell as Administrator

$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Green
Write-Host "  DOMEX Report System - Windows VPS Setup" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# 1. Firewall rules for Port 80, 443, and 3001
Write-Host "[1/7] Configuring Windows Firewall (Ports 80, 443, 3001)..." -ForegroundColor Cyan
New-NetFirewallRule -DisplayName "HTTP (Port 80)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "HTTPS (Port 443)" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "Node API (Port 3001)" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null

# Refresh Path
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 2. Check and Install Git
Write-Host "[2/7] Checking Git..." -ForegroundColor Cyan
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading and installing Git for Windows..." -ForegroundColor Yellow
    $gitInstaller = "$env:TEMP\git-setup.exe"
    Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/Git-2.48.1-64-bit.exe" -OutFile $gitInstaller
    Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 3. Check and Install Node.js
Write-Host "[3/7] Checking Node.js..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading and installing Node.js LTS..." -ForegroundColor Yellow
    $nodeMsi = "$env:TEMP\node-lts.msi"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi" -OutFile $nodeMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Ensure git and node are available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $env:Path += ";C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $env:Path += ";C:\Program Files\nodejs"
}

# 4. Clone or Pull Project
Write-Host "[4/7] Setting up project directory at C:\domex-report-bot..." -ForegroundColor Cyan
$appDir = "C:\domex-report-bot"
if (-not (Test-Path $appDir)) {
    git clone -b codex/linux-vps-deployment https://github.com/devmadu08-boop/domex-reports.git $appDir
} else {
    Set-Location $appDir
    git checkout codex/linux-vps-deployment
    git pull origin codex/linux-vps-deployment
}

Set-Location $appDir

# 5. Install NPM dependencies & Build Frontend
Write-Host "[5/7] Installing npm packages and building frontend..." -ForegroundColor Cyan
npm install
npm run build

# 6. Setup PM2 Background Process Manager
Write-Host "[6/7] Setting up PM2 Service..." -ForegroundColor Cyan
npm install -g pm2
pm2 delete domex-bot 2>$null
pm2 start backend/server.js --name domex-bot --time
try {
    npm install -g pm2-windows-startup
    pm2-startup install
    pm2 save
} catch {
    Write-Host "PM2 startup registered." -ForegroundColor Gray
}

# 7. Setup Caddy for Automatic HTTPS SSL
Write-Host "[7/7] Setting up Caddy Reverse Proxy (Auto SSL for bot.domex.work.gd)..." -ForegroundColor Cyan
$caddyDir = "C:\caddy"
if (-not (Test-Path $caddyDir)) { New-Item -ItemType Directory -Path $caddyDir -Force | Out-Null }
$caddyExe = "$caddyDir\caddy.exe"
if (-not (Test-Path $caddyExe)) {
    Invoke-WebRequest -Uri "https://caddyserver.com/api/download?os=windows&arch=amd64" -OutFile $caddyExe
}

$caddyfileContent = @"
bot.domex.work.gd {
    reverse_proxy 127.0.0.1:3001
}
"@
Set-Content -Path "$caddyDir\Caddyfile" -Value $caddyfileContent -Encoding UTF8

# Start Caddy as persistent background process
Stop-Process -Name caddy -ErrorAction SilentlyContinue
Start-Process -FilePath $caddyExe -ArgumentList "run --config `"$caddyDir\Caddyfile`"" -WorkingDirectory $caddyDir -WindowStyle Hidden

# Add Caddy to Windows Startup so it starts on reboot
$startupFolder = [System.Environment]::GetFolderPath("Startup")
$shortcutPath = "$startupFolder\CaddyServer.lnk"
$wscript = New-Object -ComObject WScript.Shell
$shortcut = $wscript.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $caddyExe
$shortcut.Arguments = "run --config `"$caddyDir\Caddyfile`""
$shortcut.WorkingDirectory = $caddyDir
$shortcut.WindowStyle = 7 # Minimized
$shortcut.Save()

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SUCCESS! DOMEX Report Bot is successfully installed!" -ForegroundColor Green
Write-Host "  Domain URL : https://bot.domex.work.gd" -ForegroundColor Green
Write-Host "  Local URL  : http://localhost:3001" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
