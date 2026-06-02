#!/usr/bin/env python3
"""Simple script to collect payment-partner-logos from client/public
folders across the repository and copy them into the server assets
folder (`server/finance_server/assets/images/payment-partner-logos`).

Usage:
  python scripts/sync_payment_partner_logos.py [--src DIR]... [--dry-run]

If no --src is given the script will search the repository for directories
named `payment-partner-logos` and copy files from them.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
import sys


def find_candidate_dirs(repo_root: Path) -> list[Path]:
    matches = []
    for p in repo_root.rglob('payment-partner-logos'):
        if p.is_dir():
            matches.append(p)
    return matches


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', action='append', help='Source directory to copy from')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be copied')
    args = parser.parse_args(argv)

    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[3]  # ../../.. -> project root
    target_dir = script_path.parents[1] / 'assets' / 'images' / 'payment-partner-logos'
    target_dir.mkdir(parents=True, exist_ok=True)

    sources: list[Path] = []
    if args.src:
        for s in args.src:
            sources.append(Path(s).expanduser().resolve())
    else:
        sources = find_candidate_dirs(repo_root)

    if not sources:
        print('No source directories found. Try passing --src or ensure there are folders named payment-partner-logos.')
        return 2

    copied = 0
    for src in sources:
        if not src.exists() or not src.is_dir():
            print(f'Skipping missing source: {src}')
            continue
        for f in sorted(src.iterdir()):
            if not f.is_file():
                continue
            dest = target_dir / f.name
            if args.dry_run:
                print(f'DRY RUN: {f} -> {dest}')
            else:
                shutil.copy2(f, dest)
                print(f'Copied: {f} -> {dest}')
            copied += 1

    print(f'Processed {len(sources)} source dirs, copied {copied} files to {target_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
