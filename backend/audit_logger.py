"""Audit logging utilities.

Writes security-relevant events to the `audit_logs` table.
Best-effort: failures must never block the main request.
"""

from __future__ import annotations

from typing import Any, Optional, Dict
import logging

from database import supabase_storage

logger = logging.getLogger(__name__)


def log_audit_event(
    *,
    actor_user_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    target_user_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        payload: Dict[str, Any] = {
            "actor_user_id": actor_user_id,
            "target_user_id": target_user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "details": details or {},
        }
        supabase_storage.table("audit_logs").insert(payload).execute()
    except Exception as e:
        logger.warning("Failed to write audit log (%s %s): %s", entity_type, action, str(e))
