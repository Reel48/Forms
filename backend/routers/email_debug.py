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
    # Get provider-specific config
    provider_config = {}
    if EMAIL_PROVIDER == "sendgrid":
        sendgrid_key = os.getenv("SENDGRID_API_KEY")
        provider_config = {
            "sendgrid_configured": bool(sendgrid_key),
            "sendgrid_key_length": len(sendgrid_key) if sendgrid_key else 0,
            "sendgrid_key_preview": (sendgrid_key[:10] + "..." + sendgrid_key[-4]) if sendgrid_key and len(sendgrid_key) > 14 else None,
        }
    elif EMAIL_PROVIDER == "resend":
        resend_key = os.getenv("RESEND_API_KEY")
        provider_config = {
            "resend_configured": bool(resend_key),
            "resend_key_length": len(resend_key) if resend_key else 0,
        }
    elif EMAIL_PROVIDER == "brevo":
        brevo_key = os.getenv("BREVO_API_KEY")
        provider_config = {
            "brevo_configured": bool(brevo_key),
            "brevo_key_length": len(brevo_key) if brevo_key else 0,
        }
    elif EMAIL_PROVIDER == "ses":
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
            "EMAIL_PROVIDER": os.getenv("EMAIL_PROVIDER", "ses"),
            "FROM_EMAIL": os.getenv("FROM_EMAIL", "NOT SET"),
            "FROM_NAME": os.getenv("FROM_NAME", "NOT SET"),
            "FRONTEND_URL": os.getenv("FRONTEND_URL", "NOT SET"),
            "AWS_REGION": os.getenv("AWS_REGION", "NOT SET"),
            "SENDGRID_API_KEY": "SET" if os.getenv("SENDGRID_API_KEY") else "NOT SET",
            "RESEND_API_KEY": "SET" if os.getenv("RESEND_API_KEY") else "NOT SET",
            "BREVO_API_KEY": "SET" if os.getenv("BREVO_API_KEY") else "NOT SET",
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

