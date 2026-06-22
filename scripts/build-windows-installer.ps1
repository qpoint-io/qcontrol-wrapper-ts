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

function Save-QcontrolBinary {
  param(
    [Parameter(Mandatory = $true)]
    [string] $OutputPath,
    [Parameter(Mandatory = $true)]
    [string] $Architecture
  )

  $version = if ($env:VERSION) { $env:VERSION } else { "latest" }
  $url = "https://downloads.qpoint.io/qcontrol/qcontrol-$version-windows-$Architecture.tgz"
  $temporaryDirectory = New-Item -ItemType Directory -Path (Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString()))

  try {
    $archivePath = Join-Path $temporaryDirectory "qcontrol.tgz"
    Write-Host "Downloading qcontrol $version for windows/$Architecture"
    Invoke-CheckedCommand "curl.exe" @("-fsSL", $url, "-o", $archivePath)
    Invoke-CheckedCommand "tar.exe" @("-xzf", $archivePath, "-C", $temporaryDirectory)

    $downloadedBinary = Join-Path $temporaryDirectory "qcontrol.exe"
    if (-not (Test-Path -LiteralPath $downloadedBinary -PathType Leaf)) {
      throw "Downloaded qcontrol archive did not contain qcontrol.exe"
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
    Move-Item -LiteralPath $downloadedBinary -Destination $OutputPath -Force

    $qcontrolVersion = & $OutputPath --version
    Write-Host "Installed $qcontrolVersion at $OutputPath"
  } finally {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
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

function Find-CSharpCompiler {
  $candidatePaths = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
  )

  foreach ($candidatePath in $candidatePaths) {
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
      return $candidatePath
    }
  }

  $command = Get-Command "csc.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "C# compiler was not found. Install the .NET Framework developer tools or Visual Studio Build Tools."
}

Push-Location $repoRoot
try {
  $qcontrolPath = Join-Path $repoRoot $QcontrolBinary
  if (-not (Test-Path -LiteralPath $qcontrolPath -PathType Leaf)) {
    Save-QcontrolBinary -OutputPath $qcontrolPath -Architecture $Architecture
  }

  $productVersion = Get-WindowsInstallerVersion
  $qctlExePath = Join-Path $repoRoot "bin\qctl.exe"
  $qctlServiceExePath = Join-Path $repoRoot "bin\qctl-service.exe"
  $qctlServiceSourcePath = Join-Path $repoRoot "packaging\windows\QctlService.cs"
  $issPath = Join-Path $repoRoot "packaging\windows\qctl.iss"
  $distPath = Join-Path $repoRoot $OutputDirectory
  $outputBaseName = "qctl-$productVersion-windows-$Architecture-setup"
  $setupPath = Join-Path $distPath "$outputBaseName.exe"
  $compilerPath = Find-InnoCompiler $InnoCompiler
  $csharpCompilerPath = Find-CSharpCompiler

  Remove-Item -LiteralPath $setupPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path $qctlExePath), $distPath | Out-Null

  Invoke-CheckedCommand "bun" @("run", "build:win")
  Invoke-CheckedCommand $csharpCompilerPath @(
    "/nologo",
    "/target:exe",
    "/optimize+",
    "/reference:System.ServiceProcess.dll",
    "/out:$qctlServiceExePath",
    $qctlServiceSourcePath
  )

  if (-not (Test-Path -LiteralPath $qctlExePath -PathType Leaf)) {
    throw "Expected compiled wrapper at $qctlExePath"
  }

  if (-not (Test-Path -LiteralPath $qctlServiceExePath -PathType Leaf)) {
    throw "Expected compiled service host at $qctlServiceExePath"
  }

  Invoke-CheckedCommand $compilerPath @(
    "/Qp",
    "/O$distPath",
    "/F$outputBaseName",
    "/DAppVersion=$productVersion",
    "/DQctlExePath=$qctlExePath",
    "/DQctlServiceExePath=$qctlServiceExePath",
    $issPath
  )

  if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    throw "Expected installer at $setupPath"
  }

  Write-Host "Built $setupPath"
} finally {
  Pop-Location
}
