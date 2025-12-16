import os
import uuid
import json
import base64
import logging
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple

import audioop
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import PlainTextResponse
from jose import jwt, JWTError
from supabase import create_client

from google import genai
from google.genai import types
import webrtcvad

logger = logging.getLogger("realtime")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI()


# -------------------------
# Config
# -------------------------
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip()  # e.g. https://voice.reel48.app
REALTIME_JWT_SECRET = os.getenv("REALTIME_JWT_SECRET", "").strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()

OCHO_USER_ID = os.getenv("OCHO_USER_ID", "00000000-0000-0000-0000-000000000000")

SYSTEM_PROMPT_CALL = os.getenv(
    "VOICE_SYSTEM_PROMPT",
    "You are Reel48's customer service assistant. Be concise, friendly, and helpful. "
    "Ask clarifying questions when needed. If interrupted, stop speaking immediately.",
)
OPENING_GREETING = os.getenv(
    "VOICE_OPENING_GREETING",
    "Thanks for calling Reel48. One moment while I connect you to our assistant.",
)


def _require_env(name: str) -> str:
    v = os.getenv(name, "").strip()
    if not v:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return v


def _supabase():
    return create_client(_require_env("SUPABASE_URL"), _require_env("SUPABASE_SERVICE_ROLE_KEY"))


# -------------------------
# Utilities: phone normalize
# -------------------------
def normalize_phone_e164(phone: str) -> str:
    raw = (phone or "").strip()
    if not raw:
        return ""
    if raw.startswith("+"):
        digits = raw[1:]
        if digits.isdigit() and 8 <= len(digits) <= 15 and digits[0] != "0":
            return f"+{digits}"
        return ""
    digits_only = "".join(ch for ch in raw if ch.isdigit())
    if len(digits_only) == 10:
        return f"+1{digits_only}"
    if len(digits_only) == 11 and digits_only.startswith("1"):
        return f"+{digits_only}"
    return ""


# -------------------------
# Twilio signature verify (optional but recommended)
# -------------------------
def _twilio_signature_valid(request_url: str, form: Dict[str, Any], provided_signature: str) -> bool:
    if not TWILIO_AUTH_TOKEN or not provided_signature:
        return False
    items = sorted((k, v) for k, v in form.items())
    data = request_url + "".join([f"{k}{v}" for k, v in items])
    mac = hmac.new(TWILIO_AUTH_TOKEN.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(mac).decode("utf-8")
    return hmac.compare_digest(expected, provided_signature)


def _public_ws_url(path: str) -> str:
    if not PUBLIC_BASE_URL:
        raise HTTPException(status_code=500, detail="PUBLIC_BASE_URL not configured")
    base = PUBLIC_BASE_URL
    # Convert https->wss, http->ws
    if base.startswith("https://"):
        base = "wss://" + base[len("https://"):]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://"):]
    return base.rstrip("/") + path


# -------------------------
# Auth for browser voice
# -------------------------
def _verify_realtime_token(token: str) -> Dict[str, Any]:
    if not REALTIME_JWT_SECRET:
        raise HTTPException(status_code=500, detail="REALTIME_JWT_SECRET not configured")
    try:
        payload = jwt.decode(token, REALTIME_JWT_SECRET, algorithms=["HS256"])
        if payload.get("typ") != "realtime":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# -------------------------
# Audio conversion helpers
# -------------------------
def ulaw8k_to_pcm16_16k(ulaw_bytes: bytes) -> bytes:
    pcm8k = audioop.ulaw2lin(ulaw_bytes, 2)  # 16-bit PCM, 8k
    pcm16k, _ = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, None)
    return pcm16k


def pcm16_16k_to_ulaw8k(pcm16k: bytes) -> bytes:
    pcm8k, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)
    ulaw = audioop.lin2ulaw(pcm8k, 2)
    return ulaw


def pcm16_16k_to_pcm16_24k(pcm16k: bytes) -> bytes:
    pcm24k, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 24000, None)
    return pcm24k


def pcm16_24k_to_pcm16_16k(pcm24k: bytes) -> bytes:
    pcm16k, _ = audioop.ratecv(pcm24k, 2, 1, 24000, 16000, None)
    return pcm16k


def _chunk_pcm16(pcm: bytes, sample_rate: int, ms: int = 20) -> list[bytes]:
    # 16-bit mono: 2 bytes/sample
    samples = int(sample_rate * ms / 1000)
    step = samples * 2
    return [pcm[i : i + step] for i in range(0, len(pcm), step) if len(pcm[i : i + step]) == step]


# -------------------------
# Supabase persistence
# -------------------------
def _ensure_voice_session(
    *,
    sb,
    channel: str,
    call_sid: Optional[str],
    stream_sid: Optional[str],
    from_phone: Optional[str],
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Returns (voice_session_id, client_id, user_id)
    - If caller matches an existing client, attach.
    - Else create a minimal client stub (per requirement).
    """
    from_e164 = normalize_phone_e164(from_phone or "")

    client_row = None
    if from_e164:
        try:
            q = (
                sb.table("clients")
                .select("id, user_id, phone_e164, phone")
                .or_(f"phone_e164.eq.{from_e164},phone.eq.{from_e164}")
                .limit(1)
                .execute()
            )
            if q.data:
                client_row = q.data[0]
        except Exception:
            client_row = None

    if not client_row and from_e164:
        # Create client stub
        try:
            ins = (
                sb.table("clients")
                .insert(
                    {
                        "name": "Unknown caller",
                        "phone_e164": from_e164,
                        "phone": from_e164,
                        "registration_source": "admin_created",
                    }
                )
                .execute()
            )
            if ins.data:
                client_row = ins.data[0]
        except Exception as e:
            logger.warning("Failed to create client stub: %s", str(e))

    client_id = (client_row or {}).get("id")
    user_id = (client_row or {}).get("user_id")

    voice_session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    try:
        sb.table("voice_sessions").insert(
            {
                "id": voice_session_id,
                "channel": channel,
                "user_id": user_id,
                "client_id": client_id,
                "call_sid": call_sid,
                "stream_sid": stream_sid,
                "from_phone": from_e164 or (from_phone or None),
                "status": "active",
                "started_at": now,
                "metadata": {},
            }
        ).execute()
    except Exception as e:
        logger.warning("Failed to insert voice_session: %s", str(e))

    return voice_session_id, client_id, user_id


def _append_voice_message(sb, voice_session_id: str, sender: str, text: str) -> None:
    try:
        sb.table("voice_messages").insert(
            {
                "id": str(uuid.uuid4()),
                "voice_session_id": voice_session_id,
                "sender": sender,
                "text": text,
                "created_at": datetime.utcnow().isoformat(),
            }
        ).execute()
    except Exception:
        pass


def _mirror_to_chat(sb, user_id: Optional[str], sender_id: str, text: str) -> None:
    """
    If we can map to a real auth user, mirror into the existing chat tables.
    This respects the UNIQUE(customer_id) constraint on chat_conversations.
    """
    if not user_id:
        return
    try:
        existing = sb.table("chat_conversations").select("id").eq("customer_id", user_id).execute()
        if existing.data:
            conv_id = existing.data[0]["id"]
        else:
            conv = {
                "id": str(uuid.uuid4()),
                "customer_id": user_id,
                "status": "active",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            created = sb.table("chat_conversations").insert(conv).execute()
            conv_id = created.data[0]["id"] if created.data else None
        if not conv_id:
            return
        sb.table("chat_messages").insert(
            {
                "id": str(uuid.uuid4()),
                "conversation_id": conv_id,
                "sender_id": sender_id,
                "message": text,
                "message_type": "text",
                "created_at": datetime.utcnow().isoformat(),
            }
        ).execute()
        sb.table("chat_conversations").update(
            {"last_message_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", conv_id).execute()
    except Exception:
        pass


# -------------------------
# Gemini Live session
# -------------------------
def _gemini_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


def _live_config() -> types.LiveConnectConfig:
    # Enable input transcription; request audio+text responses.
    # Barge-in: START_OF_ACTIVITY_INTERRUPTS (best-effort; server still clears Twilio buffer).
    return types.LiveConnectConfig(
        response_modalities=["AUDIO", "TEXT"],
        system_instruction=SYSTEM_PROMPT_CALL,
        input_audio_transcription=types.LiveInputAudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(activity_handling="START_OF_ACTIVITY_INTERRUPTS"),
    )


# -------------------------
# HTTP endpoints
# -------------------------
@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/twilio/voice", response_class=PlainTextResponse)
async def twilio_voice(request: Request):
    """
    Twilio Voice webhook. Returns TwiML that:
    1) Speaks a fast, static greeting (<Say>) for perceived low latency
    2) Starts Media Streams to our WebSocket bridge (<Connect><Stream>)
    """
    form = await request.form()
    form_dict = {k: form.get(k) for k in form.keys()}

    # Best-effort signature verify (only if TWILIO_AUTH_TOKEN is set).
    sig = request.headers.get("X-Twilio-Signature", "")
    # Twilio signs the full URL; if behind proxy, PUBLIC_BASE_URL should match.
    url_for_sig = (PUBLIC_BASE_URL.rstrip("/") + str(request.url.path)) if PUBLIC_BASE_URL else str(request.url)
    if TWILIO_AUTH_TOKEN:
        if not _twilio_signature_valid(url_for_sig, form_dict, sig):
            raise HTTPException(status_code=401, detail="Invalid Twilio signature")

    ws_url = _public_ws_url("/ws/twilio-media")
    # Pass From and CallSid as custom parameters so start event includes them.
    from_phone = form_dict.get("From") or ""
    call_sid = form_dict.get("CallSid") or ""

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">{OPENING_GREETING}</Say>
  <Connect>
    <Stream url="{ws_url}">
      <Parameter name="from" value="{from_phone}"/>
      <Parameter name="callSid" value="{call_sid}"/>
    </Stream>
  </Connect>
</Response>"""
    return twiml


# -------------------------
# Twilio Media Streams WebSocket
# -------------------------
@app.websocket("/ws/twilio-media")
async def ws_twilio_media(ws: WebSocket):
    await ws.accept()
    sb = _supabase()
    client = _gemini_client()

    stream_sid: Optional[str] = None
    call_sid: Optional[str] = None
    from_phone: Optional[str] = None
    voice_session_id: Optional[str] = None
    mapped_user_id: Optional[str] = None

    vad = webrtcvad.Vad(2)
    user_speaking = False

    async def send_twilio_clear():
        if stream_sid:
            try:
                await ws.send_text(json.dumps({"event": "clear", "streamSid": stream_sid}))
            except Exception:
                pass

    try:
        async with client.aio.live.connect(model=GEMINI_MODEL, config=_live_config()) as session:
            # Outbound reader: Gemini -> Twilio
            async def gemini_to_twilio():
                nonlocal voice_session_id
                async for msg in session.receive():
                    if not msg.server_content:
                        continue

                    # Input transcription (caller)
                    it = getattr(msg.server_content, "input_transcription", None)
                    if it and getattr(it, "text", None) and voice_session_id:
                        text = it.text
                        _append_voice_message(sb, voice_session_id, "caller", text)
                        _mirror_to_chat(sb, mapped_user_id, mapped_user_id or "", text)  # caller in chat if user exists

                    # Model output transcription (AI)
                    ot = getattr(msg.server_content, "output_transcription", None)
                    if ot and getattr(ot, "text", None) and voice_session_id:
                        text = ot.text
                        _append_voice_message(sb, voice_session_id, "ai", text)
                        _mirror_to_chat(sb, mapped_user_id, OCHO_USER_ID, text)

                    # Audio parts
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
                                # Gemini audio may be 24k; downsample to 16k then to Twilio ulaw 8k
                                pcm = data
                                if "rate=24000" in mime:
                                    pcm = pcm16_24k_to_pcm16_16k(pcm)
                                ulaw = pcm16_16k_to_ulaw8k(pcm)
                                payload = base64.b64encode(ulaw).decode("utf-8")
                                if stream_sid:
                                    await ws.send_text(json.dumps({"event": "media", "streamSid": stream_sid, "media": {"payload": payload}}))

            # Inbound reader: Twilio -> Gemini
            async def twilio_to_gemini():
                nonlocal stream_sid, call_sid, from_phone, voice_session_id, mapped_user_id, user_speaking

                while True:
                    data = await ws.receive_text()
                    event = json.loads(data)
                    et = event.get("event")

                    if et == "start":
                        stream_sid = event.get("streamSid") or (event.get("start") or {}).get("streamSid")
                        start = event.get("start") or {}
                        call_sid = start.get("callSid") or call_sid
                        cp = start.get("customParameters") or {}
                        from_phone = cp.get("from") or from_phone
                        call_sid = cp.get("callSid") or call_sid

                        voice_session_id, _client_id, mapped_user_id = _ensure_voice_session(
                            sb=sb,
                            channel="twilio",
                            call_sid=call_sid,
                            stream_sid=stream_sid,
                            from_phone=from_phone,
                        )
                        if voice_session_id:
                            _append_voice_message(sb, voice_session_id, "system", "call_started")

                    elif et == "media":
                        media = event.get("media") or {}
                        payload_b64 = media.get("payload") or ""
                        if not payload_b64:
                            continue
                        ulaw = base64.b64decode(payload_b64)
                        pcm16k = ulaw8k_to_pcm16_16k(ulaw)

                        # VAD on 20ms frames
                        speaking_now = False
                        for frame in _chunk_pcm16(pcm16k, 16000, 20):
                            try:
                                if vad.is_speech(frame, 16000):
                                    speaking_now = True
                                    break
                            except Exception:
                                continue

                        # Barge-in: if user starts speaking while model audio is being played, clear Twilio buffer.
                        if speaking_now and not user_speaking:
                            user_speaking = True
                            await send_twilio_clear()
                        if not speaking_now:
                            user_speaking = False

                        await session.send_realtime_input(audio=types.Blob(data=pcm16k, mime_type="audio/pcm;rate=16000"))

                    elif et == "mark":
                        # Playback marker, can be used to track when audio finished.
                        pass
                    elif et == "stop":
                        break

            await _run_pair(twilio_to_gemini(), gemini_to_twilio())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("twilio ws error: %s", str(e), exc_info=True)
    finally:
        if voice_session_id:
            try:
                sb.table("voice_sessions").update(
                    {"status": "ended", "ended_at": datetime.utcnow().isoformat()}
                ).eq("id", voice_session_id).execute()
            except Exception:
                pass


# -------------------------
# Browser Voice WebSocket
# -------------------------
@app.websocket("/ws/browser-voice")
async def ws_browser_voice(ws: WebSocket):
    await ws.accept()
    sb = _supabase()
    client = _gemini_client()

    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    voice_session_id: Optional[str] = None

    try:
        # Expect first message: {"type":"start","token":"...","conversation_id":"..."}
        hello = json.loads(await ws.receive_text())
        if hello.get("type") != "start":
            raise HTTPException(status_code=400, detail="Expected start message")
        token = hello.get("token") or ""
        payload = _verify_realtime_token(token)
        user_id = payload.get("user_id")
        conversation_id = hello.get("conversation_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Missing user")

        voice_session_id = str(uuid.uuid4())
        sb.table("voice_sessions").insert(
            {
                "id": voice_session_id,
                "channel": "browser",
                "user_id": user_id,
                "client_id": None,
                "call_sid": None,
                "stream_sid": None,
                "from_phone": None,
                "status": "active",
                "started_at": datetime.utcnow().isoformat(),
                "metadata": {"conversation_id": conversation_id},
            }
        ).execute()

        async with client.aio.live.connect(model=GEMINI_MODEL, config=_live_config()) as session:
            async def browser_in():
                while True:
                    msg = json.loads(await ws.receive_text())
                    if msg.get("type") == "audio":
                        b64 = msg.get("data") or ""
                        if not b64:
                            continue
                        pcm16k = base64.b64decode(b64)
                        await session.send_realtime_input(audio=types.Blob(data=pcm16k, mime_type="audio/pcm;rate=16000"))
                    elif msg.get("type") == "stop":
                        break

            async def browser_out():
                async for msg in session.receive():
                    if not msg.server_content:
                        continue
                    it = getattr(msg.server_content, "input_transcription", None)
                    if it and getattr(it, "text", None) and voice_session_id:
                        _append_voice_message(sb, voice_session_id, "caller", it.text)
                        # optional mirror to chat
                        if conversation_id:
                            sb.table("chat_messages").insert(
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
                    if ot and getattr(ot, "text", None) and voice_session_id:
                        _append_voice_message(sb, voice_session_id, "ai", ot.text)
                        if conversation_id:
                            sb.table("chat_messages").insert(
                                {
                                    "id": str(uuid.uuid4()),
                                    "conversation_id": conversation_id,
                                    "sender_id": OCHO_USER_ID,
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
                                pcm = data
                                # Browser expects 16k pcm16
                                if "rate=24000" in mime:
                                    pcm = pcm16_24k_to_pcm16_16k(pcm)
                                await ws.send_text(json.dumps({"type": "audio", "data": base64.b64encode(pcm).decode("utf-8"), "rate": 16000}))

            await _run_pair(browser_in(), browser_out())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("browser ws error: %s", str(e), exc_info=True)
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        if voice_session_id:
            try:
                sb.table("voice_sessions").update(
                    {"status": "ended", "ended_at": datetime.utcnow().isoformat()}
                ).eq("id", voice_session_id).execute()
            except Exception:
                pass


async def _run_pair(task_a, task_b):
    import asyncio
    t1 = asyncio.create_task(task_a)
    t2 = asyncio.create_task(task_b)
    done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
    for p in pending:
        p.cancel()
    # re-raise exceptions if any
    for d in done:
        exc = d.exception()
        if exc:
            raise exc

