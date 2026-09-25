$ErrorActionPreference = "Stop"

Write-Host "XENRA - Development Environment" -ForegroundColor Cyan
Write-Host ""

$missing = $false
foreach ($cmd in @("node", "npm")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        $version = if ($cmd -eq "node") { node -v } else { npm -v }
        Write-Host ("[OK] {0,-8} {1}" -f $cmd, $version) -ForegroundColor Green
    } else {
        Write-Host ("[MISSING] {0}" -f $cmd) -ForegroundColor Red
        $missing = $true
    }
}

if (-not $missing) {
    $nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) {
        Write-Host "[WARNING] Node 22+ is recommended for this workspace." -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "[READY] No Rust or Cargo required." -ForegroundColor Green
}
