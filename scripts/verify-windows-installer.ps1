param(
  [string] $InstallerPath,
  [string] $ExpectedVersion,
  [switch] $LiveInstall,
  [string] $InstallDirectory = (Join-Path $env:TEMP "qctl-inno-verify")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Get-PackageVersion {
  $packageJson = Get-Content -Raw (Join-Path $repoRoot "package.json") | ConvertFrom-Json
  $version = [string] $packageJson.version

  if ($version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$') {
    throw "package.json version '$version' is not compatible with Windows installer version metadata. Expected semver with major.minor.patch."
  }

  return "$($Matches[1]).$($Matches[2]).$($Matches[3])"
}

function Assert-Equal {
  param(
    [string] $Name,
    [string] $Actual,
    [string] $Expected
  )

  if ($Actual -ne $Expected) {
    throw "$Name mismatch: got '$Actual', expected '$Expected'"
  }
}

function Assert-True {
  param(
    [string] $Message,
    [bool] $Condition
  )

  if (-not $Condition) {
    throw $Message
  }
}

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

function Invoke-QctlVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string] $QctlPath,
    [Parameter(Mandatory = $true)]
    [string] $CacheDirectory
  )

  Remove-Item -LiteralPath $CacheDirectory -Recurse -Force -ErrorAction SilentlyContinue
  $previousCache = $env:QCONTROL_WRAPPER_CACHE_DIR
  try {
    $env:QCONTROL_WRAPPER_CACHE_DIR = $CacheDirectory
    & $QctlPath --version | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "$QctlPath --version exited with code $LASTEXITCODE"
    }
  } finally {
    $env:QCONTROL_WRAPPER_CACHE_DIR = $previousCache
  }
}

$ExpectedVersion = if ($ExpectedVersion) { $ExpectedVersion } else { Get-PackageVersion }
$InstallerPath = if ($InstallerPath) {
  $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($InstallerPath)
} else {
  Join-Path $repoRoot "dist\qctl-$ExpectedVersion-windows-x64-setup.exe"
}

Assert-True "Windows installer was not found at $InstallerPath" (Test-Path -LiteralPath $InstallerPath -PathType Leaf)

$versionInfo = (Get-Item -LiteralPath $InstallerPath).VersionInfo
Assert-Equal "ProductName" ([string] $versionInfo.ProductName).Trim() "qctl"
Assert-Equal "CompanyName" ([string] $versionInfo.CompanyName).Trim() "Qpoint"
Assert-Equal "ProductVersion" ([string] $versionInfo.ProductVersion).Trim() $ExpectedVersion

$issPath = Join-Path $repoRoot "packaging\windows\qctl.iss"
$iss = Get-Content -Raw $issPath
Assert-True "Installer script must install under Program Files" ($iss -match 'DefaultDirName=\{autopf\}\\qctl')
Assert-True "Installer script must require admin for per-machine install" ($iss -match 'PrivilegesRequired=admin')
Assert-True "Installer script must notify Windows about environment changes" ($iss -match 'ChangesEnvironment=yes')
Assert-True "Installer script must add the install directory to PATH" ($iss -match 'AddInstallDirToPath')
Assert-True "Installer script must remove the install directory from PATH" ($iss -match 'RemoveInstallDirFromPath')
Assert-True "Installer script must show the init-user follow-up text" ($iss -match 'Run qctl init-user as each user who should send qcontrol events to qctl\.')

$qctlExePath = Join-Path $repoRoot "bin\qctl.exe"
Assert-True "Compiled qctl.exe was not found at $qctlExePath" (Test-Path -LiteralPath $qctlExePath -PathType Leaf)

Invoke-QctlVersion $qctlExePath (Join-Path $env:TEMP "qctl-inno-verify-cache-compiled")

if ($LiveInstall) {
  $installLog = Join-Path $repoRoot "dist\install-inno-verify.log"
  $uninstallLog = Join-Path $repoRoot "dist\uninstall-inno-verify.log"
  $installedQctl = Join-Path $InstallDirectory "qctl.exe"
  $uninstaller = Join-Path $InstallDirectory "unins000.exe"

  Remove-Item -LiteralPath $InstallDirectory -Recurse -Force -ErrorAction SilentlyContinue
  Invoke-CheckedCommand $InstallerPath @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/DIR=$InstallDirectory", "/LOG=$installLog")

  Assert-True "Live install did not produce $installedQctl" (Test-Path -LiteralPath $installedQctl -PathType Leaf)
  Invoke-QctlVersion $installedQctl (Join-Path $env:TEMP "qctl-inno-verify-cache-installed")

  Assert-True "Live install did not produce an uninstaller" (Test-Path -LiteralPath $uninstaller -PathType Leaf)
  Invoke-CheckedCommand $uninstaller @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/LOG=$uninstallLog")
  Assert-True "Live uninstall left qctl.exe behind at $installedQctl" (-not (Test-Path -LiteralPath $installedQctl))
}

Write-Host "Verified $InstallerPath"
