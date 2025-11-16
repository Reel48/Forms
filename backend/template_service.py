"""
Template service for rendering custom email templates
"""
import re
import logging
from typing import Dict, Any, Optional
from database import supabase

logger = logging.getLogger(__name__)

class TemplateService:
    """Service for loading and rendering email templates"""
    
    def __init__(self):
        pass
    
    def render_template(self, template_content: str, variables: Dict[str, Any]) -> str:
        """
        Render a template string with variables
        
        Supports {{variable_name}} syntax
        
        Args:
            template_content: Template string with {{variable}} placeholders
            variables: Dictionary of variable names to values
            
        Returns:
            Rendered template string
        """
        result = template_content
        
        # Replace all {{variable}} with actual values
        for key, value in variables.items():
            # Handle None values
            if value is None:
                value = ""
            # Convert to string
            value_str = str(value)
            # Replace all occurrences
            result = result.replace(f"{{{{{key}}}}}", value_str)
        
        return result
    
    def get_template(self, template_type: str) -> Optional[Dict[str, Any]]:
        """
        Get the default template for a given type
        
        Args:
            template_type: Type of template (e.g., 'form_submission_admin')
            
        Returns:
            Template dict with subject, html_body, text_body, or None if not found
        """
        try:
            # Get default template for this type
            response = supabase_storage.table("email_templates").select("*").eq("template_type", template_type).eq("is_default", True).single().execute()
            
            if response.data:
                return response.data
            
            # If no default, get any template of this type
            response = supabase_storage.table("email_templates").select("*").eq("template_type", template_type).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error loading template for type {template_type}: {str(e)}")
            return None
    
    def get_default_variables(self, template_type: str) -> Dict[str, str]:
        """
        Get default variables available for a template type
        
        Args:
            template_type: Type of template
            
        Returns:
            Dictionary of variable names to descriptions
        """
        defaults = {
            "form_submission_admin": {
                "form_name": "The name of the form",
                "form_id": "The ID of the form",
                "submission_id": "The ID of the submission",
                "submitter_name": "Name of the person who submitted (if provided)",
                "submitter_email": "Email of the person who submitted (if provided)",
                "submission_link": "Link to view the submission",
                "submission_date": "Date and time of submission",
            },
            "form_submission_user": {
                "form_name": "The name of the form",
                "submission_id": "The ID of the submission",
                "submission_date": "Date and time of submission",
            },
            "password_reset": {
                "reset_link": "Link to reset password",
                "user_name": "Name of the user",
            },
        }
        
        return defaults.get(template_type, {})

# Global template service instance
template_service = TemplateService()

