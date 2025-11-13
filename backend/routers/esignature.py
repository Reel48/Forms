from fastapi import APIRouter, HTTPException, Query, Depends, Request
from fastapi.responses import Response, StreamingResponse
from typing import List, Optional, Dict, Any
import sys
import os
import uuid
import base64
import io
import hashlib
from datetime import datetime
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import (
    ESignatureDocument, ESignatureDocumentCreate, ESignatureDocumentUpdate,
    ESignatureSignature, ESignatureSignatureCreate,
    ESignatureDocumentFolderAssignment, ESignatureDocumentFolderAssignmentCreate
)
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/api/esignature", tags=["esignature"])

# PDF manipulation imports
try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from PIL import Image
    PDF_LIBRARIES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: PDF libraries not available: {e}")
    PDF_LIBRARIES_AVAILABLE = False

@router.get("/documents", response_model=List[ESignatureDocument])
async def list_documents(
    folder_id: Optional[str] = Query(None, description="Filter by folder ID"),
    quote_id: Optional[str] = Query(None, description="Filter by quote ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    signature_mode: Optional[str] = Query(None, description="Filter by signature mode"),
    user = Depends(get_current_user)
):
    """List e-signature documents. Admins see all, users see documents they created or have access to."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        query = supabase.table("esignature_documents").select("*")
        
        # Apply filters
        if folder_id:
            query = query.eq("folder_id", folder_id)
        if quote_id:
            query = query.eq("quote_id", quote_id)
        if status:
            query = query.eq("status", status)
        if signature_mode:
            query = query.eq("signature_mode", signature_mode)
        
        # If not admin, filter by access
        if not is_admin:
            # Get folders user has access to (if folder_assignments table exists)
            accessible_folder_ids = []
            try:
                folder_assignments = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                accessible_folder_ids = [fa["folder_id"] for fa in folder_assignments.data] if folder_assignments.data else []
            except Exception:
                pass
            
            # Filter: documents user created OR documents in accessible folders
            if accessible_folder_ids:
                query = query.or_(
                    f"folder_id.in.({','.join(accessible_folder_ids)})",
                    f"created_by.eq.{user['id']}"
                )
            else:
                query = query.eq("created_by", user["id"])
        
        response = query.order("created_at", desc=True).execute()
        return response.data if response.data else []
    except Exception as e:
        print(f"Error listing e-signature documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")

@router.get("/documents/{document_id}", response_model=ESignatureDocument)
async def get_document(document_id: str, user = Depends(get_current_user)):
    """Get e-signature document by ID."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        response = supabase.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = response.data
        
        # Check access if not admin
        if not is_admin:
            if document.get("created_by") != user["id"]:
                # Check folder access
                folder_id = document.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        # If folder_assignments doesn't exist, only creator can access
                        raise HTTPException(status_code=403, detail="Access denied")
                else:
                    raise HTTPException(status_code=403, detail="Access denied")
        
        return document
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(e)}")

@router.post("/documents", response_model=ESignatureDocument)
async def create_document(
    document: ESignatureDocumentCreate,
    user = Depends(get_current_user)
):
    """Create a new e-signature document."""
    try:
        # Verify file exists
        file_response = supabase.table("files").select("id").eq("id", document.file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Create document record - exclude created_by from dump since we set it manually
        # Use mode='json' to ensure all values are JSON-serializable (datetime -> ISO string)
        document_data = document.model_dump(exclude_none=True, exclude={"created_by"}, mode='json')
        document_data["created_by"] = user["id"]
        document_data["status"] = "pending"
        
        # Only include fields that exist in the database table
        allowed_fields = {
            "name", "description", "file_id", "document_type", "signature_mode",
            "require_signature", "signature_fields", "folder_id", "quote_id",
            "expires_at", "created_by", "status"
        }
        document_data = {k: v for k, v in document_data.items() if k in allowed_fields}
        
        response = supabase.table("esignature_documents").insert(document_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create document")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating document: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create document: {str(e)}")

@router.put("/documents/{document_id}", response_model=ESignatureDocument)
async def update_document(
    document_id: str,
    document_update: ESignatureDocumentUpdate,
    user = Depends(get_current_user)
):
    """Update an e-signature document."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        # Get existing document
        existing = supabase.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check access
        if not is_admin and existing.data.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update document
        update_data = document_update.model_dump(exclude_none=True)
        response = supabase.table("esignature_documents").update(update_data).eq("id", document_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update document")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update document: {str(e)}")

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user = Depends(get_current_user)):
    """Delete an e-signature document."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        # Get existing document
        existing = supabase.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check access
        if not is_admin and existing.data.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete document (cascade will handle signatures)
        supabase.table("esignature_documents").delete().eq("id", document_id).execute()
        
        return {"message": "Document deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@router.get("/documents/{document_id}/preview")
async def get_document_preview(document_id: str, user = Depends(get_current_user)):
    """Get preview URL for the document PDF."""
    try:
        # Get document
        doc_response = supabase.table("esignature_documents").select("*, files(*)").eq("id", document_id).single().execute()
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        file_data = document.get("files")
        
        if not file_data:
            raise HTTPException(status_code=404, detail="File not found")
        
        storage_path = file_data.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=500, detail="File storage path not found")
        
        # Get signed URL
        signed_url = supabase_storage.storage.from_("project-files").create_signed_url(storage_path, 3600)
        
        return {"preview_url": signed_url}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting document preview: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get preview: {str(e)}")

def embed_signature_in_pdf(pdf_bytes: bytes, signature_image_bytes: bytes, signature_type: str = "draw") -> bytes:
    """
    Embed signature into PDF (simple mode - bottom of last page).
    
    Args:
        pdf_bytes: Original PDF file bytes
        signature_image_bytes: Signature image bytes (PNG/JPEG) or text for typed signatures
        signature_type: "draw", "type", or "upload"
    
    Returns:
        bytes: PDF with embedded signature
    """
    if not PDF_LIBRARIES_AVAILABLE:
        raise HTTPException(status_code=500, detail="PDF libraries not available")
    
    try:
        # Read original PDF
        pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
        pdf_writer = PdfWriter()
        
        # Copy all pages except the last one
        for page_num in range(len(pdf_reader.pages) - 1):
            pdf_writer.add_page(pdf_reader.pages[page_num])
        
        # Get last page
        last_page = pdf_reader.pages[-1]
        page_width = float(last_page.mediabox.width)
        page_height = float(last_page.mediabox.height)
        
        # Create a new page with signature overlay
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=(page_width, page_height))
        
        # Signature dimensions
        sig_width = min(200, page_width * 0.4)
        sig_height = 60
        
        # Position at bottom center
        x = (page_width - sig_width) / 2
        y = 50  # 50 points from bottom
        
        if signature_type == "draw" or signature_type == "upload":
            # Embed image signature
            try:
                # Decode base64 if needed
                if isinstance(signature_image_bytes, str):
                    signature_image_bytes = base64.b64decode(signature_image_bytes)
                
                # Load image
                img = Image.open(io.BytesIO(signature_image_bytes))
                # Resize to fit
                img.thumbnail((int(sig_width), int(sig_height)), Image.Resampling.LANCZOS)
                
                # Save to temporary buffer
                img_buffer = io.BytesIO()
                img.save(img_buffer, format='PNG')
                img_buffer.seek(0)
                
                # Draw image on canvas
                can.drawImage(img_buffer, x, y, width=sig_width, height=sig_height, preserveAspectRatio=True)
            except Exception as img_error:
                print(f"Error embedding image signature: {str(img_error)}")
                # Fallback: draw text
                can.setFont("Helvetica-Bold", 12)
                can.drawString(x, y + 20, "Signature")
        elif signature_type == "type":
            # Draw text signature
            can.setFont("Helvetica-Bold", 14)
            # Decode if base64
            if isinstance(signature_image_bytes, str):
                try:
                    signature_text = base64.b64decode(signature_image_bytes).decode('utf-8')
                except:
                    signature_text = signature_image_bytes
            else:
                signature_text = signature_image_bytes.decode('utf-8') if isinstance(signature_image_bytes, bytes) else str(signature_image_bytes)
            
            # Wrap text if needed
            text_width = can.stringWidth(signature_text, "Helvetica-Bold", 14)
            if text_width > sig_width:
                # Simple text wrapping (split by spaces)
                words = signature_text.split()
                lines = []
                current_line = []
                current_width = 0
                for word in words:
                    word_width = can.stringWidth(word + " ", "Helvetica-Bold", 14)
                    if current_width + word_width > sig_width and current_line:
                        lines.append(" ".join(current_line))
                        current_line = [word]
                        current_width = word_width
                    else:
                        current_line.append(word)
                        current_width += word_width
                if current_line:
                    lines.append(" ".join(current_line))
                
                # Draw lines
                line_height = 18
                for i, line in enumerate(lines):
                    can.drawString(x, y + sig_height - (i + 1) * line_height, line)
            else:
                can.drawString(x, y + 20, signature_text)
        
        # Add signature label
        can.setFont("Helvetica", 10)
        can.drawString(x, y - 15, "Signed Electronically")
        
        can.save()
        packet.seek(0)
        signature_pdf = PdfReader(packet)
        
        # Merge signature overlay with last page
        last_page.merge_page(signature_pdf.pages[0])
        pdf_writer.add_page(last_page)
        
        # Write final PDF
        output = io.BytesIO()
        pdf_writer.write(output)
        output.seek(0)
        
        return output.read()
    except Exception as e:
        print(f"Error embedding signature in PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to embed signature: {str(e)}")

@router.post("/documents/{document_id}/sign", response_model=ESignatureSignature)
async def sign_document(
    document_id: str,
    signature: ESignatureSignatureCreate,
    request: Request,
    user = Depends(get_current_user)
):
    """Sign an e-signature document (simple mode)."""
    try:
        # Get document
        doc_response = supabase.table("esignature_documents").select("*, files(*)").eq("id", document_id).single().execute()
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        
        # Check if already signed
        if document.get("status") == "signed":
            raise HTTPException(status_code=400, detail="Document already signed")
        
        # Check if expired
        expires_at = document.get("expires_at")
        if expires_at:
            try:
                if isinstance(expires_at, str):
                    expires_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                else:
                    expires_dt = expires_at
                if expires_dt < datetime.now(expires_dt.tzinfo):
                    raise HTTPException(status_code=400, detail="Document has expired")
            except Exception as e:
                print(f"Error checking expiration: {str(e)}")
        
        # Get file
        file_data = document.get("files")
        if not file_data:
            raise HTTPException(status_code=404, detail="File not found")
        
        storage_path = file_data.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=500, detail="File storage path not found")
        
        # Download original PDF
        try:
            pdf_bytes = supabase_storage.storage.from_("project-files").download(storage_path)
        except Exception as download_error:
            raise HTTPException(status_code=500, detail=f"Failed to download PDF: {str(download_error)}")
        
        # Process signature data
        signature_data = signature.signature_data
        if signature.signature_type == "draw" or signature.signature_type == "upload":
            # Base64 image
            try:
                if signature_data.startswith("data:image"):
                    # Remove data URL prefix
                    signature_data = signature_data.split(",")[1]
                signature_image_bytes = base64.b64decode(signature_data)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid signature image format: {str(e)}")
        else:
            # Text signature
            signature_image_bytes = signature_data.encode('utf-8')
        
        # Embed signature in PDF
        try:
            signed_pdf_bytes = embed_signature_in_pdf(pdf_bytes, signature_image_bytes, signature.signature_type)
        except Exception as embed_error:
            raise HTTPException(status_code=500, detail=f"Failed to embed signature: {str(embed_error)}")
        
        # Upload signed PDF
        file_id = str(uuid.uuid4())
        file_hash = hashlib.md5(signed_pdf_bytes).hexdigest()[:8]
        signed_filename = f"{file_id}/{file_hash}_signed_{uuid.uuid4().hex[:8]}.pdf"
        
        try:
            supabase_storage.storage.from_("project-files").upload(
                signed_filename,
                signed_pdf_bytes,
                file_options={
                    "content-type": "application/pdf",
                    "upsert": "false"
                }
            )
        except Exception as upload_error:
            raise HTTPException(status_code=500, detail=f"Failed to upload signed PDF: {str(upload_error)}")
        
        # Get signed URL
        try:
            signed_url = supabase_storage.storage.from_("project-files").create_signed_url(signed_filename, 3600 * 24 * 365)  # 1 year
        except Exception:
            signed_url = None
        
        # Create file record for signed PDF
        signed_file_data = {
            "id": file_id,
            "name": f"{file_data.get('name', 'Document')} - Signed",
            "original_filename": f"{file_data.get('original_filename', 'document.pdf')}",
            "file_type": "application/pdf",
            "file_size": len(signed_pdf_bytes),
            "storage_path": signed_filename,
            "storage_url": signed_url,
            "folder_id": document.get("folder_id"),
            "quote_id": document.get("quote_id"),
            "uploaded_by": user["id"]
        }
        
        try:
            signed_file_response = supabase.table("files").insert(signed_file_data).execute()
            signed_file_id = signed_file_response.data[0]["id"] if signed_file_response.data else file_id
        except Exception as file_error:
            print(f"Warning: Could not create file record: {str(file_error)}")
            signed_file_id = file_id
        
        # Get client IP and user agent
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Create signature record
        signature_data_record = {
            "document_id": document_id,
            "folder_id": signature.folder_id or document.get("folder_id"),
            "user_id": user["id"],
            "signature_data": signature.signature_data,
            "signature_type": signature.signature_type,
            "signature_position": signature.signature_position,
            "field_id": signature.field_id,
            "ip_address": client_ip,
            "user_agent": user_agent,
            "signed_file_id": signed_file_id,
            "signed_file_url": signed_url
        }
        
        signature_response = supabase.table("esignature_signatures").insert(signature_data_record).execute()
        
        if not signature_response.data:
            raise HTTPException(status_code=500, detail="Failed to create signature record")
        
        # Update document status
        update_data = {
            "status": "signed",
            "signed_by": user["id"],
            "signed_at": datetime.now().isoformat(),
            "signed_ip_address": client_ip,
            "signature_method": signature.signature_type
        }
        
        supabase.table("esignature_documents").update(update_data).eq("id", document_id).execute()
        
        return signature_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error signing document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to sign document: {str(e)}")

@router.get("/documents/{document_id}/signatures", response_model=List[ESignatureSignature])
async def get_document_signatures(document_id: str, user = Depends(get_current_user)):
    """Get all signatures for a document."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        # Get document to check access
        doc_response = supabase.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        
        # Check access
        if not is_admin and document.get("created_by") != user["id"]:
            # Users can only see their own signatures
            query = supabase.table("esignature_signatures").select("*").eq("document_id", document_id).eq("user_id", user["id"])
        else:
            query = supabase.table("esignature_signatures").select("*").eq("document_id", document_id)
        
        response = query.order("signed_at", desc=True).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting signatures: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get signatures: {str(e)}")

@router.get("/documents/{document_id}/signed-pdf")
async def get_signed_pdf(document_id: str, user = Depends(get_current_user)):
    """Download the signed PDF version of the document."""
    try:
        # Get document
        doc_response = supabase.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        
        # Check if signed
        if document.get("status") != "signed":
            raise HTTPException(status_code=400, detail="Document not signed yet")
        
        # Get latest signature
        sig_response = supabase.table("esignature_signatures").select("*, files(*)").eq("document_id", document_id).order("signed_at", desc=True).limit(1).execute()
        
        if not sig_response.data:
            raise HTTPException(status_code=404, detail="Signed PDF not found")
        
        signature = sig_response.data[0]
        signed_file_id = signature.get("signed_file_id")
        
        if not signed_file_id:
            raise HTTPException(status_code=404, detail="Signed file ID not found")
        
        # Get file
        file_response = supabase.table("files").select("*").eq("id", signed_file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="Signed file not found")
        
        file_data = file_response.data
        storage_path = file_data.get("storage_path")
        
        if not storage_path:
            raise HTTPException(status_code=500, detail="File storage path not found")
        
        # Get signed URL
        signed_url = supabase_storage.storage.from_("project-files").create_signed_url(storage_path, 3600)
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=signed_url)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting signed PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get signed PDF: {str(e)}")

