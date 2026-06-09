from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from pathlib import Path

from finance_server.core.database import get_connection, reset_connection_state
from finance_server.core.paths import get_db_path


class ExportImportService:
    MODELS_DIR = Path(__file__).resolve().parent.parent / "ml_models"

    def _get_state_dir(self) -> Path:
        return get_db_path().parent

    def build_export_zip(self) -> io.BytesIO:
        state_dir = self._get_state_dir()
        if not state_dir.is_dir():
            raise ValueError("State-Ordner nicht gefunden")

        db_path = get_db_path()
        if not db_path.exists():
            raise ValueError("Datenbank nicht gefunden")

        try:
            conn = get_connection()
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:
            pass

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in state_dir.iterdir():
                if entry.is_file():
                    zf.write(entry, f"state/{entry.name}")

            if self.MODELS_DIR.is_dir():
                for entry in self.MODELS_DIR.iterdir():
                    if entry.is_file() and entry.name != ".gitkeep":
                        zf.write(entry, f"models/{entry.name}")

        buf.seek(0)
        return buf

    def import_from_zip(self, content: bytes, filename: str) -> dict[str, str]:
        if not filename or not filename.lower().endswith(".zip"):
            raise ValueError("Nur .zip Dateien werden unterstützt")

        state_dir = self._get_state_dir()

        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            bad_file = zf.testzip()
            if bad_file:
                raise ValueError(f"Zip-Datei ist beschädigt: {bad_file}")

            names = zf.namelist()
            has_db = any(n.lower().endswith(".db") for n in names)
            if not has_db:
                raise ValueError("Die Zip-Datei muss eine .db Datei enthalten")

            try:
                conn = get_connection()
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except Exception:
                pass

            if state_dir.is_dir():
                for entry in state_dir.iterdir():
                    if entry.is_file():
                        entry.unlink(missing_ok=True)

            state_dir.mkdir(parents=True, exist_ok=True)
            self.MODELS_DIR.mkdir(parents=True, exist_ok=True)

            with tempfile.TemporaryDirectory() as tmp_dir:
                zf.extractall(tmp_dir)
                tmp_root = Path(tmp_dir)

                state_src = tmp_root / "state"
                if state_src.is_dir():
                    for entry in state_src.iterdir():
                        if entry.is_file():
                            shutil.copy2(entry, state_dir / entry.name)

                models_src = tmp_root / "models"
                if models_src.is_dir():
                    for entry in models_src.iterdir():
                        if entry.is_file():
                            shutil.copy2(entry, self.MODELS_DIR / entry.name)

        reset_connection_state()
        get_connection()

        return {"message": "Datenbank erfolgreich importiert"}
