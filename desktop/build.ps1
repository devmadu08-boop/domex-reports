param([string]$ElectronZipDirectory = "")
$ErrorActionPreference = "Stop"
$runtimeZip = if ($ElectronZipDirectory) { (Resolve-Path -LiteralPath $ElectronZipDirectory).Path } else { "" }
Push-Location $PSScriptRoot
try {
    $outputRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "dist-electron"))
    if (-not $outputRoot.StartsWith($PSScriptRoot + [IO.Path]::DirectorySeparatorChar)) { throw "Invalid desktop output directory." }
    $packagerArgs = @("electron", "DOMEX Workspace", "--platform=win32", "--arch=x64", "--out=$outputRoot", "--overwrite", "--asar", "--icon=assets/domex.ico")
    if ($runtimeZip) { $packagerArgs += "--electron-zip-dir=$runtimeZip" }
    & "electron/node_modules/.bin/electron-packager.cmd" @packagerArgs
    if ($LASTEXITCODE -ne 0) { throw "Desktop packaging failed." }
    & "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" setup.iss
    if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed." }
} finally { Pop-Location }
