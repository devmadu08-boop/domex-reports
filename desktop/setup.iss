[Setup]
AppId={{BF08E53F-E371-43EC-A7C2-4C5161A44B17}
AppName=DOMEX Workspace
AppVersion=1.0.2
AppPublisher=DOMEX Report System
DefaultDirName={localappdata}\Programs\DOMEX Workspace
DefaultGroupName=DOMEX Workspace
PrivilegesRequired=lowest
OutputDir=release
OutputBaseFilename=DOMEX_Workspace_Setup_1.0.2
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=assets\domex.ico
UninstallDisplayIcon={app}\DOMEX Workspace.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
[Files]
Source: "dist-electron\DOMEX Workspace-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\DOMEX Workspace"; Filename: "{app}\DOMEX Workspace.exe"
Name: "{group}\DOMEX Meter and Fuel"; Filename: "{app}\DOMEX Workspace.exe"; Parameters: "--meter"
Name: "{autodesktop}\DOMEX Workspace"; Filename: "{app}\DOMEX Workspace.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\DOMEX Workspace.exe"; Description: "Launch DOMEX Workspace"; Flags: nowait postinstall skipifsilent runasoriginaluser
