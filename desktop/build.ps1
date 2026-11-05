$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    & ".venv311/Scripts/python.exe" -m PyInstaller --noconfirm --clean --windowed --name "DOMEX Workspace" --icon "assets/domex.ico" --distpath dist --workpath build main.py
    if ($LASTEXITCODE -ne 0) { throw "Desktop packaging failed." }
    & "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" setup.iss
    if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed." }
} finally { Pop-Location }
