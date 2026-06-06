from __future__ import annotations

import re
from pathlib import Path as FilePath
from urllib.parse import unquote, urlparse

PAYMENT_PARTNER_LOGO_DIR = (
    FilePath(__file__).resolve().parents[2]
    / "assets"
    / "images"
    / "payment-partner-logos"
)


def _safe_logo_name(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized or "kontoinhaber"


def _resolve_assets_logo_path(logo_path: str | None) -> FilePath | None:
    candidate = (logo_path or "").strip()
    if not candidate.startswith("/assets/images/payment-partner-logos/"):
        return None

    file_name = FilePath(candidate).name
    if not file_name:
        return None

    path = (PAYMENT_PARTNER_LOGO_DIR / file_name).resolve()
    if PAYMENT_PARTNER_LOGO_DIR.resolve() not in path.parents:
        return None

    return path


def _resolve_kontoinhaber_logo_file(logo_url: str) -> FilePath | None:
    candidate = (logo_url or "").strip()
    if not candidate:
        return None

    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https", "data"}:
        return None

    if parsed.scheme == "file":
        path = FilePath(unquote(parsed.path or ""))
    else:
        path = FilePath(candidate).expanduser()

    if not path.is_absolute():
        path = (FilePath.cwd() / path).resolve()

    if not path.exists() or not path.is_file():
        return None

    return path


IMAGE_FORMATS: dict[str, tuple[bytes, str]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
    "image/webp": (b"RIFF", ".webp"),
    "image/gif": (b"GIF8", ".gif"),
    "image/avif": (b"\x00\x00\x00\x20ftyp", ".avif"),
    "image/bmp": (b"BM", ".bmp"),
}
