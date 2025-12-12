from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
import uuid
import sys
import os
import json
import logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Shipment, ShipmentCreate, ShipmentUpdate, TrackingEvent
from database import supabase_storage
from auth import get_current_user
from shippo_service import ShippoService
from email_service import email_service, FRONTEND_URL

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["shipments"])

# Default off: enable explicitly via env when desired
ENABLE_FOLDER_EVENT_EMAILS = os.getenv("ENABLE_FOLDER_EVENT_EMAILS", "false").lower() == "true"


def _get_folder_client_email(folder_id: str) -> Optional[str]:
    try:
        folder = supabase_storage.table("folders").select("client_id").eq("id", folder_id).single().execute().data
        client_id = (folder or {}).get("client_id")
        if not client_id:
            return None
        client = supabase_storage.table("clients").select("email").eq("id", client_id).single().execute().data
        email = (client or {}).get("email")
        return email.lower().strip() if isinstance(email, str) and email.strip() else None
    except Exception:
        return None


def _send_folder_email(to_email: str, subject: str, html_content: str, text_content: str) -> None:
    try:
        email_service._send_email(to_email, subject, html_content, text_content)
    except Exception:
        return

async def update_shipment_tracking(shipment_id: str):
    """Update shipment tracking information from Shippo"""
    try:
        # Get shipment
        shipment_response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            return
        
        shipment = shipment_response.data
        old_status = (shipment.get("status") or "").lower() if isinstance(shipment.get("status"), str) else shipment.get("status")
        old_actual_delivery = shipment.get("actual_delivery_date")
        
        if not ShippoService.is_configured():
            logger.warning("Shippo not configured, skipping tracking update")
            return
        
        # Get tracking info from Shippo
        tracking_info = ShippoService.get_tracking(
            shipment["carrier"],
            shipment["tracking_number"]
        )
        
        # Update shipment status
        tracking_status = tracking_info.get("tracking_status", {})
        status = tracking_status.get("status", "unknown")
        if isinstance(status, str):
            status = status.lower()
        status_details = json.dumps(tracking_status)
        
        # Parse delivery dates
        estimated_delivery = None
        actual_delivery = None
        
        if tracking_info.get("eta"):
            try:
                eta_str = tracking_info["eta"]
                if isinstance(eta_str, str):
                    eta_str = eta_str.replace("Z", "+00:00")
                estimated_delivery = datetime.fromisoformat(eta_str) if isinstance(eta_str, str) else None
            except Exception as e:
                logger.warning(f"Could not parse ETA: {str(e)}")
        
        # Check if delivered
        if status == "delivered" and tracking_status.get("status_date"):
            try:
                status_date_str = tracking_status["status_date"]
                if isinstance(status_date_str, str):
                    status_date_str = status_date_str.replace("Z", "+00:00")
                actual_delivery = datetime.fromisoformat(status_date_str) if isinstance(status_date_str, str) else None
            except Exception as e:
                logger.warning(f"Could not parse delivery date: {str(e)}")
        
        # Update shipment
        update_data = {
            "status": status,
            "status_details": status_details,
            "updated_at": datetime.now().isoformat()
        }
        
        if estimated_delivery:
            update_data["estimated_delivery_date"] = estimated_delivery.isoformat()
        if actual_delivery:
            update_data["actual_delivery_date"] = actual_delivery.isoformat()
        
        supabase_storage.table("shipments").update(update_data).eq("id", shipment_id).execute()

        # Best-effort folder event when status transitions (or delivered)
        try:
            new_status = status
            delivered_now = bool(actual_delivery) and not bool(old_actual_delivery)
            if shipment.get("folder_id") and ((new_status and new_status != old_status) or delivered_now):
                event_type = "shipment_delivered" if (new_status == "delivered" or delivered_now) else "shipment_status_updated"
                title = "Shipment delivered" if event_type == "shipment_delivered" else f"Shipment status updated: {new_status}"
                folder_id = shipment.get("folder_id")
                supabase_storage.table("folder_events").insert({
                    "id": str(uuid.uuid4()),
                    "folder_id": folder_id,
                    "event_type": event_type,
                    "title": title,
                    "details": {
                        "shipment_id": shipment_id,
                        "tracking_number": shipment.get("tracking_number"),
                        "carrier": shipment.get("carrier"),
                        "status": new_status,
                        "estimated_delivery_date": update_data.get("estimated_delivery_date"),
                        "actual_delivery_date": update_data.get("actual_delivery_date"),
                    },
                    "created_by": None,
                    "created_at": datetime.now().isoformat(),
                }).execute()

                # Email notification (best-effort)
                if ENABLE_FOLDER_EVENT_EMAILS and folder_id:
                    to_email = _get_folder_client_email(folder_id)
                    if to_email:
                        folder_link = f"{FRONTEND_URL}/folders/{folder_id}"
                        if event_type == "shipment_delivered":
                            subject = "Your order was delivered"
                            html = f"""
                            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                              <h2>Your order was delivered</h2>
                              <p>Tracking: <b>{shipment.get('tracking_number') or ''}</b></p>
                              <p><a href="{folder_link}">View order status</a></p>
                            </div>
                            """
                            text = f"Your order was delivered.\n\nTracking: {shipment.get('tracking_number') or ''}\nView order status: {folder_link}"
                        else:
                            subject = "Shipment update"
                            html = f"""
                            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                              <h2>Shipment update</h2>
                              <p>Status: <b>{new_status}</b></p>
                              <p>Tracking: <b>{shipment.get('tracking_number') or ''}</b></p>
                              <p><a href="{folder_link}">View order status</a></p>
                            </div>
                            """
                            text = f"Shipment update\n\nStatus: {new_status}\nTracking: {shipment.get('tracking_number') or ''}\nView order status: {folder_link}"
                        _send_folder_email(to_email, subject, html, text)
        except Exception:
            pass
        
        # Store tracking events
        tracking_history = tracking_info.get("tracking_history", [])
        for event in tracking_history:
            event_status = event.get("status", "unknown")
            if isinstance(event_status, str):
                event_status = event_status.lower()
            
            event_location = None
            if isinstance(event.get("location"), dict):
                location_dict = event.get("location", {})
                city = location_dict.get("city")
                state = location_dict.get("state")
                if city or state:
                    event_location = ", ".join(filter(None, [city, state]))
            elif isinstance(event.get("location"), str):
                event_location = event.get("location")
            
            event_timestamp = event.get("status_date", datetime.now().isoformat())
            if isinstance(event_timestamp, str):
                try:
                    event_timestamp = event_timestamp.replace("Z", "+00:00")
                except:
                    pass
            
            event_data = {
                "shipment_id": shipment_id,
                "status": event_status,
                "location": event_location,
                "description": event.get("status_details", ""),
                "timestamp": event_timestamp
            }
            
            # Check if event already exists (by timestamp and status)
            existing = supabase_storage.table("shipment_tracking_events").select("id").eq("shipment_id", shipment_id).eq("timestamp", event_timestamp).eq("status", event_status).execute()
            if not existing.data:
                supabase_storage.table("shipment_tracking_events").insert(event_data).execute()
        
    except Exception as e:
        logger.error(f"Error updating shipment tracking: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

@router.post("", response_model=Shipment)
async def create_shipment(
    shipment: ShipmentCreate,
    user = Depends(get_current_user)
):
    """Create a new shipment tracking entry. Admin only."""
    try:
        # Check if user is admin
        is_admin = user.get("role") == "admin"
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can create shipments")
        
        # Verify folder exists
        folder_response = supabase_storage.table("folders").select("id").eq("id", shipment.folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Register tracking with Shippo (optional - will work without it)
        shippo_tracking_id = None
        try:
            if ShippoService.is_configured():
                shippo_tracking = ShippoService.create_tracking(
                    shipment.tracking_number,
                    shipment.carrier
                )
                shippo_tracking_id = shippo_tracking.get("tracking_number_id") or shippo_tracking.get("id")
        except Exception as e:
            logger.warning(f"Could not register with Shippo: {str(e)} - continuing without Shippo registration")
        
        # Get carrier name
        carrier_name = ShippoService.get_carrier_name(shipment.carrier)
        
        # Create shipment record
        shipment_data = {
            "folder_id": shipment.folder_id,
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier,
            "carrier_name": carrier_name,
            "shippo_tracking_id": shippo_tracking_id,
            "status": "pending",
            "created_by": user["id"]
        }
        
        response = supabase_storage.table("shipments").insert(shipment_data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create shipment")
        
        created_shipment = response.data[0]

        # Best-effort folder event for timeline
        try:
            supabase_storage.table("folder_events").insert({
                "id": str(uuid.uuid4()),
                "folder_id": created_shipment.get("folder_id"),
                "event_type": "shipment_created",
                "title": "Shipment created",
                "details": {
                    "shipment_id": created_shipment.get("id"),
                    "tracking_number": created_shipment.get("tracking_number"),
                    "carrier": created_shipment.get("carrier"),
                    "carrier_name": created_shipment.get("carrier_name"),
                },
                "created_by": user.get("id"),
                "created_at": datetime.now().isoformat(),
            }).execute()

            # Email notification (best-effort)
            if ENABLE_FOLDER_EVENT_EMAILS and created_shipment.get("folder_id"):
                to_email = _get_folder_client_email(created_shipment.get("folder_id"))
                if to_email:
                    folder_link = f"{FRONTEND_URL}/folders/{created_shipment.get('folder_id')}"
                    subject = "Your order has shipped"
                    html = f"""
                    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                      <h2>Your order has shipped</h2>
                      <p>Carrier: <b>{created_shipment.get('carrier_name') or created_shipment.get('carrier') or ''}</b></p>
                      <p>Tracking: <b>{created_shipment.get('tracking_number') or ''}</b></p>
                      <p><a href="{folder_link}">View order status</a></p>
                    </div>
                    """
                    text = f"Your order has shipped.\n\nCarrier: {created_shipment.get('carrier_name') or created_shipment.get('carrier') or ''}\nTracking: {created_shipment.get('tracking_number') or ''}\nView order status: {folder_link}"
                    _send_folder_email(to_email, subject, html, text)
        except Exception:
            pass
        
        # Fetch tracking info and update (async, don't wait)
        try:
            await update_shipment_tracking(created_shipment["id"])
        except Exception as e:
            logger.warning(f"Could not fetch initial tracking info: {str(e)}")
        
        return created_shipment
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create shipment: {str(e)}")

@router.get("/folder/{folder_id}", response_model=List[Shipment])
async def get_folder_shipments(
    folder_id: str,
    user = Depends(get_current_user)
):
    """Get all shipments for a folder."""
    try:
        # Check folder access
        is_admin = user.get("role") == "admin"
        folder_response = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get shipments
        response = supabase_storage.table("shipments").select("*").eq("folder_id", folder_id).order("created_at", desc=True).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shipments: {str(e)}")

@router.get("/{shipment_id}", response_model=Shipment)
async def get_shipment(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Get shipment details."""
    try:
        # Get shipment
        response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return shipment
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shipment: {str(e)}")

@router.post("/{shipment_id}/refresh")
async def refresh_shipment_tracking(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Refresh tracking information from Shippo."""
    try:
        # Get shipment
        shipment_response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = shipment_response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Update tracking
        await update_shipment_tracking(shipment_id)
        
        # Return updated shipment
        updated = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        return updated.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing tracking: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh tracking: {str(e)}")

@router.get("/{shipment_id}/events", response_model=List[TrackingEvent])
async def get_shipment_events(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Get tracking events for a shipment."""
    try:
        # Get shipment and check access
        shipment_response = supabase_storage.table("shipments").select("folder_id").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = shipment_response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get events
        response = supabase_storage.table("shipment_tracking_events").select("*").eq("shipment_id", shipment_id).order("timestamp", desc=True).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tracking events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tracking events: {str(e)}")

