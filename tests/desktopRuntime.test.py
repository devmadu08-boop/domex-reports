"""Run with desktop/.venv311/Scripts/python.exe tests/desktopRuntime.test.py."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("domex_desktop", ROOT / "desktop/main.py")
desktop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desktop)

class DesktopRuntimeTests(unittest.TestCase):
    def test_profile_is_exclusive_between_processes_and_released_on_exit(self):
        with tempfile.TemporaryDirectory() as folder:
            lease = desktop.ProfileLease(Path(folder))
            child = "import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from main import ProfileLease;ProfileLease(Path(sys.argv[2]))"
            args = [sys.executable, "-c", child, str(ROOT / "desktop"), folder]
            try:
                blocked = subprocess.run(args, capture_output=True, text=True, timeout=15)
                self.assertNotEqual(blocked.returncode, 0)
                self.assertIn("already open", blocked.stderr)
            finally:
                lease.close()
            self.assertEqual(subprocess.run(args, capture_output=True, timeout=15).returncode, 0)

    def test_native_excel_export_remains_functional_and_rejects_other_origins(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "meter.xlsx"
            class Window:
                def get_current_url(self): return desktop.PORTAL
                def create_file_dialog(self, *args, **kwargs): return [str(target)]
            api = desktop.DesktopAPI()
            api._window = Window()
            api.export_sheet([["DOMEX"], ["Date", "KM"], ["=FORMULA", 50]])
            book = load_workbook(target)
            self.assertEqual(book.active["A3"].value, "'=FORMULA")
            self.assertEqual(book.active["B3"].value, 50)
            self.assertTrue(book.active["A1"].font.bold)
            book.close()
            api._window.get_current_url = lambda: "https://example.com/"
            with self.assertRaises(ValueError): api.export_sheet([])

if __name__ == "__main__":
    unittest.main()
