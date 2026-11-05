# DOMEX Workspace for Windows

Version 1.0.2 uses an Electron/Chromium window, replacing the Python/.NET WebView wrapper after unresponsive input was reported in the installed application. Windows controls run in the native desktop runtime; Excel exports use asynchronous IPC and ExcelJS. The full live report portal and the VPS Meter & Fuel workspace use the same shared data as the browser. Internet access is required.

Sign in with the existing report login, then use the separate meter account under Courier > Meter & Fuel. The new desktop browser profile is separate from the earlier WebView2 profile, which is preserved. Server data and logins are unchanged. Profiles and private diagnostics live under %APPDATA%/DOMEX Workspace Desktop; uninstall preserves them. A second launch brings the existing window forward.

Build with Node.js and Inno Setup 6:

    npm ci --prefix desktop/electron
    ./desktop/build.ps1

The resulting installer is desktop/release/DOMEX_Workspace_Setup_1.0.2.exe. Chromium is included; Python, .NET and WebView2 are not required. The renderer has context isolation and sandboxing enabled, Node disabled, and only a small validated IPC bridge for Excel export. The installer contains no customer data or server credentials.

Validation:

    node --test tests/desktopWorkbook.test.mjs
    "desktop/dist-electron/DOMEX Workspace-win32-x64/DOMEX Workspace.exe" --smoke-test
    "desktop/dist-electron/DOMEX Workspace-win32-x64/DOMEX Workspace.exe" --interaction-test

Smoke mode uses an isolated profile, waits after live portal loading, verifies minimize/maximize/restore and the export bridge, writes SmokeTest/smoke-result.json, and closes. Interaction mode uses a local fixture to verify actual typing, clicks, native bridge and window controls without touching customer data.
