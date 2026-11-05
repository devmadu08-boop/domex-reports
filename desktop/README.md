# DOMEX Workspace for Windows

This Windows application opens the full live DOMEX report portal in a native Edge WebView2 window. The integrated Meter & Fuel workspace uses the VPS SQLite database. Existing report sections continue using their existing shared report sync. Internet access is required; unsaved meter entries have per-user local recovery drafts.

Install Microsoft Edge WebView2 Runtime if Windows does not already have it. Sign in to the report portal normally, then use your separate meter account for Meter & Fuel. Desktop Excel exports produce real XLSX files; the browser also offers Excel-compatible CSV.

Build from this folder with Python 3.11 and Inno Setup 6:

    py -3.11 -m venv .venv311
    .venv311/Scripts/pip install -r requirements.txt
    .venv311/Scripts/pyinstaller --noconfirm --windowed --name "DOMEX Workspace" --icon assets/domex.ico --distpath dist --workpath build main.py
    "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" setup.iss

The installer does not contain server passwords, SSH keys, or customer data. Profiles are stored under the user's Local AppData/DOMEX Workspace directory. Uninstall preserves this profile.

Version 1.0.1 serializes access to the persistent browser profile and exposes only the Excel callable to JavaScript. Startup tests use separate profiles, wait after rendering, and exercise native maximize/restore dispatch. Use `--interaction-test` for the isolated typing/click/native bridge/window-control check. Runtime errors are recorded in rotating `desktop.log` files under Local AppData/DOMEX Workspace.
