"""
Debug endpoint to check email service configuration
"""
from fastapi import APIRouter, HTTPException
from email_service import email_service, SENDGRID_API_KEY, FROM_EMAIL, FROM_NAME, FRONTEND_URL
import os

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/email-config")
async def get_email_config():
    """
    Debug endpoint to check email service configuration.
    Shows what's configured without exposing sensitive data.
    """
    config = {
        "sendgrid_configured": bool(SENDGRID_API_KEY),
        "sendgrid_key_length": len(SENDGRID_API_KEY) if SENDGRID_API_KEY else 0,
        "sendgrid_key_preview": (SENDGRID_API_KEY[:10] + "..." + SENDGRID_API_KEY[-4]) if SENDGRID_API_KEY and len(SENDGRID_API_KEY) > 14 else None,
        "from_email": FROM_EMAIL,
        "from_name": FROM_NAME,
        "frontend_url": FRONTEND_URL,
        "email_service_client_initialized": email_service.client is not None,
        "environment_variables": {
            "SENDGRID_API_KEY": "SET" if os.getenv("SENDGRID_API_KEY") else "NOT SET",
            "FROM_EMAIL": os.getenv("FROM_EMAIL", "NOT SET"),
            "FROM_NAME": os.getenv("FROM_NAME", "NOT SET"),
            "FRONTEND_URL": os.getenv("FRONTEND_URL", "NOT SET"),
        }
    }
    return config


@router.post("/test-email")
async def test_email(email: str):
    """
    Test endpoint to send a test email.
    Only use this in development!
    """
    if not email:
        raise HTTPException(status_code=400, detail="Email address required")
    
    test_result = email_service.send_password_reset_email(
        to_email=email,
        reset_token="test-token-12345",
        user_name="Test User"
    )
    
    return {
        "email_sent": test_result,
        "message": "Test email sent" if test_result else "Failed to send test email. Check logs for details.",
        "recipient": email
    }

