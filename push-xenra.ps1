$ErrorActionPreference = 'Stop'

Write-Host "XENRA - GitHub Push" -ForegroundColor Cyan
Write-Host "Repository: https://github.com/phoenixsean69-hash/xenra---our-workspace.git" -ForegroundColor DarkGray

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or is not on PATH."
}

Set-Location $PSScriptRoot

if (-not (Test-Path '.git')) {
    git init
}

git branch -M main

$origin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    git remote set-url origin 'https://github.com/phoenixsean69-hash/xenra---our-workspace.git'
} else {
    git remote add origin 'https://github.com/phoenixsean69-hash/xenra---our-workspace.git'
}

git add .

$staged = git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m 'feat: initialize XENRA 0.1'
} else {
    Write-Host 'No new changes to commit.' -ForegroundColor Yellow
}

git push -u origin main

Write-Host "`nXENRA pushed successfully." -ForegroundColor Green
