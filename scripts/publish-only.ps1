param(
  [string]$CommitMessage = "update dashboard",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "필수 명령어가 없습니다: $name"
  }
}

Require-Command git

$repoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $repoRoot

Write-Host "[1/3] Git 상태 확인..." -ForegroundColor Cyan
git status --short

Write-Host "[2/3] 커밋 준비..." -ForegroundColor Cyan
git add .
$hasChanges = (git diff --cached --name-only)
if (-not $hasChanges) {
  Write-Host "커밋할 변경사항이 없습니다. (스킵)" -ForegroundColor Yellow
} else {
  git commit -m $CommitMessage
}

Write-Host "[3/3] 원격 푸시..." -ForegroundColor Cyan
git push origin $Branch
Write-Host "완료: GitHub Pages 반영 대기 (보통 1~5분)" -ForegroundColor Green
