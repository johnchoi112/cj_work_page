param(
  [string]$CommitMessage = "update dashboard",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..")

git add .
$hasChanges = git diff --cached --name-only
if ($hasChanges) { git commit -m $CommitMessage }
git push origin $Branch

Write-Host "완료: https://johnchoi112.github.io/cj_work_page/"
