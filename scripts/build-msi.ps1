param(
  [ValidateSet("x64")]
  [string] $Architecture = "x64",
  [string] $QcontrolBinary = "bin\qcontrol.bin",
  [string] $OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Get-MsiProductVersion {
  $packageJsonPath = Join-Path $repoRoot "package.json"
  $packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
  $version = [string] $packageJson.version

  if ($version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$') {
    throw "package.json version '$version' is not compatible with MSI. Expected semver with major.minor.patch."
  }

  $parts = @([int] $Matches[1], [int] $Matches[2], [int] $Matches[3])
  foreach ($part in $parts) {
    if ($part -gt 65535) {
      throw "package.json version '$version' is not compatible with MSI. Version fields must be <= 65535."
    }
  }

  return "$($parts[0]).$($parts[1]).$($parts[2])"
}

Push-Location $repoRoot
try {
  $qcontrolPath = Join-Path $repoRoot $QcontrolBinary
  if (-not (Test-Path -LiteralPath $qcontrolPath -PathType Leaf)) {
    throw @"
Missing $QcontrolBinary.
Windows qcontrol builds are not published yet. Run:
Copy the built qcontrol binary to bin\qcontrol.bin.
"@
  }

  $productVersion = Get-MsiProductVersion
  $qctlExePath = Join-Path $repoRoot "bin\qctl.exe"
  $wxsPath = Join-Path $repoRoot "packaging\windows\qctl.wxs"
  $intermediatePath = Join-Path $repoRoot "build\wix"
  $distPath = Join-Path $repoRoot $OutputDirectory
  $msiPath = Join-Path $distPath "qctl-$productVersion-windows-$Architecture.msi"

  Remove-Item -LiteralPath $intermediatePath -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path $qctlExePath), $intermediatePath, $distPath | Out-Null

  Invoke-CheckedCommand "bun" @("run", "build:win")

  if (-not (Test-Path -LiteralPath $qctlExePath -PathType Leaf)) {
    throw "Expected compiled wrapper at $qctlExePath"
  }

  Invoke-CheckedCommand "dotnet" @("tool", "restore")
  Invoke-CheckedCommand "dotnet" @("tool", "run", "wix", "--", "extension", "add", "WixToolset.UI.wixext/5.0.2")
  Invoke-CheckedCommand "dotnet" @(
    "tool", "run", "wix", "--",
    "build",
    $wxsPath,
    "-arch", $Architecture,
    "-ext", "WixToolset.UI.wixext/5.0.2",
    "-define", "ProductVersion=$productVersion",
    "-define", "QctlExePath=$qctlExePath",
    "-intermediatefolder", $intermediatePath,
    "-out", $msiPath
  )

  Write-Host "Built $msiPath"
} finally {
  Pop-Location
}
