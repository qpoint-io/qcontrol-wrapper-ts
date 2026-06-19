param(
  [string] $MsiPath,
  [string] $ExpectedVersion,
  [switch] $SkipWixValidation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Get-PackageVersion {
  $packageJson = Get-Content -Raw (Join-Path $repoRoot "package.json") | ConvertFrom-Json
  $version = [string] $packageJson.version

  if ($version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$') {
    throw "package.json version '$version' is not compatible with MSI. Expected semver with major.minor.patch."
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

function Invoke-ComMethod {
  param(
    [Parameter(Mandatory = $true)]
    [object] $Object,
    [Parameter(Mandatory = $true)]
    [string] $Method,
    [object[]] $Arguments = @()
  )

  return $Object.GetType().InvokeMember($Method, "InvokeMethod", $null, $Object, $Arguments)
}

function Get-ComProperty {
  param(
    [Parameter(Mandatory = $true)]
    [object] $Object,
    [Parameter(Mandatory = $true)]
    [string] $Property,
    [object[]] $Arguments = @()
  )

  return $Object.GetType().InvokeMember($Property, "GetProperty", $null, $Object, $Arguments)
}

function Get-MsiRows {
  param(
    [Parameter(Mandatory = $true)]
    [object] $Database,
    [Parameter(Mandatory = $true)]
    [string] $Sql,
    [Parameter(Mandatory = $true)]
    [int] $ColumnCount
  )

  $view = Invoke-ComMethod $Database "OpenView" @($Sql)
  try {
    Invoke-ComMethod $view "Execute" @() | Out-Null
    $rows = @()

    while ($true) {
      $record = Invoke-ComMethod $view "Fetch" @()
      if ($null -eq $record) {
        break
      }

      $row = @()
      for ($index = 1; $index -le $ColumnCount; $index += 1) {
        $row += [string] (Get-ComProperty $record "StringData" @($index))
      }
      $rows += ,$row
    }

    return ,$rows
  } finally {
    Invoke-ComMethod $view "Close" @() | Out-Null
  }
}

function Get-MsiProperty {
  param(
    [Parameter(Mandatory = $true)]
    [object] $Database,
    [Parameter(Mandatory = $true)]
    [string] $Name
  )

  $rows = Get-MsiRows $Database "SELECT Value FROM Property WHERE Property = '$Name'" 1
  if ($rows.Count -eq 0) {
    throw "MSI property '$Name' was not found"
  }

  return $rows[0][0]
}

$ExpectedVersion = if ($ExpectedVersion) { $ExpectedVersion } else { Get-PackageVersion }
$MsiPath = if ($MsiPath) {
  $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($MsiPath)
} else {
  Join-Path $repoRoot "dist\qctl-$ExpectedVersion-windows-x64.msi"
}

Assert-True "MSI was not found at $MsiPath" (Test-Path -LiteralPath $MsiPath -PathType Leaf)

$installer = New-Object -ComObject WindowsInstaller.Installer
$database = Invoke-ComMethod $installer "OpenDatabase" @($MsiPath, 0)

Assert-Equal "ProductName" (Get-MsiProperty $database "ProductName") "qctl"
Assert-Equal "Manufacturer" (Get-MsiProperty $database "Manufacturer") "Qpoint"
Assert-Equal "ProductVersion" (Get-MsiProperty $database "ProductVersion") $ExpectedVersion
Assert-Equal "UpgradeCode" (Get-MsiProperty $database "UpgradeCode") "{C2EE0688-5F8A-451F-8686-84E96738CD42}"
Assert-Equal "WIXUI_EXITDIALOGOPTIONALTEXT" `
  (Get-MsiProperty $database "WIXUI_EXITDIALOGOPTIONALTEXT") `
  "Run qctl init-user as each user who should send qcontrol events to qctl."

$directories = Get-MsiRows $database "SELECT Directory, DefaultDir FROM Directory" 2
$installFolder = $directories | Where-Object { $_[0] -eq "INSTALLFOLDER" } | Select-Object -First 1
Assert-True "MSI is missing INSTALLFOLDER directory" ($null -ne $installFolder)
Assert-Equal "INSTALLFOLDER name" (($installFolder[1] -split "\|")[-1]) "qctl"

$dialogs = Get-MsiRows $database "SELECT Dialog FROM Dialog" 1
$dialogNames = $dialogs | ForEach-Object { $_[0] }
Assert-True "MSI is missing the completion dialog" ($dialogNames -contains "ExitDialog")
Assert-True "MSI must not include a placeholder license dialog" (-not ($dialogNames -contains "WelcomeEulaDlg"))

$components = Get-MsiRows $database "SELECT Component, Directory_ FROM Component" 2
$qctlComponent = $components | Where-Object { $_[0] -eq "QctlExecutable" } | Select-Object -First 1
Assert-True "MSI is missing QctlExecutable component" ($null -ne $qctlComponent)
Assert-Equal "QctlExecutable directory" $qctlComponent[1] "INSTALLFOLDER"

$files = Get-MsiRows $database "SELECT FileName FROM File" 1
$fileNames = $files | ForEach-Object { (($_[0] -split "\|")[-1]).ToLowerInvariant() }
Assert-True "MSI payload is missing qctl.exe" ($fileNames -contains "qctl.exe")
Assert-True "MSI must not install qcontrol.bin separately" (-not ($fileNames -contains "qcontrol.bin"))
Assert-True "MSI must not install qcontrol.exe separately" (-not ($fileNames -contains "qcontrol.exe"))

$environments = Get-MsiRows $database "SELECT Name, Value FROM Environment" 2
$pathEntry = $environments | Where-Object {
  $_[0] -match "PATH" -and $_[1] -match "INSTALLFOLDER"
} | Select-Object -First 1
Assert-True "MSI is missing a system PATH entry for INSTALLFOLDER" ($null -ne $pathEntry)

if (-not $SkipWixValidation) {
  if (Get-Command "dotnet" -ErrorAction SilentlyContinue) {
    & dotnet tool run wix -- msi validate $MsiPath
    if ($LASTEXITCODE -ne 0) {
      throw "wix msi validate exited with code $LASTEXITCODE"
    }
  } else {
    Write-Warning "Skipping WiX MSI validation because dotnet is unavailable."
  }
}

Write-Host "Verified $MsiPath"
