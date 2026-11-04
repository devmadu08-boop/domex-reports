"""DOMEX Workspace — native Windows host for the shared DOMEX portal."""
import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
import webview
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

PORTAL = "https://bot.domex.work.gd/"

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
    args = parser.parse_args()
    data = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "DOMEX Workspace"
    data.mkdir(parents=True, exist_ok=True)
    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["ALLOW_FILE_URLS"] = False
    api = DesktopAPI()
    api._window = webview.create_window("DOMEX Workspace · Reports, Meter & Fuel", PORTAL + ("meter-workspace/" if args.meter else "dashboard/"),
                                      width=1440, height=960, min_size=(1000, 650), js_api=api, background_color="#fbf5ec", hidden=args.smoke_test)
    if args.smoke_test:
        import threading
        def check():
            try:
                if not api._window.events.loaded.wait(45):
                    import json
                    (data / "smoke-result.json").write_text(json.dumps({"error":"The portal did not finish loading within 45 seconds."}),encoding="utf-8")
                    return
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
    webview.start(gui="edgechromium", private_mode=False, storage_path=str(data / "WebViewProfile"), debug=False)

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
