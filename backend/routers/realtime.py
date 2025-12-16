"""
Realtime token minting for voice (Gemini Live bridge).

Frontend requests a short-lived token, then connects directly to the realtime service via WebSocket.
"""

import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt

from auth import get_current_user

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.post("/token")
async def mint_realtime_token(current_user: dict = Depends(get_current_user)):
    secret = os.getenv("REALTIME_JWT_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="REALTIME_JWT_SECRET not configured")

    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=10)

    token = jwt.encode(
        {
            "typ": "realtime",
            "user_id": user_id,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        },
        secret,
        algorithm="HS256",
    )

    return {"token": token, "expires_at": exp.isoformat()}

