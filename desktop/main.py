"""DOMEX Workspace — native Windows host for the shared DOMEX portal."""
import argparse
import os
import sys
import logging
from pathlib import Path
from urllib.parse import urlparse
import webview
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

PORTAL = "https://bot.domex.work.gd/"
VERSION = "1.0.1"

class ProfileLease:
    """Keep only one GUI process on a persistent WebView2 profile."""
    def __init__(self, directory):
        self._file = open(directory / "workspace.lock", "a+b")
        if os.fstat(self._file.fileno()).st_size == 0:
            self._file.write(b"0")
            self._file.flush()
        self._file.seek(0)
        try:
            import msvcrt
            msvcrt.locking(self._file.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            self._file.close()
            raise RuntimeError("DOMEX Workspace is already open. Close the existing window before opening another copy. If the old window does not respond, restart Windows once, then open DOMEX Workspace normally.")

    def close(self):
        self._file.close()

class DesktopAPI:
    def __init__(self):
        self._window = None

    def export_sheet(self, rows, filename="DOMEX_Meter.xlsx"):
        if not self._window or urlparse(self._window.get_current_url() or "").hostname not in ("bot.domex.work.gd", "127.0.0.1", "localhost"):
            raise ValueError("Excel export is available only in the DOMEX workspace.")
        if not isinstance(rows, list) or len(rows) > 10000 or any(not isinstance(row, list) or len(row) > 50 for row in rows):
            raise ValueError("Invalid workbook data.")
        chosen = self._window.create_file_dialog(webview.FileDialog.SAVE, save_filename=Path(filename).name, file_types=("Excel workbook (*.xlsx)",))
        if not chosen:
            return {"message": "Export cancelled."}
        target = Path(chosen[0]).with_suffix(".xlsx")
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "DOMEX Running Chart"
        for row in rows:
            safe = []
            for cell in row:
                value = cell if isinstance(cell, (str, int, float)) else str(cell or "")
                if isinstance(value, str):
                    value = value[:16000]
                    if value.startswith(("=", "+", "-", "@")):
                        value = "'" + value
                safe.append(value)
            sheet.append(safe)
        sheet.freeze_panes = "C3"
        sheet.auto_filter.ref = sheet.dimensions
        for row in sheet:
            for cell in row:
                cell.alignment = Alignment(vertical="center", wrap_text=True)
                if cell.row <= 2:
                    cell.fill = PatternFill("solid", fgColor="7C1026")
                    cell.font = Font(color="FFFFFF", bold=True)
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(45, max(14, max(len(str(c.value or "")) for c in column) + 2))
        workbook.save(target)
        return {"message": "Excel workbook saved: " + target.name}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--meter", action="store_true")
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument("--interaction-test", action="store_true")
    args = parser.parse_args()
    data = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "DOMEX Workspace"
    data.mkdir(parents=True, exist_ok=True)
    if args.smoke_test or args.interaction_test:
        # Tests must never share the user's live profile or session.
        data = data / ("SmokeTest" if args.smoke_test else "InteractionTest")
        data.mkdir(parents=True, exist_ok=True)
    from logging.handlers import RotatingFileHandler
    logging.basicConfig(level=logging.WARNING, handlers=[RotatingFileHandler(data / "desktop.log", maxBytes=1000000, backupCount=2, encoding="utf-8")])
    lease = ProfileLease(data)
    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["ALLOW_FILE_URLS"] = False
    api = DesktopAPI()
    test_html = """<html><body style="font:20px Arial;background:#fbf5ec;color:#7c1026;padding:40px"><h1>DOMEX interaction check</h1><label>Test text <input id="text" aria-label="Test text"></label><button onclick="document.getElementById('result').textContent='Clicked: '+document.getElementById('text').value">Test click</button><p id="result">Waiting for click</p><p id="bridge">Waiting for bridge</p><script>addEventListener('pywebviewready',()=>{pywebview.api.export_sheet([], 'test.xlsx').catch(()=>document.getElementById('bridge').textContent='Native bridge responsive')})</script></body></html>"""
    api._window = webview.create_window("DOMEX interaction check" if args.interaction_test else "DOMEX Workspace " + VERSION + " · Reports, Meter & Fuel", None if args.interaction_test else PORTAL + ("meter-workspace/" if args.meter else "dashboard/"),
                                      html=test_html if args.interaction_test else None, width=1440, height=960, min_size=(1000, 650), background_color="#fbf5ec", hidden=args.smoke_test)
    # Expose only the callable. Never traverse the native window or .NET object graph.
    api._window.expose(api.export_sheet)
    if args.smoke_test:
        import threading
        def check():
            try:
                if not api._window.events.loaded.wait(45):
                    import json
                    (data / "smoke-result.json").write_text(json.dumps({"error":"The portal did not finish loading within 45 seconds."}),encoding="utf-8")
                    return
                import time
                time.sleep(10)
                # Exercise native GUI dispatch after initial rendering, not just page loading.
                api._window.maximize()
                time.sleep(0.5)
                api._window.restore()
                result = {"url": api._window.get_current_url(), "title": api._window.evaluate_js("document.title"), "text": api._window.evaluate_js("document.body.innerText.length")}
                import json
                (data / "smoke-result.json").write_text(json.dumps(result), encoding="utf-8")
            finally:
                api._window.destroy()
        threading.Thread(target=check, daemon=True).start()
        def watchdog():
            import time
            time.sleep(75)
            os._exit(2)
        threading.Thread(target=watchdog, daemon=True).start()
    try:
        webview.start(gui="edgechromium", private_mode=False, storage_path=str(data / "WebViewProfile"), debug=False)
    finally:
        lease.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if "--smoke-test" in sys.argv:
            import json
            data = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "DOMEX Workspace"
            data.mkdir(parents=True, exist_ok=True)
            (data / "smoke-result.json").write_text(json.dumps({"error": str(exc)}), encoding="utf-8")
            sys.exit(1)
        from tkinter import Tk, messagebox
        root = Tk()
        root.withdraw()
        messagebox.showerror("DOMEX Workspace", "The desktop window could not start.\nEnsure Microsoft Edge WebView2 Runtime is installed.\n\n" + str(exc))
        root.destroy()
        sys.exit(1)
