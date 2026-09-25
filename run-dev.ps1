$ErrorActionPreference = "Stop"

Write-Host "" 
Write-Host "XENRA 0.1 - Electron" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor DarkGray

function Need($name, $message) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "[MISSING] $name" -ForegroundColor Red
        Write-Host $message -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[OK] $name" -ForegroundColor Green
}

Need "node" "Install Node.js 22 or newer."
Need "npm" "npm normally ships with Node.js."

if (-not (Test-Path "node_modules")) {
    Write-Host "" 
    Write-Host "Installing JavaScript dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "" 
Write-Host "Starting XENRA..." -ForegroundColor Cyan
npm run dev
exit $LASTEXITCODE
