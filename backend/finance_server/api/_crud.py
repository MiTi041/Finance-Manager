from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def crud_create(
    create_fn: Callable[[dict[str, Any]], dict[str, Any]],
    payload: dict[str, Any],
) -> dict[str, Any]:
    try:
        return create_fn(payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


def crud_update(
    update_fn: Callable[[int, dict[str, Any]], dict[str, Any] | None],
    entity_id: int,
    payload: dict[str, Any],
    entity_name: str,
    detail_not_found: str | None = None,
) -> dict[str, Any]:
    try:
        result = update_fn(entity_id, payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=detail_not_found or f"{entity_name} nicht gefunden",
        )

    return result


def crud_delete(
    delete_fn: Callable[[int], bool],
    entity_id: int,
    entity_name: str,
    detail_not_found: str | None = None,
) -> dict[str, Any]:
    deleted = delete_fn(entity_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=detail_not_found or f"{entity_name} nicht gefunden",
        )

    return {"deleted": True}
