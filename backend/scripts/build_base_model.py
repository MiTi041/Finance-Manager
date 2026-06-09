#!/usr/bin/env python3
"""
Trainiert das statische Basis-Modell aus allen kategorisierten Transaktionen
in der lokalen Datenbank und speichert es als models/auto_categorize_model.pkl.

Einmal ausführen nach dem Kategorisieren von Transaktionen, um das
ausgelieferte Basis-Modell zu aktualisieren:
    python -m backend.scripts.build_base_model
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from finance_server.services.auto_categorize.base_categorize import (
    _build_base_model,
    _save_base_model,
)


def main() -> None:
    print("Trainiere Basis-Modell aus kategorisierten Transaktionen…")
    model = _build_base_model()
    if model is None:
        print("Keine kategorisierten Transaktionen gefunden. Modell wird nicht erstellt.")
        sys.exit(1)

    _save_base_model(model)
    print(f"Basis-Modell gespeichert: {len(model.get('labels', []))} Labels")


if __name__ == "__main__":
    main()
