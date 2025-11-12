"""
Debug endpoint to check email service configuration
"""
from fastapi import APIRouter, HTTPException
from email_service import email_service, EMAIL_PROVIDER, FROM_EMAIL, FROM_NAME, FRONTEND_URL
import os

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/email-config")
async def get_email_config():
    """
    Debug endpoint to check email service configuration.
    Shows what's configured without exposing sensitive data.
    """
    # Get provider-specific config (always SES)
    provider_config = {
        "aws_region": os.getenv("AWS_REGION", "us-east-1"),
        "ses_configured": True,  # SES uses IAM role, no API key needed
    }
    
    config = {
        "email_provider": EMAIL_PROVIDER,
        "provider_config": provider_config,
        "from_email": FROM_EMAIL,
        "from_name": FROM_NAME,
        "frontend_url": FRONTEND_URL,
        "email_service_client_initialized": email_service.client is not None,
        "environment_variables": {
            "EMAIL_PROVIDER": "ses",
            "FROM_EMAIL": os.getenv("FROM_EMAIL", "NOT SET"),
            "FROM_NAME": os.getenv("FROM_NAME", "NOT SET"),
            "FRONTEND_URL": os.getenv("FRONTEND_URL", "NOT SET"),
            "AWS_REGION": os.getenv("AWS_REGION", "NOT SET"),
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

