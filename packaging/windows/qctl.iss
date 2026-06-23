#define AppName "qctl"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef QctlExePath
  #define QctlExePath "..\..\bin\qctl.exe"
#endif
#ifndef QctlServiceExePath
  #define QctlServiceExePath "..\..\bin\qctl-service.exe"
#endif

[Setup]
AppId={{C2EE0688-5F8A-451F-8686-84E96738CD42}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Qpoint
AppPublisherURL=https://qpoint.io/
AppSupportURL=https://qpoint.io/
AppUpdatesURL=https://qpoint.io/
DefaultDirName={autopf}\qctl
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=qctl-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=admin
UninstallDisplayName=qctl
UninstallDisplayIcon={app}\qctl.exe
VersionInfoCompany=Qpoint
VersionInfoDescription=qctl Setup
VersionInfoProductName=qctl
VersionInfoProductVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
ChangesEnvironment=yes
SetupLogging=yes

[Files]
Source: "{#QctlExePath}"; DestDir: "{app}"; DestName: "qctl.exe"; Flags: ignoreversion
Source: "{#QctlServiceExePath}"; DestDir: "{app}"; DestName: "qctl-service.exe"; Flags: ignoreversion

[Run]
Filename: "{app}\qctl.exe"; Parameters: "install-system"; Flags: runhidden waituntilterminated
Filename: "{app}\qctl.exe"; Parameters: "start"; Flags: runhidden waituntilterminated; Check: ShouldRestartService

[UninstallRun]
Filename: "{app}\qctl.exe"; Parameters: "uninstall-system"; Flags: runhidden waituntilterminated

[Code]
const
  EnvironmentKey = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';

var
  RestartServiceAfterInstall: Boolean;

function StripTrailingBackslash(Value: String): String;
begin
  Result := Value;
  while (Length(Result) > 3) and (Copy(Result, Length(Result), 1) = '\') do
  begin
    Delete(Result, Length(Result), 1);
  end;
end;

function NormalizePathEntry(Value: String): String;
begin
  Result := Lowercase(StripTrailingBackslash(Trim(Value)));
end;

function PopPathEntry(var Value: String): String;
var
  Separator: Integer;
begin
  Separator := Pos(';', Value);
  if Separator = 0 then
  begin
    Result := Trim(Value);
    Value := '';
  end
  else
  begin
    Result := Trim(Copy(Value, 1, Separator - 1));
    Delete(Value, 1, Separator);
  end;
end;

function PathContainsEntry(ExistingPath: String; Target: String): Boolean;
var
  Entry: String;
  NormalizedTarget: String;
begin
  Result := False;
  NormalizedTarget := NormalizePathEntry(Target);

  while ExistingPath <> '' do
  begin
    Entry := PopPathEntry(ExistingPath);
    if NormalizePathEntry(Entry) = NormalizedTarget then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function RemovePathEntry(ExistingPath: String; Target: String): String;
var
  Entry: String;
  NormalizedTarget: String;
begin
  Result := '';
  NormalizedTarget := NormalizePathEntry(Target);

  while ExistingPath <> '' do
  begin
    Entry := PopPathEntry(ExistingPath);
    if (Entry <> '') and (NormalizePathEntry(Entry) <> NormalizedTarget) then
    begin
      if Result = '' then
      begin
        Result := Entry;
      end
      else
      begin
        Result := Result + ';' + Entry;
      end;
    end;
  end;
end;

procedure AddInstallDirToPath;
var
  ExistingPath: String;
  InstallDir: String;
begin
  InstallDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKLM, EnvironmentKey, 'Path', ExistingPath) then
  begin
    ExistingPath := '';
  end;

  if not PathContainsEntry(ExistingPath, InstallDir) then
  begin
    if ExistingPath = '' then
    begin
      RegWriteExpandStringValue(HKLM, EnvironmentKey, 'Path', InstallDir);
    end
    else
    begin
      RegWriteExpandStringValue(HKLM, EnvironmentKey, 'Path', ExistingPath + ';' + InstallDir);
    end;
  end;
end;

procedure RemoveInstallDirFromPath;
var
  ExistingPath: String;
  UpdatedPath: String;
begin
  if RegQueryStringValue(HKLM, EnvironmentKey, 'Path', ExistingPath) then
  begin
    UpdatedPath := RemovePathEntry(ExistingPath, ExpandConstant('{app}'));
    if UpdatedPath <> ExistingPath then
    begin
      RegWriteExpandStringValue(HKLM, EnvironmentKey, 'Path', UpdatedPath);
    end;
  end;
end;

function ShouldRestartService: Boolean;
begin
  Result := RestartServiceAfterInstall;
end;

function ExistingServiceIsRunning: Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec(ExpandConstant('{cmd}'), '/C sc.exe query qctl | find "RUNNING" >NUL', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := ResultCode = 0;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    AddInstallDirToPath();
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  QctlPath: String;
  ResultCode: Integer;
begin
  Result := '';
  QctlPath := ExpandConstant('{app}\qctl.exe');
  RestartServiceAfterInstall := False;

  if FileExists(QctlPath) then
  begin
    RestartServiceAfterInstall := ExistingServiceIsRunning();
    if Exec(QctlPath, 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Log(Format('Existing qctl stop exited with code %d.', [ResultCode]));
      if ResultCode <> 0 then
      begin
        Result := Format('Existing qctl service could not be stopped. qctl stop exited with code %d.', [ResultCode]);
      end;
    end
    else
    begin
      Log('Existing qctl stop command could not be started.');
      Result := 'Existing qctl service could not be stopped because qctl stop could not be started.';
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RemoveInstallDirFromPath();
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption :=
      'Run qctl init-user as each user who should send qcontrol events to qctl.';
  end;
end;
