"""
Knowledge Base Router
Handles document uploads for AI chatbot knowledge base
Supports PDF, Excel, and PowerPoint files
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Optional
import sys
import os
import uuid
import logging

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase_storage
from auth import get_current_admin
from document_extraction_service import extract_text_from_document
from chunking_service import get_chunking_service
from embeddings_service import get_embeddings_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

logger = logging.getLogger(__name__)

# Maximum file size: 50MB for knowledge base documents
MAX_FILE_SIZE = 50 * 1024 * 1024

# Allowed file types
ALLOWED_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.pptx', '.ppt', '.docx'}


async def process_document_background(
    document_id: str,
    file_data: bytes,
    filename: str,
    mime_type: str
):
    """
    Background task to process document: extract, chunk, and generate embeddings
    
    Args:
        document_id: ID of the knowledge_document record
        file_data: File bytes
        filename: Original filename
        mime_type: MIME type of the file
    """
    try:
        # Update status to processing
        supabase_storage.table("knowledge_documents").update({
            "processing_status": "processing"
        }).eq("id", document_id).execute()
        
        # Step 1: Extract text
        logger.info(f"Extracting text from {filename}...")
        text = extract_text_from_document(
            data=file_data,
            mime_type=mime_type,
            file_name=filename
        )
        
        if not text or not text.strip():
            raise Exception("No text could be extracted from document")
        
        # Step 2: Chunk document
        logger.info(f"Chunking document {filename}...")
        chunking_service = get_chunking_service()
        chunks = chunking_service.chunk_document(
            text=text,
            metadata={
                "filename": filename,
                "document_id": document_id
            }
        )
        
        if not chunks:
            raise Exception("Document could not be chunked")
        
        # Step 3: Generate embeddings for each chunk
        logger.info(f"Generating embeddings for {len(chunks)} chunks...")
        embeddings_service = get_embeddings_service()
        
        if not embeddings_service.embedding_model:
            raise Exception("Embedding model not available. Check GEMINI_API_KEY.")
        
        successful_chunks = 0
        for chunk in chunks:
            try:
                # Generate embedding
                embedding = embeddings_service.generate_embedding(chunk.text)
                
                if not embedding or len(embedding) == 0:
                    logger.warning(f"Failed to generate embedding for chunk {chunk.chunk_index}")
                    continue
                
                # Convert to string format for pgvector
                embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
                
                # Store in knowledge_embeddings
                supabase_storage.table("knowledge_embeddings").insert({
                    "id": str(uuid.uuid4()),
                    "category": "document",  # Mark as document source
                    "title": f"{filename} - Chunk {chunk.chunk_index + 1}",
                    "content": chunk.text,
                    "embedding": embedding_str,
                    "document_id": document_id,
                    "chunk_index": chunk.chunk_index,
                    "metadata": chunk.metadata
                }).execute()
                
                successful_chunks += 1
                
            except Exception as e:
                logger.error(f"Error processing chunk {chunk.chunk_index}: {str(e)}")
                continue
        
        # Step 4: Update document status
        if successful_chunks > 0:
            supabase_storage.table("knowledge_documents").update({
                "processing_status": "completed",
                "chunk_count": successful_chunks,
                "error_message": None
            }).eq("id", document_id).execute()
            
            logger.info(f"Successfully processed {filename}: {successful_chunks} chunks")
        else:
            raise Exception("No chunks were successfully processed")
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing document {document_id}: {error_msg}")
        
        # Update status to failed
        supabase_storage.table("knowledge_documents").update({
            "processing_status": "failed",
            "error_message": error_msg
        }).eq("id", document_id).execute()


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    admin: dict = Depends(get_current_admin)
):
    """
    Upload a document for knowledge base
    
    Supports: PDF, Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt), Word (.docx)
    
    Returns document ID and processing status
    """
    try:
        # Validate file type
        filename = file.filename or "unknown"
        file_ext = os.path.splitext(filename)[1].lower()
        
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file data
        file_data = await file.read()
        file_size = len(file_data)
        
        # Check file size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.0f}MB"
            )
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Determine file type
        mime_type = file.content_type or ""
        file_type = file_ext[1:] if file_ext.startswith('.') else file_ext  # Remove leading dot
        
        # Create document record
        document_id = str(uuid.uuid4())
        document_data = {
            "id": document_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "uploaded_by": admin["id"],
            "processing_status": "pending",
            "chunk_count": 0
        }
        
        supabase_storage.table("knowledge_documents").insert(document_data).execute()
        
        # Start background processing
        background_tasks.add_task(
            process_document_background,
            document_id=document_id,
            file_data=file_data,
            filename=filename,
            mime_type=mime_type
        )
        
        return JSONResponse({
            "id": document_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "processing_status": "pending",
            "message": "Document uploaded. Processing in background..."
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")


@router.get("/documents")
async def list_documents(
    status: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    """
    List all uploaded knowledge base documents
    
    Query params:
    - status: Filter by processing_status (pending, processing, completed, failed)
    """
    try:
        query = supabase_storage.table("knowledge_documents").select("*").order("created_at", desc=True)
        
        if status:
            query = query.eq("processing_status", status)
        
        response = query.execute()
        documents = response.data if response.data else []
        
        return {"documents": documents, "count": len(documents)}
        
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    admin: dict = Depends(get_current_admin)
):
    """
    Get details of a specific document
    """
    try:
        response = supabase_storage.table("knowledge_documents").select("*").eq("id", document_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(e)}")


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    admin: dict = Depends(get_current_admin)
):
    """
    Delete a document and all its chunks
    
    This will cascade delete all related chunks in knowledge_embeddings
    """
    try:
        # Verify document exists
        doc_response = supabase_storage.table("knowledge_documents").select("id").eq("id", document_id).single().execute()
        
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete document (cascade will delete chunks)
        supabase_storage.table("knowledge_documents").delete().eq("id", document_id).execute()
        
        return {"message": "Document and all chunks deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


@router.post("/documents/{document_id}/reprocess")
async def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    admin: dict = Depends(get_current_admin)
):
    """
    Reprocess a document (regenerate embeddings)
    
    Note: This requires the original file. If file is not stored, this will fail.
    For now, this endpoint is a placeholder - full implementation would require
    storing files or re-uploading.
    """
    try:
        # Get document
        doc_response = supabase_storage.table("knowledge_documents").select("*").eq("id", document_id).single().execute()
        
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        
        # Check if file is stored
        if not document.get("storage_path"):
            raise HTTPException(
                status_code=400,
                detail="Cannot reprocess: original file not stored. Please re-upload the document."
            )
        
        # Delete existing chunks
        supabase_storage.table("knowledge_embeddings").delete().eq("document_id", document_id).execute()
        
        # Reset status
        supabase_storage.table("knowledge_documents").update({
            "processing_status": "pending",
            "chunk_count": 0,
            "error_message": None
        }).eq("id", document_id).execute()
        
        # TODO: Re-download file from storage and reprocess
        # For now, return message that user should re-upload
        return {
            "message": "Document marked for reprocessing. Please re-upload the file to regenerate embeddings.",
            "note": "Full reprocessing requires file storage implementation"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reprocess document: {str(e)}")

