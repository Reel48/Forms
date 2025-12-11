"""
Cal.com Service
Handles interactions with Cal.com API for scheduling meetings
"""
import os
import requests
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Cal.com API configuration
CALCOM_API_KEY = os.getenv("CALCOM_API_KEY")
CALCOM_USERNAME = os.getenv("CALCOM_USERNAME", "reel48")
CALCOM_API_BASE_URL = "https://api.cal.com/v1"

if not CALCOM_API_KEY:
    logger.warning("CALCOM_API_KEY not found in environment variables. Cal.com features will be disabled.")

class CalComService:
    """Service for interacting with Cal.com API"""
    
    def __init__(self):
        """Initialize Cal.com service with API key"""
        self.api_key = CALCOM_API_KEY
        self.username = CALCOM_USERNAME
        self.base_url = CALCOM_API_BASE_URL
        # Cal.com API uses Authorization header with API key (not Bearer token)
        self.headers = {
            "Authorization": f"ApiKey {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json"
        }
    
    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make a request to Cal.com API
        
        Args:
            method: HTTP method (GET, POST, PATCH, DELETE)
            endpoint: API endpoint (without base URL)
            data: Request body data
            params: Query parameters
            
        Returns:
            Response JSON data
            
        Raises:
            ValueError: If API key is not configured
            requests.RequestException: If API request fails
        """
        if not self.api_key:
            raise ValueError("Cal.com API key is not configured. Please set CALCOM_API_KEY environment variable.")
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            logger.error(f"Cal.com API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Cal.com API request error: {str(e)}")
            raise
    
    def get_availability(
        self,
        username: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        event_type_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get available time slots for a user
        
        Args:
            username: Cal.com username (defaults to configured username)
            date_from: Start date in ISO format (YYYY-MM-DD)
            date_to: End date in ISO format (YYYY-MM-DD)
            event_type_id: Optional event type ID to filter by
            
        Returns:
            Dictionary with availability data including time slots
        """
        username = username or self.username
        
        # Default to next 30 days if not specified
        if not date_from:
            date_from = datetime.now().strftime("%Y-%m-%d")
        if not date_to:
            date_to = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        params = {
            "username": username,
            "dateFrom": date_from,
            "dateTo": date_to
        }
        
        if event_type_id:
            params["eventTypeId"] = event_type_id
        
        return self._make_request("GET", f"/availability/{username}", params=params)
    
    def get_event_types(self, username: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get available event types for a user
        
        Args:
            username: Cal.com username (defaults to configured username)
            
        Returns:
            List of event types with details
        """
        username = username or self.username
        try:
            # Try the event-types endpoint with username parameter
            response = self._make_request("GET", f"/event-types", params={"username": username})
            # Cal.com API might return event_types as a list directly or nested
            if isinstance(response, list):
                return response
            return response.get("event_types", response.get("data", []))
        except requests.exceptions.HTTPError as e:
            # If 404 or other error, try alternative endpoint format
            if e.response.status_code == 404:
                logger.warning(f"Event types endpoint not found, trying alternative format")
                try:
                    # Try without username param or different endpoint
                    response = self._make_request("GET", f"/event-types")
                    if isinstance(response, list):
                        return response
                    return response.get("event_types", response.get("data", []))
                except Exception:
                    # Return empty list if both attempts fail
                    logger.warning("Could not fetch event types, returning empty list")
                    return []
            raise
    
    def create_booking(
        self,
        event_type_id: int,
        start_time: str,
        attendee_info: Dict[str, str],
        timezone: str = "America/New_York",
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new booking
        
        Args:
            event_type_id: Event type ID from Cal.com
            start_time: Start time in ISO format (YYYY-MM-DDTHH:MM:SS)
            attendee_info: Dictionary with 'name' and 'email' keys
            timezone: Timezone (default: America/New_York)
            notes: Optional notes for the booking
            
        Returns:
            Booking details including booking ID and meeting URL
        """
        data = {
            "eventTypeId": event_type_id,
            "start": start_time,
            "responses": {
                "name": attendee_info.get("name", ""),
                "email": attendee_info.get("email", "")
            },
            "timeZone": timezone
        }
        
        if notes:
            data["notes"] = notes
        
        return self._make_request("POST", "/bookings", data=data)
    
    def get_booking(self, booking_id: int) -> Dict[str, Any]:
        """
        Get booking details by ID
        
        Args:
            booking_id: Cal.com booking ID
            
        Returns:
            Booking details
        """
        return self._make_request("GET", f"/bookings/{booking_id}")
    
    def cancel_booking(self, booking_id: int, reason: Optional[str] = None) -> Dict[str, Any]:
        """
        Cancel a booking
        
        Args:
            booking_id: Cal.com booking ID
            reason: Optional cancellation reason
            
        Returns:
            Cancellation confirmation
        """
        data = {}
        if reason:
            data["reason"] = reason
        
        return self._make_request("DELETE", f"/bookings/{booking_id}", data=data if data else None)
    
    def reschedule_booking(self, booking_id: int, new_start_time: str, timezone: str = "America/New_York") -> Dict[str, Any]:
        """
        Reschedule a booking
        
        Args:
            booking_id: Cal.com booking ID
            new_start_time: New start time in ISO format (YYYY-MM-DDTHH:MM:SS)
            timezone: Timezone (default: America/New_York)
            
        Returns:
            Updated booking details
        """
        data = {
            "start": new_start_time,
            "timeZone": timezone
        }
        
        return self._make_request("PATCH", f"/bookings/{booking_id}", data=data)
    
    def get_bookings(
        self,
        username: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of bookings
        
        Args:
            username: Cal.com username (defaults to configured username)
            filters: Optional filters (e.g., {'status': 'confirmed', 'limit': 100})
            
        Returns:
            List of bookings
        """
        username = username or self.username
        params = {"username": username}
        
        if filters:
            params.update(filters)
        
        response = self._make_request("GET", "/bookings", params=params)
        return response.get("bookings", [])

