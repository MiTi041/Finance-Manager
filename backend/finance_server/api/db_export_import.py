from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response

from finance_server.services.export_import_service import ExportImportService
from finance_server.api.deps import get_export_import_service

router = APIRouter(prefix="/api/db")

EXPORT_FILENAME = "finance-backup.zip"


@router.get("/export")
def export_database(
    service: ExportImportService = Depends(get_export_import_service),
):
    try:
        zip_buf = service.build_export_zip()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return Response(
        content=zip_buf.read(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{EXPORT_FILENAME}"',
        },
    )


@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    service: ExportImportService = Depends(get_export_import_service),
):
    content = await file.read()
    try:
        return service.import_from_zip(content, file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fehler beim Import: {e}")
