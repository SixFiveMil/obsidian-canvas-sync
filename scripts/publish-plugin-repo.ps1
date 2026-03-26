param(
  [string]$RemoteName = "obsidian-plugin",
  [string]$RemoteUrl = "",
  [string]$TargetBranch = "main",
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"

function Exec([string]$Command) {
  Write-Host "> $Command"
  iex $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE: $Command"
  }
}

$splitBranch = "plugin-release-tmp"

if (-not (Test-Path ".git")) {
  throw "Run this script from the repository root."
}

if ($RemoteUrl -ne "") {
  $existingRemote = git remote | Select-String -SimpleMatch $RemoteName
  if ($null -eq $existingRemote) {
    Exec "git remote add $RemoteName $RemoteUrl"
  } else {
    Exec "git remote set-url $RemoteName $RemoteUrl"
  }
}

$hasRemote = git remote | Select-String -SimpleMatch $RemoteName
if ($null -eq $hasRemote) {
  throw "Remote '$RemoteName' not found. Provide -RemoteUrl once to configure it."
}

$existingSplitBranch = git branch --list $splitBranch
if ($existingSplitBranch) {
  Exec "git branch -D $splitBranch"
}

Exec "git subtree split --prefix apps/obsidian-plugin --branch $splitBranch"
Exec "git push $RemoteName ${splitBranch}:${TargetBranch} --force"

if ($Tag -ne "") {
  $existingTag = git tag --list $Tag
  if ($existingTag) {
    Exec "git tag -d $Tag"
  }

  Exec "git tag $Tag $splitBranch"
  Exec "git push $RemoteName $Tag --force"
}

Exec "git branch -D $splitBranch"

Write-Host "Plugin-only repo sync complete."
