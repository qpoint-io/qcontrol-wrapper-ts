param(
  [ValidateSet("x64")]
  [string] $Architecture = "x64",
  [string] $QcontrolBinary = "bin\qcontrol.bin",
  [string] $OutputDirectory = "dist",
  [string] $InnoCompiler
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

function Get-WindowsInstallerVersion {
  $packageJsonPath = Join-Path $repoRoot "package.json"
  $packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
  $version = [string] $packageJson.version

  if ($version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$') {
    throw "package.json version '$version' is not compatible with Windows installer version metadata. Expected semver with major.minor.patch."
  }

  return "$($Matches[1]).$($Matches[2]).$($Matches[3])"
}

function Find-InnoCompiler {
  param([string] $ExplicitPath)

  if ($ExplicitPath) {
    if (Test-Path -LiteralPath $ExplicitPath -PathType Leaf) {
      return $ExplicitPath
    }

    throw "Inno Setup compiler was not found at $ExplicitPath"
  }

  if ($env:INNO_SETUP_COMPILER) {
    if (Test-Path -LiteralPath $env:INNO_SETUP_COMPILER -PathType Leaf) {
      return $env:INNO_SETUP_COMPILER
    }

    throw "INNO_SETUP_COMPILER points to a missing file: $env:INNO_SETUP_COMPILER"
  }

  $command = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidatePaths = @(
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:LocalAppData "Programs\Inno Setup 6\ISCC.exe")
  )

  foreach ($candidatePath in $candidatePaths) {
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
      return $candidatePath
    }
  }

  throw "Inno Setup 6 compiler was not found. Install it with: winget install --id JRSoftware.InnoSetup --source winget"
}

Push-Location $repoRoot
try {
  $qcontrolPath = Join-Path $repoRoot $QcontrolBinary
  if (-not (Test-Path -LiteralPath $qcontrolPath -PathType Leaf)) {
    throw @"
Missing $QcontrolBinary.
Windows qcontrol builds are not published yet. Copy the built qcontrol binary to bin\qcontrol.bin.
"@
  }

  $productVersion = Get-WindowsInstallerVersion
  $qctlExePath = Join-Path $repoRoot "bin\qctl.exe"
  $issPath = Join-Path $repoRoot "packaging\windows\qctl.iss"
  $distPath = Join-Path $repoRoot $OutputDirectory
  $outputBaseName = "qctl-$productVersion-windows-$Architecture-setup"
  $setupPath = Join-Path $distPath "$outputBaseName.exe"
  $compilerPath = Find-InnoCompiler $InnoCompiler

  Remove-Item -LiteralPath $setupPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path $qctlExePath), $distPath | Out-Null

  Invoke-CheckedCommand "bun" @("run", "build:win")

  if (-not (Test-Path -LiteralPath $qctlExePath -PathType Leaf)) {
    throw "Expected compiled wrapper at $qctlExePath"
  }

  Invoke-CheckedCommand $compilerPath @(
    "/Qp",
    "/O$distPath",
    "/F$outputBaseName",
    "/DAppVersion=$productVersion",
    "/DQctlExePath=$qctlExePath",
    $issPath
  )

  if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    throw "Expected installer at $setupPath"
  }

  Write-Host "Built $setupPath"
} finally {
  Pop-Location
}
