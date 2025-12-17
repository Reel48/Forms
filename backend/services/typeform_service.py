"""
Typeform API Service
Handles all interactions with the Typeform API
"""
import os
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class TypeformService:
    """Service for interacting with Typeform API"""
    
    BASE_URL = "https://api.typeform.com"
    
    def __init__(self, personal_token: Optional[str] = None):
        """
        Initialize Typeform service
        
        Args:
            personal_token: Typeform Personal Token. If not provided, will try to get from env.
        """
        self.personal_token = personal_token or os.getenv("TYPEFORM_PERSONAL_TOKEN")
        if not self.personal_token:
            raise ValueError("Typeform Personal Token is required. Set TYPEFORM_PERSONAL_TOKEN environment variable.")
        
        self.headers = {
            "Authorization": f"Bearer {self.personal_token}",
            "Content-Type": "application/json"
        }
    
    def _make_request(self, method: str, endpoint: str, params: Optional[Dict] = None, data: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make a request to Typeform API
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (without base URL)
            params: Query parameters
            data: Request body data
            
        Returns:
            Response JSON data
            
        Raises:
            Exception: If request fails
        """
        url = f"{self.BASE_URL}{endpoint}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                params=params,
                json=data,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            error_msg = f"Typeform API error: {e.response.status_code}"
            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('message', 'Unknown error')}"
            except:
                error_msg += f" - {e.response.text}"
            logger.error(error_msg)
            raise Exception(error_msg)
        except requests.exceptions.RequestException as e:
            error_msg = f"Typeform API request failed: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def get_workspaces(self) -> List[Dict[str, Any]]:
        """
        Get list of available workspaces
        
        Returns:
            List of workspace objects
        """
        try:
            response = self._make_request("GET", "/workspaces")
            return response.get("items", [])
        except Exception as e:
            logger.error(f"Failed to get workspaces: {str(e)}")
            raise
    
    def get_forms(self, workspace_id: Optional[str] = None, page_size: int = 200) -> List[Dict[str, Any]]:
        """
        Get list of forms
        
        Args:
            workspace_id: Optional workspace ID to filter forms
            page_size: Number of forms per page (max 200)
            
        Returns:
            List of form objects
        """
        try:
            params = {"page_size": min(page_size, 200)}
            if workspace_id:
                params["workspace_id"] = workspace_id
            
            response = self._make_request("GET", "/forms", params=params)
            return response.get("items", [])
        except Exception as e:
            logger.error(f"Failed to get forms: {str(e)}")
            raise
    
    def get_form(self, form_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific form
        
        Args:
            form_id: Typeform form ID
            
        Returns:
            Form object with full details
        """
        try:
            return self._make_request("GET", f"/forms/{form_id}")
        except Exception as e:
            logger.error(f"Failed to get form {form_id}: {str(e)}")
            raise
    
    def get_form_responses(self, form_id: str, page_size: int = 1000, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """
        Get form responses/submissions
        
        Args:
            form_id: Typeform form ID
            page_size: Number of responses per page (max 1000)
            since: Optional datetime to get responses since a specific time
            
        Returns:
            List of response objects
        """
        try:
            params = {"page_size": min(page_size, 1000)}
            if since:
                # Typeform expects ISO 8601 format
                params["since"] = since.isoformat()
            
            response = self._make_request("GET", f"/forms/{form_id}/responses", params=params)
            return response.get("items", [])
        except Exception as e:
            logger.error(f"Failed to get form responses for {form_id}: {str(e)}")
            raise
    
    def create_form_webhook(self, form_id: str, webhook_url: str, tag: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a webhook for a form (optional for future use)
        
        Args:
            form_id: Typeform form ID
            webhook_url: URL to receive webhook events
            tag: Optional tag for the webhook
            
        Returns:
            Webhook object
        """
        try:
            data = {
                "url": webhook_url,
                "enabled": True
            }
            if tag:
                data["tag"] = tag
            
            return self._make_request("PUT", f"/forms/{form_id}/webhooks/{tag or 'default'}", data=data)
        except Exception as e:
            logger.error(f"Failed to create webhook for form {form_id}: {str(e)}")
            raise

