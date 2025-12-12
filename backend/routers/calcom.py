"""
Cal.com Router
Handles API endpoints for Cal.com scheduling integration
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import sys
import os
import logging
import uuid
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from calcom_service import CalComService
from google_calendar_service import GoogleCalendarService
from auth import get_current_user, get_current_admin
from database import supabase_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calcom", tags=["calcom"])

calcom_service = CalComService()
google_calendar_service = GoogleCalendarService()

def get_customer_info(user: dict) -> Dict[str, str]:
    """
    Extract customer information from user object
    """
    try:
        # Try to get from user_metadata first
        user_metadata = user.get("user_metadata", {})
        name = user_metadata.get("name") or user_metadata.get("full_name")
        
        if not name:
            # Fallback to email prefix
            email = user.get("email", "")
            name = email.split("@")[0] if email else "Customer"
        
        return {
            "name": name,
            "email": user.get("email", "")
        }
    except Exception as e:
        logger.error(f"Error extracting customer info: {str(e)}")
        return {
            "name": user.get("email", "").split("@")[0] if user.get("email") else "Customer",
            "email": user.get("email", "")
        }

@router.get("/availability")
async def get_availability(
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    event_type_id: Optional[int] = Query(None, description="Event type ID"),
    user = Depends(get_current_user)
):
    """Get available time slots for scheduling
    
    Returns times in Cal.com's configured timezone. Frontend will convert to user's timezone.
    """
    try:
        raw_availability = calcom_service.get_availability(
            date_from=date_from,
            date_to=date_to,
            event_type_id=event_type_id
        )
        
        # Get event type duration (default 30 minutes)
        event_duration = 30
        if event_type_id:
            try:
                event_types = calcom_service.get_event_types()
                for et in event_types:
                    if et.get("id") == event_type_id:
                        event_duration = et.get("length", 30)
                        break
            except Exception:
                pass
        
        # Get Cal.com's timezone from response
        calcom_timezone = raw_availability.get("timeZone", "America/Chicago")
        
        # Parse Cal.com API response and convert to our format
        availability_by_date = {}
        
        # Process dateRanges (specific available time windows)
        if raw_availability.get("dateRanges"):
            for date_range in raw_availability.get("dateRanges", []):
                start_str = date_range.get("start")
                end_str = date_range.get("end")
                
                if not start_str or not end_str:
                    continue
                
                try:
                    # Parse ISO datetime strings (Cal.com returns in UTC)
                    if start_str.endswith("Z"):
                        start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    else:
                        start_dt = datetime.fromisoformat(start_str)
                    
                    if end_str.endswith("Z"):
                        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                    else:
                        end_dt = datetime.fromisoformat(end_str)
                    
                    # Ensure timezone-aware
                    if not start_dt.tzinfo:
                        start_dt = start_dt.replace(tzinfo=ZoneInfo("UTC"))
                    if not end_dt.tzinfo:
                        end_dt = end_dt.replace(tzinfo=ZoneInfo("UTC"))
                    
                    # Convert from UTC to Cal.com's timezone
                    try:
                        calcom_tz = ZoneInfo(calcom_timezone)
                    except Exception:
                        calcom_tz = ZoneInfo("America/Chicago")  # Default fallback
                    
                    start_dt_calcom = start_dt.astimezone(calcom_tz)
                    end_dt_calcom = end_dt.astimezone(calcom_tz)
                    
                    # Get current time in Cal.com timezone for filtering
                    now_utc = datetime.now(ZoneInfo("UTC"))
                    now_calcom = now_utc.astimezone(calcom_tz)
                    
                    # Generate time slots
                    current_time = start_dt_calcom
                    slot_duration = timedelta(minutes=event_duration)
                    
                    while current_time + slot_duration <= end_dt_calcom:
                        # Filter out past slots
                        if current_time > now_calcom:
                            date_key = current_time.date().strftime("%Y-%m-%d")
                            time_slot = current_time.strftime("%H:%M")
                            
                            if date_key not in availability_by_date:
                                availability_by_date[date_key] = []
                            
                            if time_slot not in availability_by_date[date_key]:
                                availability_by_date[date_key].append(time_slot)
                        
                        current_time += slot_duration
                except Exception as e:
                    logger.warning(f"Error parsing date range {date_range}: {str(e)}")
                    continue
        
        # If no dateRanges, use workingHours as fallback
        if not availability_by_date and raw_availability.get("workingHours"):
            logger.info("No dateRanges found, using workingHours")
            
            working_hours = raw_availability.get("workingHours", [])
            
            # Get Cal.com timezone
            try:
                calcom_tz = ZoneInfo(calcom_timezone)
            except Exception:
                calcom_tz = ZoneInfo("America/Chicago")  # Default fallback
            
            # Get current time in Cal.com timezone
            now_utc = datetime.now(ZoneInfo("UTC"))
            now_calcom = now_utc.astimezone(calcom_tz)
            
            # Get date range
            if date_from and date_to:
                try:
                    start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
                    end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
                    
                    current_date = start_date
                    while current_date <= end_date:
                        day_of_week = current_date.weekday()  # 0=Monday, 6=Sunday
                        
                        for wh in working_hours:
                            if day_of_week in wh.get("days", []):
                                start_time_minutes = wh.get("startTime", 0)  # e.g., 900 = 9:00 AM
                                end_time_minutes = wh.get("endTime", 1380)  # e.g., 1380 = 11:00 PM
                                
                                # Convert minutes to hours and minutes
                                start_hour = start_time_minutes // 60
                                start_min = start_time_minutes % 60
                                end_hour = end_time_minutes // 60
                                end_min = end_time_minutes % 60
                                
                                # Create datetime in Cal.com timezone
                                current_time = datetime.combine(
                                    current_date,
                                    datetime.min.time().replace(hour=start_hour, minute=start_min)
                                ).replace(tzinfo=calcom_tz)
                                
                                end_time = datetime.combine(
                                    current_date,
                                    datetime.min.time().replace(hour=end_hour, minute=end_min)
                                ).replace(tzinfo=calcom_tz)
                                
                                slot_duration = timedelta(minutes=event_duration)
                                
                                while current_time + slot_duration <= end_time:
                                    # Filter out past slots
                                    if current_time > now_calcom:
                                        date_key = current_date.strftime("%Y-%m-%d")
                                        time_slot = current_time.strftime("%H:%M")
                                        
                                        if date_key not in availability_by_date:
                                            availability_by_date[date_key] = []
                                        
                                        if time_slot not in availability_by_date[date_key]:
                                            availability_by_date[date_key].append(time_slot)
                                    
                                    current_time += slot_duration
                                break
                        
                        current_date += timedelta(days=1)
                except Exception as e:
                    logger.warning(f"Error generating slots from workingHours: {str(e)}", exc_info=True)
        
        # Convert to array format expected by frontend
        availability_array = [
            {"date": date, "slots": sorted(slots)}
            for date, slots in sorted(availability_by_date.items())
        ]
        
        # Include timezone in response so frontend knows what timezone the times are in
        return {
            "availability": availability_array,
            "timezone": calcom_timezone  # Tell frontend what timezone these times are in
        }
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching availability: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch availability: {str(e)}")

@router.get("/event-types")
async def get_event_types(user = Depends(get_current_user)):
    """Get available event types"""
    try:
        event_types = calcom_service.get_event_types()
        return {"event_types": event_types}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching event types: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch event types: {str(e)}")

@router.post("/bookings")
async def create_booking(
    booking_data: Dict[str, Any],
    user = Depends(get_current_user)
):
    """Create a new booking"""
    try:
        customer_info = get_customer_info(user)
        
        # Extract booking data
        event_type_id = booking_data.get("event_type_id")
        start_time = booking_data.get("start_time")
        timezone = booking_data.get("timezone", "America/Chicago")
        notes = booking_data.get("notes", "")
        
        if not event_type_id or not start_time:
            raise HTTPException(status_code=400, detail="Missing required fields: event_type_id and start_time")
        
        # Create booking via Cal.com API
        booking_response = calcom_service.create_booking(
            event_type_id=event_type_id,
            start_time=start_time,
            customer_name=customer_info["name"],
            customer_email=customer_info["email"],
            notes=notes
        )
        
        booking_id = booking_response.get("id")
        if not booking_id:
            raise HTTPException(status_code=500, detail="Failed to create booking: No booking ID returned")
        
        # Store booking in database
        try:
            booking_record = {
                "booking_id": str(booking_id),
                "customer_id": user.get("id"),
                "customer_email": customer_info["email"],
                "customer_name": customer_info["name"],
                "event_type_id": str(event_type_id),
                "start_time": start_time,
                "timezone": timezone,
                "status": "confirmed"
            }
            
            # Get event type details for end_time calculation
            event_types = calcom_service.get_event_types()
            event_duration = 30  # default
            for et in event_types:
                if et.get("id") == event_type_id:
                    event_duration = et.get("length", 30)
                    break
            
            # Calculate end_time
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            end_dt = start_dt + timedelta(minutes=event_duration)
            booking_record["end_time"] = end_dt.isoformat()
            
            # Store in database
            result = supabase_storage.table("calcom_bookings").insert(booking_record).execute()
            
            return {
                "message": "Booking created successfully",
                "booking_id": booking_id,
                "booking": booking_response
            }
        except Exception as db_error:
            logger.error(f"Error storing booking in database: {str(db_error)}")
            # Still return success since Cal.com booking was created
            return {
                "message": "Booking created successfully (database storage failed)",
                "booking_id": booking_id,
                "booking": booking_response
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating booking: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create booking: {str(e)}")

@router.get("/bookings")
async def get_customer_bookings(
    status: Optional[str] = Query(None, description="Filter by status"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user = Depends(get_current_user)
):
    """Get all bookings for the current customer"""
    try:
        customer_id = user.get("id")
        
        query = supabase_storage.table("calcom_bookings").select("*").eq("customer_id", customer_id)
        
        if status:
            query = query.eq("status", status)
        if date_from:
            query = query.gte("start_time", f"{date_from}T00:00:00")
        if date_to:
            query = query.lte("start_time", f"{date_to}T23:59:59")
        
        query = query.order("start_time", desc=True)
        
        result = query.execute()
        bookings = result.data if result.data else []
        
        return {"bookings": bookings}
    except Exception as e:
        logger.error(f"Error fetching customer bookings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch bookings: {str(e)}")

@router.get("/bookings/{booking_id}")
async def get_booking_details(booking_id: str, user = Depends(get_current_user)):
    """Get details for a specific booking"""
    try:
        customer_id = user.get("id")
        
        result = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", customer_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching booking details: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch booking details: {str(e)}")

@router.delete("/bookings/{booking_id}")
async def cancel_booking(
    booking_id: str,
    reason: Optional[str] = Query(None, description="Cancellation reason"),
    user = Depends(get_current_user)
):
    """Cancel a booking"""
    try:
        customer_id = user.get("id")
        
        # Verify booking belongs to customer
        booking_result = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", customer_id).execute()
        
        if not booking_result.data or len(booking_result.data) == 0:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Cancel via Cal.com API
        try:
            calcom_service.cancel_booking(booking_id, reason)
        except Exception as e:
            logger.warning(f"Cal.com cancellation failed: {str(e)}")
        
        # Update database
        update_data = {
            "status": "cancelled",
            "cancelled_at": datetime.now(ZoneInfo("UTC")).isoformat()
        }
        if reason:
            update_data["cancellation_reason"] = reason
        
        supabase_storage.table("calcom_bookings").update(update_data).eq("booking_id", booking_id).execute()
        
        return {"message": "Booking cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling booking: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cancel booking: {str(e)}")

@router.patch("/bookings/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: str,
    reschedule_data: Dict[str, Any],
    user = Depends(get_current_user)
):
    """Reschedule a booking"""
    try:
        customer_id = user.get("id")
        
        # Verify booking belongs to customer
        booking_result = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", customer_id).execute()
        
        if not booking_result.data or len(booking_result.data) == 0:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        new_start_time = reschedule_data.get("start_time")
        if not new_start_time:
            raise HTTPException(status_code=400, detail="Missing required field: start_time")
        
        # Reschedule via Cal.com API
        try:
            reschedule_response = calcom_service.reschedule_booking(booking_id, new_start_time)
        except Exception as e:
            logger.error(f"Cal.com reschedule failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to reschedule booking: {str(e)}")
        
        # Update database
        booking = booking_result.data[0]
        event_type_id = booking.get("event_type_id")
        
        # Get event duration
        event_duration = 30
        try:
            event_types = calcom_service.get_event_types()
            for et in event_types:
                if str(et.get("id")) == str(event_type_id):
                    event_duration = et.get("length", 30)
                    break
        except Exception:
            pass
        
        # Calculate new end_time
        start_dt = datetime.fromisoformat(new_start_time.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=event_duration)
        
        update_data = {
            "start_time": new_start_time,
            "end_time": end_dt.isoformat(),
            "status": "rescheduled"
        }
        
        supabase_storage.table("calcom_bookings").update(update_data).eq("booking_id", booking_id).execute()
        
        return {
            "message": "Booking rescheduled successfully",
            "booking": reschedule_response
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rescheduling booking: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reschedule booking: {str(e)}")

# Admin endpoints
@router.get("/admin/bookings")
async def get_admin_bookings(
    status: Optional[str] = Query(None, description="Filter by status"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user = Depends(get_current_admin)
):
    """Get all bookings (admin only)"""
    try:
        query = supabase_storage.table("calcom_bookings").select("*")
        
        if status:
            query = query.eq("status", status)
        if date_from:
            query = query.gte("start_time", f"{date_from}T00:00:00")
        if date_to:
            query = query.lte("start_time", f"{date_to}T23:59:59")
        
        query = query.order("start_time", desc=True)
        
        result = query.execute()
        bookings = result.data if result.data else []
        
        return {"bookings": bookings}
    except Exception as e:
        logger.error(f"Error fetching admin bookings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch bookings: {str(e)}")

@router.get("/admin/bookings/{booking_id}")
async def get_admin_booking_details(booking_id: str, user = Depends(get_current_admin)):
    """Get details for a specific booking (admin only)"""
    try:
        result = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching booking details: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch booking details: {str(e)}")

@router.get("/admin/calendar")
async def get_admin_calendar(
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user = Depends(get_current_admin)
):
    """Get admin calendar view with all bookings and Google Calendar events"""
    try:
        # Fetch Cal.com bookings
        calcom_bookings = []
        try:
            calcom_bookings = calcom_service.get_bookings(filters={"limit": 100})
        except Exception as e:
            logger.warning(f"Could not fetch Cal.com bookings: {str(e)}")
        
        # Fetch Google Calendar events
        google_calendar_events = []
        if date_from and date_to:
            try:
                google_calendar_events = google_calendar_service.get_events(
                    time_min=f"{date_from}T00:00:00Z",
                    time_max=f"{date_to}T23:59:59Z"
                )
            except Exception as e:
                logger.warning(f"Could not fetch Google Calendar events: {str(e)}")
        
        return {
            "calcom_bookings": calcom_bookings,
            "google_calendar_events": google_calendar_events,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching admin calendar data: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch admin calendar data: {str(e)}")
