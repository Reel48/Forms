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

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

logger = logging.getLogger(__name__)

# Import services with error handling to prevent startup failures
# Catch all exceptions (ImportError, ValueError, etc.) to prevent deployment failures
try:
    from document_extraction_service import extract_text_from_document
    DOCUMENT_EXTRACTION_AVAILABLE = True
except Exception as e:
    logger.warning(f"document_extraction_service not available: {e}")
    DOCUMENT_EXTRACTION_AVAILABLE = False
    extract_text_from_document = None

try:
    from chunking_service import get_chunking_service
    CHUNKING_AVAILABLE = True
except Exception as e:
    logger.warning(f"chunking_service not available: {e}")
    CHUNKING_AVAILABLE = False
    get_chunking_service = None

try:
    from embeddings_service import get_embeddings_service
    EMBEDDINGS_AVAILABLE = True
except Exception as e:
    logger.warning(f"embeddings_service not available: {e}")
    EMBEDDINGS_AVAILABLE = False
    get_embeddings_service = None

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
        # Check if required services are available
        if not DOCUMENT_EXTRACTION_AVAILABLE or not extract_text_from_document:
            raise Exception("Document extraction service not available")
        if not CHUNKING_AVAILABLE or not get_chunking_service:
            raise Exception("Chunking service not available")
        if not EMBEDDINGS_AVAILABLE or not get_embeddings_service:
            raise Exception("Embeddings service not available")
        
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
        # Check if required services are available
        if not DOCUMENT_EXTRACTION_AVAILABLE or not CHUNKING_AVAILABLE or not EMBEDDINGS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Knowledge base services are not available. Please check service configuration."
            )
        
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
    file: Optional[UploadFile] = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    admin: dict = Depends(get_current_admin)
):
    """
    Reprocess a document with new chunking strategy
    
    If file is provided, will use that file. Otherwise, requires re-upload.
    Deletes old chunks and regenerates with improved chunking algorithm.
    """
    try:
        # Get document
        doc_response = supabase_storage.table("knowledge_documents").select("*").eq("id", document_id).single().execute()
        
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data
        
        # Delete existing chunks
        logger.info(f"Deleting old chunks for document {document_id}...")
        chunks_deleted = supabase_storage.table("knowledge_embeddings").delete().eq("document_id", document_id).execute()
        logger.info(f"Deleted chunks for document {document_id}")
        
        # If file is provided, reprocess with new file
        if file:
            # Validate file type
            filename = file.filename or document.get("filename", "unknown")
            file_ext = os.path.splitext(filename)[1].lower()
            
            if file_ext not in ALLOWED_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"File type not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
                )
            
            # Read file data
            file_data = await file.read()
            file_size = len(file_data)
            
            if file_size == 0:
                raise HTTPException(status_code=400, detail="File is empty")
            
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.0f}MB"
                )
            
            # Determine file type
            mime_type = file.content_type or ""
            
            # Update document record
            supabase_storage.table("knowledge_documents").update({
                "filename": filename,
                "file_size": file_size,
                "processing_status": "pending",
                "chunk_count": 0,
                "error_message": None
            }).eq("id", document_id).execute()
            
            # Start background processing with new chunking
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
                "processing_status": "pending",
                "message": "Document reprocessing started with new chunking strategy..."
            })
        else:
            # No file provided - just delete chunks and mark for re-upload
            supabase_storage.table("knowledge_documents").update({
                "processing_status": "pending",
                "chunk_count": 0,
                "error_message": None
            }).eq("id", document_id).execute()
            
            return JSONResponse({
                "id": document_id,
                "message": "Old chunks deleted. Please re-upload the file to reprocess with new chunking strategy.",
                "note": "Use this endpoint with a file parameter to reprocess immediately"
            })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reprocess document: {str(e)}")


@router.post("/reprocess-all")
async def reprocess_all_documents(
    background_tasks: BackgroundTasks = BackgroundTasks(),
    admin: dict = Depends(get_current_admin)
):
    """
    Reprocess all documents with new chunking strategy
    
    This will delete all existing chunks and mark documents for reprocessing.
    Documents will need to be re-uploaded to complete reprocessing.
    """
    try:
        # Get all documents
        docs_response = supabase_storage.table("knowledge_documents").select("id, filename").execute()
        documents = docs_response.data if docs_response.data else []
        
        if not documents:
            return JSONResponse({
                "message": "No documents found to reprocess",
                "count": 0
            })
        
        # Delete all chunks from all documents
        logger.info(f"Deleting all chunks from {len(documents)} documents...")
        chunks_deleted = supabase_storage.table("knowledge_embeddings").delete().neq("document_id", "null").execute()
        
        # Reset all document statuses
        updated = supabase_storage.table("knowledge_documents").update({
            "processing_status": "pending",
            "chunk_count": 0,
            "error_message": None
        }).execute()
        
        logger.info(f"Marked {len(documents)} documents for reprocessing")
        
        return JSONResponse({
            "message": f"All {len(documents)} documents marked for reprocessing. Please re-upload files to complete reprocessing with new chunking strategy.",
            "count": len(documents),
            "documents": [{"id": doc["id"], "filename": doc.get("filename")} for doc in documents],
            "note": "Use POST /api/knowledge/documents/{document_id}/reprocess with file parameter to reprocess individual documents"
        })
        
    except Exception as e:
        logger.error(f"Error reprocessing all documents: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reprocess all documents: {str(e)}")


# ==================== Knowledge Entries Management ====================

@router.get("/entries")
async def list_knowledge_entries(
    category: Optional[str] = None,
    search: Optional[str] = None,
    source: Optional[str] = None,  # 'manual' or 'document'
    document_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(get_current_admin)
):
    """
    List all knowledge base entries with filtering and search
    
    Query params:
    - category: Filter by category
    - search: Search in title and content
    - source: Filter by source ('manual' or 'document')
    - document_id: Filter by document ID
    - limit: Number of results (default 100)
    - offset: Pagination offset
    """
    try:
        # Build base query - select all fields from knowledge_embeddings
        query = supabase_storage.table("knowledge_embeddings").select("*", count="exact")
        
        # Apply filters
        if document_id:
            query = query.eq("document_id", document_id)
        elif source == "document":
            query = query.not_.is_("document_id", "null")
        elif source == "manual":
            query = query.is_("document_id", "null")
        
        if category:
            query = query.eq("category", category)
        
        if search:
            # Search in title and content
            # Note: Supabase Python client doesn't support .or_() directly
            # We'll filter in memory after fetching, or use a single field search
            # For now, search in title (most common) - can enhance later
            query = query.ilike("title", f"%{search}%")
        
        # Order by created_at descending
        query = query.order("created_at", desc=True)
        
        # Apply pagination
        query = query.range(offset, offset + limit - 1)
        
        response = query.execute()
        entries = response.data if response.data else []
        
        # If search was provided, also filter by content in memory (since we can only search one field in DB)
        if search:
            search_lower = search.lower()
            entries = [
                e for e in entries
                if search_lower in (e.get("title", "") or "").lower() or 
                   search_lower in (e.get("content", "") or "").lower()
            ]
        
        total_count = response.count if hasattr(response, 'count') else len(entries)
        
        # Get categories for filtering
        categories_response = supabase_storage.table("knowledge_embeddings").select("category").execute()
        categories = list(set([e.get("category") for e in (categories_response.data or []) if e.get("category")]))
        
        return {
            "entries": entries,
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "categories": sorted(categories)
        }
        
    except Exception as e:
        logger.error(f"Error listing knowledge entries: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list entries: {str(e)}")


@router.get("/entries/{entry_id}")
async def get_knowledge_entry(
    entry_id: str,
    admin: dict = Depends(get_current_admin)
):
    """
    Get details of a specific knowledge entry
    """
    try:
        response = supabase_storage.table("knowledge_embeddings").select("*").eq("id", entry_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        entry = response.data
        
        # Fetch document filename if document_id exists
        if entry.get("document_id"):
            try:
                doc_response = supabase_storage.table("knowledge_documents").select("filename").eq("id", entry["document_id"]).single().execute()
                if doc_response.data:
                    entry["knowledge_documents"] = {"filename": doc_response.data["filename"]}
            except Exception:
                # Document might not exist, continue without filename
                pass
        
        return entry
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entry: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get entry: {str(e)}")


@router.get("/entries/{entry_id}/similar")
async def find_similar_entries(
    entry_id: str,
    threshold: float = 0.8,  # Similarity threshold (0-1)
    limit: int = 10,
    admin: dict = Depends(get_current_admin)
):
    """
    Find similar/duplicate entries using vector similarity
    
    Returns entries with similarity score above threshold
    """
    try:
        # Get the entry
        entry_response = supabase_storage.table("knowledge_embeddings").select("*").eq("id", entry_id).single().execute()
        
        if not entry_response.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        entry = entry_response.data
        embedding = entry.get("embedding")
        
        if not embedding:
            return {"similar_entries": [], "message": "Entry has no embedding - cannot find similar entries"}
        
        # Convert embedding to string format for RPC call
        # The embedding might be stored as a list, string, or already in vector format
        if isinstance(embedding, list):
            embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
        elif isinstance(embedding, str):
            # If it's already a string, use it directly
            embedding_str = embedding
        else:
            # Try to convert to string
            embedding_str = str(embedding)
        
        # Use RPC function to find similar entries
        try:
            similar_response = supabase_storage.rpc(
                "rag_search_knowledge_embeddings_vector",
                {
                    "query_embedding_text": embedding_str,
                    "match_limit": limit + 1  # +1 to exclude the original entry
                }
            ).execute()
        except Exception as rpc_error:
            logger.warning(f"RPC call failed, trying direct query: {str(rpc_error)}")
            # Fallback: return empty list if RPC fails
            return {
                "similar_entries": [],
                "threshold": threshold,
                "count": 0,
                "error": "Similarity search unavailable"
            }
        
        similar_entries = []
        if similar_response.data:
            for item in similar_response.data:
                # Skip the original entry
                if item.get("id") == entry_id:
                    continue
                
                similarity = item.get("similarity", 0)
                if similarity >= threshold:
                    similar_entries.append({
                        "id": item.get("id"),
                        "title": item.get("title"),
                        "content": item.get("content", "")[:200] + "..." if len(item.get("content", "")) > 200 else item.get("content", ""),
                        "category": item.get("category"),
                        "similarity": similarity,
                        "document_id": item.get("document_id")
                    })
        
        return {
            "similar_entries": similar_entries,
            "threshold": threshold,
            "count": len(similar_entries)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding similar entries: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to find similar entries: {str(e)}")


@router.put("/entries/{entry_id}")
async def update_knowledge_entry(
    entry_id: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
    category: Optional[str] = None,
    metadata: Optional[dict] = None,
    regenerate_embedding: bool = False,
    admin: dict = Depends(get_current_admin)
):
    """
    Update a knowledge entry
    
    If regenerate_embedding is True, will regenerate the embedding for the updated content
    """
    try:
        # Get existing entry
        existing = supabase_storage.table("knowledge_embeddings").select("*").eq("id", entry_id).single().execute()
        
        if not existing.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        # Build update data
        update_data = {}
        if title is not None:
            update_data["title"] = title
        if content is not None:
            update_data["content"] = content
        if category is not None:
            update_data["category"] = category
        if metadata is not None:
            update_data["metadata"] = metadata
        
        # If content changed and regenerate_embedding is True, generate new embedding
        if regenerate_embedding and (content is not None or existing.data.get("content")):
            embeddings_service = get_embeddings_service()
            text_to_embed = content if content is not None else existing.data.get("content", "")
            
            if text_to_embed:
                embedding = embeddings_service.generate_embedding(text_to_embed)
                if embedding and len(embedding) > 0:
                    embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
                    update_data["embedding"] = embedding_str
        
        # Update entry
        supabase_storage.table("knowledge_embeddings").update(update_data).eq("id", entry_id).execute()
        
        # Get updated entry
        updated = supabase_storage.table("knowledge_embeddings").select("*").eq("id", entry_id).single().execute()
        
        return updated.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating entry: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update entry: {str(e)}")


@router.delete("/entries/{entry_id}")
async def delete_knowledge_entry(
    entry_id: str,
    admin: dict = Depends(get_current_admin)
):
    """
    Delete a knowledge entry
    """
    try:
        # Verify entry exists
        entry_response = supabase_storage.table("knowledge_embeddings").select("id, title").eq("id", entry_id).single().execute()
        
        if not entry_response.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        # Delete entry
        supabase_storage.table("knowledge_embeddings").delete().eq("id", entry_id).execute()
        
        return {"message": "Entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entry: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete entry: {str(e)}")


@router.get("/entries/stats")
async def get_knowledge_stats(
    admin: dict = Depends(get_current_admin)
):
    """
    Get statistics about knowledge base entries
    """
    try:
        # Get total count
        total_response = supabase_storage.table("knowledge_embeddings").select("id", count="exact").execute()
        total_count = total_response.count if hasattr(total_response, 'count') else 0
        
        # Get count by category
        all_entries = supabase_storage.table("knowledge_embeddings").select("category, document_id").execute()
        entries = all_entries.data or []
        
        by_category = {}
        manual_count = 0
        document_count = 0
        
        for entry in entries:
            category = entry.get("category", "uncategorized")
            by_category[category] = by_category.get(category, 0) + 1
            
            if entry.get("document_id"):
                document_count += 1
            else:
                manual_count += 1
        
        # Get count by source
        with_embeddings = sum(1 for e in entries if e.get("embedding"))
        
        return {
            "total_entries": total_count,
            "with_embeddings": with_embeddings,
            "without_embeddings": total_count - with_embeddings,
            "manual_entries": manual_count,
            "document_entries": document_count,
            "by_category": by_category
        }
        
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

