# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=[('.env', '.'), ('finance_server/assets', 'finance_server/assets')],
    hiddenimports=['finance_server', 'finance_server.api', 'finance_server.api.transactions', 'finance_server.api.fints', 'finance_server.api.bank_credentials', 'finance_server.api.reference_data', 'finance_server.api.categories', 'finance_server.db', 'finance_server.db.connection', 'finance_server.db.credentials', 'finance_server.db.paths', 'finance_server.db.references', 'finance_server.db.schema', 'finance_server.db.transactions', 'finance_server.db.categories', 'finance_server.db.utils', 'finance_server.banks', 'finance_server.models', 'uvicorn', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'fastapi', 'pydantic', 'dotenv', 'cryptography', 'cryptography.fernet', 'fints', 'fints.client', 'fints.exceptions', 'fints.utils', 'fints.formals'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='finance_server_bin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='finance_server_bin',
)
