#!/usr/bin/env python3
"""Trim baked-in padding from payment partner logo images.

Many downloaded logos ship with a uniform white/black/transparent border baked
in. This crops that border so the logo content fills the frame. The frontend
already adds its own `p-1` when `logo_padding` is enabled, so by default only
partners with `logo_padding = 0` are trimmed.

Usage:
  python -m finance_server.scripts.trim_logo_padding [--all] [--dry-run]
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

import numpy as np
from PIL import Image

from finance_server.api.reference_data.common import PAYMENT_PARTNER_LOGO_DIR
from finance_server.core.paths import get_db_path

THRESHOLD = 24  # summed RGBA channel difference that counts as logo content
MIN_SAVING = 0.02  # skip if trimming removes less than 2% of a dimension
UNIFORMITY = 0.9  # required share of border pixels matching the dominant color


def background_color(arr: np.ndarray) -> np.ndarray | None:
    """Return the uniform border color, or None for gradient/photo backgrounds."""
    border = np.concatenate([arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]])
    values, counts = np.unique(border, axis=0, return_counts=True)
    dominant = values[counts.argmax()]
    if counts.max() < UNIFORMITY * len(border):
        return None
    return dominant


def content_bbox(arr: np.ndarray, bg: np.ndarray) -> tuple[int, int, int, int] | None:
    mask = np.abs(arr - bg).sum(axis=2) > THRESHOLD
    if bg[3] < 16:
        mask |= arr[:, :, 3] > 16
    ys, xs = np.where(mask)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def trim_file(path: Path, dry_run: bool) -> str:
    with Image.open(path) as img:
        img.load()
        w, h = img.size
        arr = np.asarray(img.convert("RGBA"), dtype=np.int16)
        bg = background_color(arr)
        if bg is None:
            return "skip (colored/gradient background)"
        bbox = content_bbox(arr, bg)
        if bbox is None:
            return "empty"
        left, top, right, bottom = bbox
        if (right - left) >= w * (1 - MIN_SAVING) and (bottom - top) >= h * (1 - MIN_SAVING):
            return "already tight"
        if dry_run:
            return f"would crop {w}x{h} -> {right - left}x{bottom - top}"
        cropped = img.crop(bbox)
        save_kwargs = {"quality": 95} if path.suffix.lower() in {".jpg", ".jpeg"} else {}
        cropped.save(path, **save_kwargs)
        return f"cropped {w}x{h} -> {cropped.size[0]}x{cropped.size[1]}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="trim every partner logo")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    con = sqlite3.connect(get_db_path())
    where = "1=1" if args.all else "logo_padding = 0"
    rows = con.execute(
        f"SELECT DISTINCT local_logo_path FROM zahlungspartner "
        f"WHERE {where} AND local_logo_path LIKE '/assets/images/payment-partner-logos/%'"
    ).fetchall()
    con.close()

    trimmed = 0
    for (logo_path,) in rows:
        path = PAYMENT_PARTNER_LOGO_DIR / Path(logo_path).name
        if not path.is_file():
            print(f"missing: {path.name}")
            continue
        result = trim_file(path, args.dry_run)
        if result.startswith(("cropped", "would")):
            trimmed += 1
        print(f"{path.name}: {result}")

    print(f"\n{trimmed}/{len(rows)} logos {'to trim' if args.dry_run else 'trimmed'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
