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

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from calcom_service import CalComService
from google_calendar_service import GoogleCalendarService
from auth import get_current_user, get_current_admin
from database import supabase_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calcom", tags=["calcom"])

# Initialize Cal.com service
calcom_service = CalComService()

# Initialize Google Calendar service
google_calendar_service = GoogleCalendarService()

def get_customer_info(user: dict) -> Dict[str, str]:
    """Get customer name and email from user data"""
    user_id = user.get("id")
    
    # Try to get from clients table first
    try:
        client_response = supabase_storage.table("clients").select("name, email").eq("user_id", user_id).single().execute()
        if client_response.data:
            return {
                "name": client_response.data.get("name", ""),
                "email": client_response.data.get("email", user.get("email", ""))
            }
    except Exception:
        pass
    
    # Fallback to user metadata or email
    return {
        "name": user.get("user_metadata", {}).get("name", user.get("email", "").split("@")[0]),
        "email": user.get("email", "")
    }

@router.get("/availability")
async def get_availability(
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    event_type_id: Optional[int] = Query(None, description="Event type ID"),
    user = Depends(get_current_user)
):
    """Get available time slots for scheduling"""
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
        
        # Parse Cal.com API response and convert to our format
        # Cal.com returns: {dateRanges: [{start, end}], workingHours: [...], busy: [...]}
        availability_by_date = {}
        
        # Process dateRanges (specific available time windows)
        if raw_availability.get("dateRanges"):
            for date_range in raw_availability.get("dateRanges", []):
                start_str = date_range.get("start")
                end_str = date_range.get("end")
                
                if not start_str or not end_str:
                    continue
                
                try:
                    # Parse ISO datetime strings (handle both Z and +00:00 formats)
                    if start_str.endswith("Z"):
                        start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    else:
                        start_dt = datetime.fromisoformat(start_str)
                    
                    if end_str.endswith("Z"):
                        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                    else:
                        end_dt = datetime.fromisoformat(end_str)
                    
                    # Generate time slots within this range (every event_duration minutes)
                    current_time = start_dt
                    slot_duration = timedelta(minutes=event_duration)
                    
                    while current_time + slot_duration <= end_dt:
                        date_key = current_time.strftime("%Y-%m-%d")
                        time_slot = current_time.strftime("%H:%M")
                        
                        if date_key not in availability_by_date:
                            availability_by_date[date_key] = []
                        
                        if time_slot not in availability_by_date[date_key]:
                            availability_by_date[date_key].append(time_slot)
                        
                        # Move to next slot (increment by event duration)
                        current_time += slot_duration
                except Exception as e:
                    logger.warning(f"Error parsing date range {date_range}: {str(e)}")
                    continue
        
        # If no dateRanges, try to use workingHours as fallback
        if not availability_by_date and raw_availability.get("workingHours"):
            logger.info("No dateRanges found, attempting to use workingHours")
            # Parse workingHours to generate slots
            from datetime import date as date_obj
            
            working_hours = raw_availability.get("workingHours", [])
            timezone_str = raw_availability.get("timeZone", "America/New_York")
            
            # Get the date range we're querying
            if date_from and date_to:
                try:
                    start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
                    end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
                    
                    # Generate slots for each day in range based on working hours
                    current_date = start_date
                    while current_date <= end_date:
                        # Check if this day of week (0=Monday, 6=Sunday) is in working hours
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
                                
                                # Generate time slots every event_duration minutes
                                current_time = datetime.combine(current_date, datetime.min.time().replace(hour=start_hour, minute=start_min))
                                end_time = datetime.combine(current_date, datetime.min.time().replace(hour=end_hour, minute=end_min))
                                
                                slot_duration = timedelta(minutes=event_duration)
                                
                                while current_time + slot_duration <= end_time:
                                    # Check if this time is in the past
                                    if current_time > datetime.now():
                                        date_key = current_date.strftime("%Y-%m-%d")
                                        time_slot = current_time.strftime("%H:%M")
                                        
                                        if date_key not in availability_by_date:
                                            availability_by_date[date_key] = []
                                        
                                        if time_slot not in availability_by_date[date_key]:
                                            availability_by_date[date_key].append(time_slot)
                                    
                                    current_time += slot_duration
                                break  # Found working hours for this day
                        
                        current_date += timedelta(days=1)
                except Exception as e:
                    logger.warning(f"Error generating slots from workingHours: {str(e)}")
        
        # Log for debugging
        logger.info(f"Parsed availability: {len(availability_by_date)} days with slots")
        if availability_by_date:
            sample_date = list(availability_by_date.keys())[0]
            logger.info(f"Sample date {sample_date} has {len(availability_by_date[sample_date])} slots")
        
        # Convert to array format expected by frontend
        availability_array = [
            {"date": date, "slots": sorted(slots)}
            for date, slots in sorted(availability_by_date.items())
        ]
        
        return {"availability": availability_array}
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
        # API key not configured - return empty list instead of error
        logger.warning(f"Cal.com API key not configured: {str(e)}")
        return {"event_types": []}
    except Exception as e:
        # Log the error but return empty list to prevent page breakage
        logger.error(f"Error fetching event types: {str(e)}", exc_info=True)
        # Return empty list instead of failing - allows page to load
        return {"event_types": []}

@router.post("/bookings")
async def create_booking(
    booking_data: Dict[str, Any],
    user = Depends(get_current_user)
):
    """Create a new booking"""
    try:
        event_type_id = booking_data.get("event_type_id")
        start_time = booking_data.get("start_time")
        notes = booking_data.get("notes")
        timezone = booking_data.get("timezone", "America/New_York")
        
        if not event_type_id or not start_time:
            raise HTTPException(status_code=400, detail="event_type_id and start_time are required")
        
        # Get customer info
        customer_info = get_customer_info(user)
        
        # Create booking via Cal.com API
        booking = calcom_service.create_booking(
            event_type_id=event_type_id,
            start_time=start_time,
            attendee_info=customer_info,
            timezone=timezone,
            notes=notes
        )
        
        # Store booking in database
        booking_id = booking.get("id")
        if booking_id:
            # Get event type name
            event_types = calcom_service.get_event_types()
            event_type_name = None
            for et in event_types:
                if et.get("id") == event_type_id:
                    event_type_name = et.get("title", et.get("slug", ""))
                    break
            
            # Parse start and end times
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            # Estimate end time (default 30 minutes, or use event type duration)
            duration = 30  # minutes
            for et in event_types:
                if et.get("id") == event_type_id:
                    duration = et.get("length", 30)
                    break
            end_dt = start_dt + timedelta(minutes=duration)
            
            # Store in database
            booking_record = {
                "id": str(uuid.uuid4()),
                "booking_id": str(booking_id),
                "customer_id": user.get("id"),
                "customer_email": customer_info["email"],
                "customer_name": customer_info["name"],
                "event_type": event_type_name,
                "event_type_id": str(event_type_id),
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "timezone": timezone,
                "meeting_url": booking.get("location", {}).get("url") if isinstance(booking.get("location"), dict) else booking.get("location"),
                "status": "confirmed",
                "notes": notes,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            supabase_storage.table("calcom_bookings").insert(booking_record).execute()
        
        return booking
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating booking: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create booking: {str(e)}")

@router.get("/bookings")
async def get_bookings(user = Depends(get_current_user)):
    """Get user's bookings"""
    try:
        # Get from database (faster and includes our metadata)
        bookings_response = supabase_storage.table("calcom_bookings").select("*").eq("customer_id", user.get("id")).order("start_time", desc=True).execute()
        
        bookings = []
        for booking in bookings_response.data or []:
            # Enrich with Cal.com data if needed
            try:
                calcom_booking = calcom_service.get_booking(int(booking["booking_id"]))
                # Merge Cal.com data with our stored data
                booking["calcom_data"] = calcom_booking
                if calcom_booking.get("location"):
                    booking["meeting_url"] = calcom_booking.get("location", {}).get("url") if isinstance(calcom_booking.get("location"), dict) else calcom_booking.get("location")
            except Exception as e:
                logger.warning(f"Could not fetch Cal.com data for booking {booking['booking_id']}: {str(e)}")
            
            bookings.append(booking)
        
        return {"bookings": bookings}
    except Exception as e:
        logger.error(f"Error fetching bookings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch bookings: {str(e)}")

@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, user = Depends(get_current_user)):
    """Get booking details"""
    try:
        # Get from database first
        booking_response = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", user.get("id")).single().execute()
        
        if not booking_response.data:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking = booking_response.data
        
        # Enrich with Cal.com data
        try:
            calcom_booking = calcom_service.get_booking(int(booking_id))
            booking["calcom_data"] = calcom_booking
        except Exception as e:
            logger.warning(f"Could not fetch Cal.com data: {str(e)}")
        
        return booking
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching booking: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch booking: {str(e)}")

@router.delete("/bookings/{booking_id}")
async def cancel_booking(
    booking_id: str,
    reason: Optional[str] = Query(None, description="Cancellation reason"),
    user = Depends(get_current_user)
):
    """Cancel a booking"""
    try:
        # Verify booking belongs to user
        booking_response = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", user.get("id")).single().execute()
        
        if not booking_response.data:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Cancel via Cal.com API
        calcom_service.cancel_booking(int(booking_id), reason=reason)
        
        # Update in database
        supabase_storage.table("calcom_bookings").update({
            "status": "cancelled",
            "cancelled_at": datetime.now().isoformat(),
            "cancellation_reason": reason,
            "updated_at": datetime.now().isoformat()
        }).eq("booking_id", booking_id).execute()
        
        return {"message": "Booking cancelled successfully"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
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
        new_start_time = reschedule_data.get("start_time")
        timezone = reschedule_data.get("timezone", "America/New_York")
        
        if not new_start_time:
            raise HTTPException(status_code=400, detail="start_time is required")
        
        # Verify booking belongs to user
        booking_response = supabase_storage.table("calcom_bookings").select("*").eq("booking_id", booking_id).eq("customer_id", user.get("id")).single().execute()
        
        if not booking_response.data:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Reschedule via Cal.com API
        updated_booking = calcom_service.reschedule_booking(int(booking_id), new_start_time, timezone)
        
        # Update in database
        start_dt = datetime.fromisoformat(new_start_time.replace("Z", "+00:00"))
        # Get duration from original booking
        original_start = datetime.fromisoformat(booking_response.data["start_time"])
        original_end = datetime.fromisoformat(booking_response.data["end_time"])
        duration = (original_end - original_start).total_seconds() / 60
        end_dt = start_dt + timedelta(minutes=duration)
        
        supabase_storage.table("calcom_bookings").update({
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "timezone": timezone,
            "status": "confirmed",
            "updated_at": datetime.now().isoformat()
        }).eq("booking_id", booking_id).execute()
        
        return {"message": "Booking rescheduled successfully", "booking": updated_booking}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
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
            query = query.gte("start_time", date_from)
        if date_to:
            query = query.lte("start_time", date_to)
        
        bookings_response = query.order("start_time", desc=True).execute()
        
        return {"bookings": bookings_response.data or []}
    except Exception as e:
        logger.error(f"Error fetching admin bookings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch bookings: {str(e)}")

@router.get("/admin/calendar")
async def get_admin_calendar(
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user = Depends(get_current_admin)
):
    """Get calendar view with all bookings and Google Calendar events (admin only)"""
    try:
        # Default to current month
        if not date_from:
            date_from = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        if not date_to:
            next_month = datetime.now().replace(day=28) + timedelta(days=4)
            date_to = (next_month - timedelta(days=next_month.day)).strftime("%Y-%m-%d")
        
        # Get bookings from database
        bookings_response = supabase_storage.table("calcom_bookings").select("*").gte("start_time", date_from).lte("start_time", date_to).order("start_time").execute()
        
        # Also get from Cal.com API for completeness
        calcom_bookings = []
        try:
            calcom_bookings = calcom_service.get_bookings(filters={"limit": 100})
        except Exception as e:
            logger.warning(f"Could not fetch Cal.com bookings: {str(e)}")
        
        # Get Google Calendar events
        google_calendar_events = []
        try:
            # Convert dates to RFC3339 format for Google Calendar API
            time_min = datetime.strptime(date_from, "%Y-%m-%d").isoformat() + "Z"
            time_max = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).isoformat() + "Z"
            
            google_calendar_events = google_calendar_service.get_events(
                calendar_id="primary",
                time_min=time_min,
                time_max=time_max
            )
        except Exception as e:
            logger.warning(f"Could not fetch Google Calendar events: {str(e)}")
        
        return {
            "bookings": bookings_response.data or [],
            "calcom_bookings": calcom_bookings,
            "google_calendar_events": google_calendar_events,
            "date_from": date_from,
            "date_to": date_to
        }
    except Exception as e:
        logger.error(f"Error fetching admin calendar: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendar: {str(e)}")

