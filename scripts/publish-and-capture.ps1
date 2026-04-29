param(
  [string]$CommitMessage = "update dashboard",
  [string]$Branch = "main",
  [int]$Port = 4173,
  [string]$OutputImage = "dashboard-latest.png"
)

$ErrorActionPreference = "Stop"

git add .
$changed = git diff --cached --name-only
if ($changed) { git commit -m $CommitMessage }
git push origin $Branch

python -m http.server $Port
