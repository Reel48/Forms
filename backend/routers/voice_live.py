"""
Browser-only Gemini Live voice WebSocket (no phone calls).

Client flow:
1) POST /api/realtime/token  -> short-lived JWT (existing)
2) WS  /api/realtime/ws/voice?conversation_id=... with first message containing token (or pass token in query)
3) Stream PCM16 16kHz audio frames as base64
4) Receive PCM16 audio frames + optional transcript events
"""

import os
import json
import base64
import uuid
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from jose import jwt, JWTError

from database import supabase_storage

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


def _verify_realtime_token(token: str) -> str:
    secret = os.getenv("REALTIME_JWT_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="REALTIME_JWT_SECRET not configured")
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("typ") != "realtime":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return str(user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def _live_config() -> types.LiveConnectConfig:
    system_prompt = os.getenv(
        "VOICE_SYSTEM_PROMPT",
        "You are Reel48's assistant. Be helpful, concise, and natural. If the user starts speaking, stop talking.",
    )
    return types.LiveConnectConfig(
        response_modalities=["AUDIO", "TEXT"],
        system_instruction=system_prompt,
        input_audio_transcription=types.LiveInputAudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(activity_handling="START_OF_ACTIVITY_INTERRUPTS"),
    )


@router.websocket("/ws/voice")
async def ws_voice(ws: WebSocket):
    await ws.accept()

    conversation_id = ws.query_params.get("conversation_id")
    token_qs = ws.query_params.get("token")

    # First message can also contain token: {"type":"start","token":"..."}
    try:
        first = json.loads(await ws.receive_text())
    except Exception:
        first = {}

    token = (first.get("token") if isinstance(first, dict) else None) or token_qs or ""
    user_id = _verify_realtime_token(token)

    # Ensure conversation exists and belongs to this user (or is admin).
    # We only support customer voice here: customer_id must match.
    if conversation_id:
        try:
            conv = (
                supabase_storage
                .table("chat_conversations")
                .select("id, customer_id")
                .eq("id", conversation_id)
                .single()
                .execute()
            ).data
            if not conv:
                await ws.send_text(json.dumps({"type": "error", "message": "Conversation not found"}))
                await ws.close()
                return
            if str(conv.get("customer_id")) != str(user_id):
                await ws.send_text(json.dumps({"type": "error", "message": "Access denied"}))
                await ws.close()
                return
        except Exception:
            await ws.send_text(json.dumps({"type": "error", "message": "Failed to validate conversation"}))
            await ws.close()
            return

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
    client = _gemini_client()

    async def browser_in(session):
        # First message already consumed (may have only token)
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "audio":
                b64 = msg.get("data") or ""
                if not b64:
                    continue
                pcm16k = base64.b64decode(b64)
                await session.send_realtime_input(audio=types.Blob(data=pcm16k, mime_type="audio/pcm;rate=16000"))
            elif msg.get("type") == "stop":
                break

    async def browser_out(session):
        async for msg in session.receive():
            if not msg.server_content:
                continue

            it = getattr(msg.server_content, "input_transcription", None)
            if it and getattr(it, "text", None):
                # save caller transcript
                if conversation_id:
                    supabase_storage.table("chat_messages").insert(
                        {
                            "id": str(uuid.uuid4()),
                            "conversation_id": conversation_id,
                            "sender_id": user_id,
                            "message": it.text,
                            "message_type": "text",
                            "created_at": datetime.utcnow().isoformat(),
                        }
                    ).execute()

            ot = getattr(msg.server_content, "output_transcription", None)
            if ot and getattr(ot, "text", None):
                if conversation_id:
                    ocho = os.getenv("OCHO_USER_ID", "00000000-0000-0000-0000-000000000000")
                    supabase_storage.table("chat_messages").insert(
                        {
                            "id": str(uuid.uuid4()),
                            "conversation_id": conversation_id,
                            "sender_id": ocho,
                            "message": ot.text,
                            "message_type": "text",
                            "created_at": datetime.utcnow().isoformat(),
                        }
                    ).execute()

            model_turn = getattr(msg.server_content, "model_turn", None)
            if model_turn and getattr(model_turn, "parts", None):
                for part in model_turn.parts:
                    inline = getattr(part, "inline_data", None)
                    if not inline:
                        continue
                    mime = getattr(inline, "mime_type", "") or ""
                    data = getattr(inline, "data", None)
                    if not data:
                        continue
                    if "audio/pcm" in mime:
                        # Send PCM back to client (assume 16k or 24k; client can play at provided rate)
                        rate = 16000
                        if "rate=24000" in mime:
                            rate = 24000
                        await ws.send_text(json.dumps({"type": "audio", "data": base64.b64encode(data).decode("utf-8"), "rate": rate}))

    try:
        async with client.aio.live.connect(model=model, config=_live_config()) as session:
            import asyncio
            t1 = asyncio.create_task(browser_in(session))
            t2 = asyncio.create_task(browser_out(session))
            done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                p.cancel()
            for d in done:
                exc = d.exception()
                if exc:
                    raise exc
    except WebSocketDisconnect:
        return
    except Exception as e:
        logger.warning("voice ws error: %s", str(e), exc_info=True)
        try:
            await ws.send_text(json.dumps({"type": "error", "message": "Voice session failed"}))
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass

