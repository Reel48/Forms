from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def _is_paid(payment_status: Optional[str]) -> bool:
    return str(payment_status or "").lower() in ("paid", "succeeded")


def _is_quote_accepted_or_approved(quote_status: Optional[str]) -> bool:
    return str(quote_status or "").lower() in ("accepted", "approved")


def build_customer_tasks(
    *,
    folder_id: str,
    quote: Optional[Dict[str, Any]],
    forms: List[Dict[str, Any]],
    esignatures: List[Dict[str, Any]],
    files_total: int,
    files_viewed: int,
) -> List[Dict[str, Any]]:
    """
    Build the customer-facing tasks list for a folder/order.

    NOTE: This is intentionally deterministic and used across backend summary + chat tool
    to keep customer messaging consistent.
    """
    tasks: List[Dict[str, Any]] = []

    # Quote task (review/pay)
    if quote and quote.get("id"):
        unpaid = not _is_paid(quote.get("payment_status"))
        tasks.append({
            "id": "task_quote_payment",
            "kind": "quote",
            "priority": 10,
            "title": "Review and pay your quote" if unpaid else "Quote paid",
            "description": f"Quote {quote.get('quote_number')}" if quote.get("quote_number") else None,
            "status": "incomplete" if unpaid else "complete",
            "owner": "customer",
            "deeplink": f"/quotes/{quote.get('id')}",
        })

    # E-signature tasks
    for esig in esignatures or []:
        esig_id = esig.get("id")
        if not esig_id:
            continue
        name = esig.get("name") or "E-signature"
        tasks.append({
            "id": f"task_esign_{esig_id}",
            "kind": "esignature",
            "priority": 20,
            "title": f"Sign: {name}",
            "description": None,
            "status": "complete" if esig.get("is_completed") else "incomplete",
            "owner": "customer",
            "deeplink": f"/esignature/{esig_id}",
        })

    # Form tasks
    for form in forms or []:
        form_id = form.get("id")
        if not form_id:
            continue
        name = form.get("name") or "Form"
        tasks.append({
            "id": f"task_form_{form_id}",
            "kind": "form",
            "priority": 30,
            "title": f"Complete form: {name}",
            "description": None,
            "status": "complete" if form.get("is_completed") else "incomplete",
            "owner": "customer",
            "deeplink": f"/forms/{form_id}",
        })

    # File review task (aggregate)
    if int(files_total or 0) > 0:
        complete = int(files_viewed or 0) >= int(files_total or 0)
        tasks.append({
            "id": "task_files_review",
            "kind": "file_review",
            "priority": 40,
            "title": "Review files",
            "description": f"Viewed {int(files_viewed or 0)} of {int(files_total or 0)}",
            "status": "complete" if complete else "incomplete",
            "owner": "customer",
            "deeplink": f"/folders/{folder_id}#project-files",
            "counts": {"completed": int(files_viewed or 0), "total": int(files_total or 0)},
        })

    # Sort: incomplete first by priority, then completed by priority
    def _sort_key(t: Dict[str, Any]) -> Tuple[int, int]:
        status = t.get("status")
        incomplete_first = 0 if status == "incomplete" else 1
        return (incomplete_first, int(t.get("priority") or 999))

    return sorted(tasks, key=_sort_key)


def compute_tasks_progress(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(tasks or [])
    completed = len([t for t in (tasks or []) if t.get("status") == "complete"])
    pct = int(round((completed / total) * 100)) if total > 0 else 0
    return {"tasks_total": total, "tasks_completed": completed, "tasks_percent": pct}


def compute_next_step_from_tasks(tasks: List[Dict[str, Any]]) -> Optional[str]:
    for t in tasks or []:
        if t.get("status") == "incomplete":
            # Use the task title directly for consistent customer messaging.
            return t.get("title") or None
    return None


def compute_stage_and_next_step(
    *,
    folder: Dict[str, Any],
    quote: Optional[Dict[str, Any]],
    shipping: Dict[str, Any],
    tasks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Deterministic stage/next-step for customer UX with optional overrides stored on folders.
    """
    stage_override = folder.get("stage")
    next_override = folder.get("next_step")
    next_owner_override = folder.get("next_step_owner")

    has_quote = bool(quote)
    payment_paid = _is_paid((quote or {}).get("payment_status")) if has_quote else False
    quote_status = (quote or {}).get("status") if has_quote else None
    quote_confirmed = has_quote and (payment_paid or _is_quote_accepted_or_approved(quote_status))
    # Per requirements: even if accepted/approved, payment can still be required (task remains incomplete)
    unpaid_by_payment = has_quote and not payment_paid

    has_shipment = bool((shipping or {}).get("has_shipment"))
    delivered_at = (shipping or {}).get("actual_delivery_date")
    shipped_status = str((shipping or {}).get("status") or "").lower()

    progress = compute_tasks_progress(tasks)
    # For stage advancement, ignore the payment task (accepted/approved should be able to advance stages even if unpaid)
    non_payment_tasks = [t for t in (tasks or []) if t.get("id") != "task_quote_payment"]
    non_payment_incomplete = any(t.get("status") == "incomplete" for t in non_payment_tasks)

    # Stage
    if delivered_at or shipped_status == "delivered":
        computed_stage = "delivered"
    elif has_shipment:
        computed_stage = "shipped"
    elif not quote_confirmed:
        computed_stage = "quote_sent"
    elif has_quote:
        computed_stage = "design_info_needed" if non_payment_incomplete else "production"
    else:
        computed_stage = "quote_sent"

    # Next step
    if unpaid_by_payment:
        computed_next = "Review and pay your quote"
        computed_owner = "customer"
    else:
        task_next = compute_next_step_from_tasks(tasks)
        if task_next:
            computed_next = task_next
            computed_owner = "customer"
        elif has_shipment:
            computed_next = "Track your shipment"
            computed_owner = "customer"
        elif has_quote:
            computed_next = "We’re working on production — we’ll notify you when it ships"
            computed_owner = "reel48"
        else:
            computed_next = "We’re preparing your quote — we’ll notify you when it’s ready"
            computed_owner = "reel48"

    return {
        "stage": stage_override if stage_override else computed_stage,
        "next_step": next_override if next_override else computed_next,
        "next_step_owner": next_owner_override if next_owner_override else computed_owner,
        "computed_stage": computed_stage,
        "computed_next_step": computed_next,
        "computed_next_step_owner": computed_owner,
        "tasks_progress": progress,
    }

