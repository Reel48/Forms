"""SMS service (Twilio Verify + Messaging Service).

- Verify is used for OTP-based opt-in.
- Messaging Service is used for outbound notifications.
"""

from __future__ import annotations

import os
import logging
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)


def _env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _auth() -> tuple[str, str]:
    return (_env("TWILIO_ACCOUNT_SID"), _env("TWILIO_AUTH_TOKEN"))


def start_verify(*, to: str, channel: str = "sms") -> Dict[str, Any]:
    """Start OTP verification for a phone number (E.164)."""
    service_sid = _env("TWILIO_VERIFY_SERVICE_SID")
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"

    resp = requests.post(
        url,
        data={"To": to, "Channel": channel},
        auth=_auth(),
        timeout=10,
    )

    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text}

    if resp.status_code not in (200, 201):
        logger.warning("Twilio Verify start failed (status=%s)", resp.status_code)
        raise RuntimeError("Failed to start verification")

    return data


def check_verify(*, to: str, code: str) -> bool:
    """Check OTP verification code. Returns True if approved."""
    service_sid = _env("TWILIO_VERIFY_SERVICE_SID")
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck"

    resp = requests.post(
        url,
        data={"To": to, "Code": code},
        auth=_auth(),
        timeout=10,
    )

    if resp.status_code not in (200, 201):
        logger.warning("Twilio Verify check failed (status=%s)", resp.status_code)
        return False

    try:
        data = resp.json()
    except Exception:
        return False

    return (data or {}).get("status") == "approved"


def send_notification(*, to: str, body: str) -> Optional[str]:
    """Send an outbound SMS via Twilio Messaging Service. Returns Message SID if sent."""
    account_sid = _env("TWILIO_ACCOUNT_SID")
    messaging_service_sid = _env("TWILIO_MESSAGING_SERVICE_SID")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    resp = requests.post(
        url,
        data={
            "To": to,
            "MessagingServiceSid": messaging_service_sid,
            "Body": body,
        },
        auth=_auth(),
        timeout=10,
    )

    if resp.status_code not in (200, 201):
        logger.warning("Twilio send SMS failed (status=%s)", resp.status_code)
        return None

    try:
        data = resp.json()
    except Exception:
        return None

    return (data or {}).get("sid")

