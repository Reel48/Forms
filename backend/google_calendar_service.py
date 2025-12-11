"""
Google Calendar Service
Handles interactions with Google Calendar API for fetching team meetings
"""
import os
import requests
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Google Calendar API configuration
GOOGLE_CALENDAR_API_KEY = os.getenv("GOOGLE_CALENDAR_API_KEY")
GOOGLE_CALENDAR_CLIENT_ID = os.getenv("GOOGLE_CALENDAR_CLIENT_ID")
GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3"

if not GOOGLE_CALENDAR_API_KEY:
    logger.warning("GOOGLE_CALENDAR_API_KEY not found in environment variables. Google Calendar features will be disabled.")

class GoogleCalendarService:
    """Service for interacting with Google Calendar API"""
    
    def __init__(self):
        """Initialize Google Calendar service with API key"""
        self.api_key = GOOGLE_CALENDAR_API_KEY
        self.client_id = GOOGLE_CALENDAR_CLIENT_ID
        self.base_url = GOOGLE_CALENDAR_API_BASE_URL
    
    def _make_request(self, method: str, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make a request to Google Calendar API
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (without base URL)
            params: Query parameters (will include API key)
            
        Returns:
            Response JSON data
            
        Raises:
            ValueError: If API key is not configured
            requests.RequestException: If API request fails
        """
        if not self.api_key:
            raise ValueError("Google Calendar API key is not configured. Please set GOOGLE_CALENDAR_API_KEY environment variable.")
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        # Add API key to params
        if params is None:
            params = {}
        params["key"] = self.api_key
        
        try:
            response = requests.request(
                method=method,
                url=url,
                params=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            logger.error(f"Google Calendar API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Google Calendar API request error: {str(e)}")
            raise
    
    def get_events(
        self,
        calendar_id: str = "primary",
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        max_results: int = 250
    ) -> List[Dict[str, Any]]:
        """
        Get events from a Google Calendar
        
        Args:
            calendar_id: Calendar ID (default: "primary" for user's primary calendar)
            time_min: Minimum time for events (RFC3339 format, e.g., "2024-01-01T00:00:00Z")
            time_max: Maximum time for events (RFC3339 format)
            max_results: Maximum number of results to return
            
        Returns:
            List of event dictionaries
        """
        params = {
            "calendarId": calendar_id,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime"
        }
        
        if time_min:
            params["timeMin"] = time_min
        else:
            # Default to current time
            params["timeMin"] = datetime.utcnow().isoformat() + "Z"
        
        if time_max:
            params["timeMax"] = time_max
        
        try:
            response = self._make_request("GET", "/calendars/{}/events".format(calendar_id), params=params)
            events = response.get("items", [])
            
            # Format events for our use case
            formatted_events = []
            for event in events:
                formatted_event = {
                    "id": event.get("id"),
                    "summary": event.get("summary", "No Title"),
                    "description": event.get("description", ""),
                    "location": event.get("location", ""),
                    "html_link": event.get("htmlLink", ""),
                    "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
                    "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
                    "attendees": event.get("attendees", []),
                    "organizer": event.get("organizer", {}).get("email", ""),
                    "status": event.get("status", "confirmed"),
                    "created": event.get("created", ""),
                    "updated": event.get("updated", ""),
                    "source": "google_calendar"
                }
                formatted_events.append(formatted_event)
            
            return formatted_events
        except Exception as e:
            logger.error(f"Error fetching Google Calendar events: {str(e)}", exc_info=True)
            return []
    
    def get_calendar_list(self) -> List[Dict[str, Any]]:
        """
        Get list of calendars accessible by the API key
        
        Returns:
            List of calendar dictionaries
        """
        try:
            response = self._make_request("GET", "/users/me/calendarList")
            calendars = response.get("items", [])
            
            formatted_calendars = []
            for cal in calendars:
                formatted_calendars.append({
                    "id": cal.get("id"),
                    "summary": cal.get("summary", "Untitled Calendar"),
                    "description": cal.get("description", ""),
                    "time_zone": cal.get("timeZone", "America/New_York"),
                    "primary": cal.get("primary", False)
                })
            
            return formatted_calendars
        except Exception as e:
            logger.error(f"Error fetching calendar list: {str(e)}", exc_info=True)
            return []

