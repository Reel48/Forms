"""
Attachment processing utilities for chat.

Goals:
- Extract bounded text from common document types (txt/csv/pdf/docx) for RAG grounding
- Provide image bytes for multimodal Gemini calls when available
"""

from __future__ import annotations

import io
import mimetypes
import os
from dataclasses import dataclass
from typing import Optional, Tuple

import logging
import requests

logger = logging.getLogger(__name__)

DEFAULT_MAX_BYTES = int(os.getenv("CHAT_ATTACHMENT_MAX_BYTES", str(2 * 1024 * 1024)))  # 2MB
DEFAULT_MAX_TEXT_CHARS = int(os.getenv("CHAT_ATTACHMENT_MAX_TEXT_CHARS", "12000"))


@dataclass
class DownloadedAttachment:
    data: bytes
    mime_type: str


def _guess_mime_type(file_name: Optional[str], url: str, fallback: str = "application/octet-stream") -> str:
    name = file_name or ""
    mime, _ = mimetypes.guess_type(name)
    if mime:
        return mime
    mime, _ = mimetypes.guess_type(url)
    return mime or fallback


def download_attachment(file_url: str, file_name: Optional[str] = None, max_bytes: int = DEFAULT_MAX_BYTES) -> Optional[DownloadedAttachment]:
    try:
        resp = requests.get(file_url, timeout=15)
        resp.raise_for_status()
        data = resp.content
        if max_bytes and len(data) > max_bytes:
            logger.warning(f"Attachment exceeds max_bytes ({len(data)} > {max_bytes}); skipping download")
            return None
        mime_type = resp.headers.get("content-type") or _guess_mime_type(file_name, file_url)
        return DownloadedAttachment(data=data, mime_type=mime_type)
    except Exception as e:
        logger.warning(f"Failed to download attachment: {str(e)}")
        return None


def extract_text_from_attachment_bytes(data: bytes, mime_type: str, file_name: Optional[str] = None, max_chars: int = DEFAULT_MAX_TEXT_CHARS) -> str:
    mime = (mime_type or "").lower()
    name = (file_name or "").lower()

    # Plain text / CSV
    if mime.startswith("text/") or name.endswith((".txt", ".csv")):
        try:
            text = data.decode("utf-8", errors="replace")
            return text[:max_chars]
        except Exception:
            return ""

    # PDF
    if "pdf" in mime or name.endswith(".pdf"):
        try:
            # Prefer pypdf, fallback to PyPDF2 if present
            try:
                from pypdf import PdfReader  # type: ignore
            except Exception:
                from PyPDF2 import PdfReader  # type: ignore

            reader = PdfReader(io.BytesIO(data))
            parts = []
            for page in reader.pages[:20]:
                try:
                    parts.append(page.extract_text() or "")
                except Exception:
                    continue
            text = "\n".join([p for p in parts if p]).strip()
            return text[:max_chars]
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {str(e)}")
            return ""

    # DOCX
    if "word" in mime or name.endswith(".docx"):
        try:
            import docx  # type: ignore

            doc = docx.Document(io.BytesIO(data))
            text = "\n".join([p.text for p in doc.paragraphs if p.text]).strip()
            return text[:max_chars]
        except Exception as e:
            logger.warning(f"DOCX text extraction failed: {str(e)}")
            return ""

    return ""

