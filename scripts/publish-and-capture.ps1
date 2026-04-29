param(
  [string]$CommitMessage = "update dashboard",
  [string]$Branch = "main",
  [int]$Port = 4173,
  [string]$OutputImage = "dashboard-latest.png",
  [string]$PageUrl = ""
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

Write-Host "[1/5] Git 상태 확인..." -ForegroundColor Cyan
git status --short

Write-Host "[2/5] 변경사항 커밋..." -ForegroundColor Cyan
git add .

$hasChanges = (git diff --cached --name-only)
if (-not $hasChanges) {
  Write-Host "커밋할 변경사항이 없습니다. (스킵)" -ForegroundColor Yellow
} else {
  git commit -m $CommitMessage
}

Write-Host "[3/5] 원격 푸시..." -ForegroundColor Cyan
git push origin $Branch

if ([string]::IsNullOrWhiteSpace($PageUrl)) {
  $originUrl = (git remote get-url origin)
  if ($originUrl -match "github.com[:/](.+?)/(.+?)(\.git)?$") {
    $owner = $matches[1]
    $repo = $matches[2]
    $repo = $repo -replace "\.git$", ""
    $PageUrl = "https://$owner.github.io/$repo/"
  } else {
    throw "PageUrl 자동 계산 실패. -PageUrl로 직접 지정해주세요."
  }
}

Write-Host "[4/5] 스크린샷 준비..." -ForegroundColor Cyan
$serverJob = Start-Job -ScriptBlock {
  param($root, $port)
  Set-Location $root
  python -m http.server $port | Out-Null
} -ArgumentList $repoRoot, $Port

Start-Sleep -Seconds 2

try {
  Require-Command npx
  npx --yes playwright install chromium
  npx --yes playwright screenshot --device="Desktop Chrome" "http://127.0.0.1:$Port/" $OutputImage

  Write-Host "[5/5] 완료" -ForegroundColor Green
  Write-Host "- GitHub Pages URL: $PageUrl"
  Write-Host "- 로컬 스크린샷: $OutputImage"
} finally {
  Stop-Job $serverJob -ErrorAction SilentlyContinue | Out-Null
  Remove-Job $serverJob -ErrorAction SilentlyContinue | Out-Null
}
