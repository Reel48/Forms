"""
Embeddings Service for RAG
Handles generating and retrieving embeddings for context search
Uses Google's text-embedding-004 model for generating embeddings
"""
import os
import logging
import sys
import requests
from typing import List, Dict, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase_storage

logger = logging.getLogger(__name__)

# Try to import google.generativeai for embeddings
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    GENAI_AVAILABLE = False
    logger.warning("google-generativeai package not installed - embedding features will not be available")

class EmbeddingsService:
    """Service for generating and managing embeddings"""
    
    def __init__(self):
        self.embedding_model = None
        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        
        if not GENAI_AVAILABLE or not genai:
            logger.warning("google-generativeai not available - embeddings will use fallback")
            return
        
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not set - embeddings will use fallback")
            return
        
        try:
            # Use Google's text-embedding-004 model for embeddings
            # This is the recommended embedding model for Gemini
            self.embedding_model = genai.GenerativeModel('text-embedding-004')
            logger.info("Embeddings service initialized with text-embedding-004")
        except Exception as e:
            logger.warning(f"Failed to initialize embedding model: {str(e)}")
            self.embedding_model = None
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text using Google's text-embedding-004 model
        
        Args:
            text: Text to generate embedding for
        
        Returns:
            List of floats representing the embedding vector (768 dimensions)
        """
        if not self.embedding_model:
            logger.warning("Embedding model not available - returning empty embedding")
            return []
        
        if not text or not text.strip():
            return []
        
        try:
            # Generate embedding using text-embedding-004
            # Note: The API method may vary - try embed_content first, fallback to other methods
            try:
                result = self.embedding_model.embed_content(text)
            except AttributeError:
                # If embed_content doesn't exist, try alternative method
                # Some versions use embed() or generate_embeddings()
                try:
                    result = self.embedding_model.embed([text])
                    if isinstance(result, list) and len(result) > 0:
                        result = result[0]
                except (AttributeError, TypeError):
                    # Fallback: use REST API directly if SDK method doesn't work
                    api_key = os.getenv("GEMINI_API_KEY")
                    if api_key:
                        response = requests.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={api_key}",
                            json={"content": {"parts": [{"text": text}]}},
                            headers={"Content-Type": "application/json"}
                        )
                        if response.status_code == 200:
                            data = response.json()
                            result = data.get("embedding", {}).get("values", [])
                        else:
                            raise Exception(f"API error: {response.status_code}")
                    else:
                        raise Exception("GEMINI_API_KEY not set")
            
            # The result should be a list of floats
            if isinstance(result, list):
                return result
            elif hasattr(result, 'values'):
                # Some API versions return an object with 'values' attribute
                return list(result.values)
            elif hasattr(result, 'embedding'):
                return list(result.embedding)
            elif isinstance(result, dict) and 'values' in result:
                return result['values']
            else:
                logger.warning(f"Unexpected embedding result format: {type(result)}")
                return []
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}", exc_info=True)
            return []
    
    def search_similar_content(
        self,
        query_embedding: List[float],
        table: str,
        limit: int = 5,
        customer_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Search for similar content using vector similarity with pgvector
        
        Args:
            query_embedding: Embedding vector for the search query (768 dimensions)
            table: Table to search ('quote_embeddings', 'form_embeddings', 'knowledge_embeddings')
            limit: Maximum number of results
            customer_id: Optional customer ID to filter results (for quote_embeddings)
        
        Returns:
            List of similar content with metadata
        """
        if not query_embedding or len(query_embedding) == 0:
            logger.warning("Empty query embedding provided")
            return []
        
        if len(query_embedding) != 768:
            logger.warning(f"Query embedding has wrong dimension: {len(query_embedding)}, expected 768")
            return []
        
        try:
            # Convert embedding to string format for pgvector
            # PostgreSQL vector type expects format: [1.0,2.0,3.0]
            embedding_str = '[' + ','.join([str(float(x)) for x in query_embedding]) + ']'
            
            # Build query based on table type
            if table == 'quote_embeddings':
                # For quotes, we need to filter by customer if provided
                if customer_id:
                    # Get client_id from customer_id (user_id)
                    try:
                        client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                        if not client_response.data:
                            return []
                        client_id = client_response.data["id"]
                        
                        # Search with customer filter
                        query = f"""
                        SELECT 
                            qe.id,
                            qe.quote_id,
                            qe.content_type,
                            qe.content,
                            qe.metadata,
                            1 - (qe.embedding <=> '{embedding_str}'::vector) as similarity
                        FROM quote_embeddings qe
                        JOIN quotes q ON q.id = qe.quote_id
                        WHERE q.client_id = '{client_id}'
                        AND qe.embedding IS NOT NULL
                        ORDER BY qe.embedding <=> '{embedding_str}'::vector
                        LIMIT {limit}
                        """
                    except Exception as e:
                        logger.warning(f"Error getting client_id for customer: {str(e)}")
                        return []
                else:
                    # Search all quotes (admin view)
                    query = f"""
                    SELECT 
                        id,
                        quote_id,
                        content_type,
                        content,
                        metadata,
                        1 - (embedding <=> '{embedding_str}'::vector) as similarity
                    FROM quote_embeddings
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> '{embedding_str}'::vector
                    LIMIT {limit}
                    """
            
            elif table == 'form_embeddings':
                # For forms, filter by customer if provided
                if customer_id:
                    try:
                        client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                        if not client_response.data:
                            return []
                        client_id = client_response.data["id"]
                        
                        # Get forms assigned to this customer via folders
                        query = f"""
                        SELECT DISTINCT
                            fe.id,
                            fe.form_id,
                            fe.content_type,
                            fe.content,
                            fe.metadata,
                            1 - (fe.embedding <=> '{embedding_str}'::vector) as similarity
                        FROM form_embeddings fe
                        JOIN form_folder_assignments ffa ON ffa.form_id = fe.form_id
                        JOIN folders f ON f.id = ffa.folder_id
                        WHERE f.client_id = '{client_id}'
                        AND fe.embedding IS NOT NULL
                        ORDER BY fe.embedding <=> '{embedding_str}'::vector
                        LIMIT {limit}
                        """
                    except Exception as e:
                        logger.warning(f"Error getting customer forms: {str(e)}")
                        return []
                else:
                    # Search all forms (admin view)
                    query = f"""
                    SELECT 
                        id,
                        form_id,
                        content_type,
                        content,
                        metadata,
                        1 - (embedding <=> '{embedding_str}'::vector) as similarity
                    FROM form_embeddings
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> '{embedding_str}'::vector
                    LIMIT {limit}
                    """
            
            elif table == 'knowledge_embeddings':
                # Knowledge base is public, no customer filtering needed
                query = f"""
                SELECT 
                    id,
                    category,
                    title,
                    content,
                    metadata,
                    1 - (embedding <=> '{embedding_str}'::vector) as similarity
                FROM knowledge_embeddings
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> '{embedding_str}'::vector
                LIMIT {limit}
                """
            else:
                logger.warning(f"Unknown table for vector search: {table}")
                return []
            
            # Execute query using Supabase RPC functions
            # We use stored PostgreSQL functions that accept the embedding vector
            try:
                results = []
                
                if table == 'quote_embeddings':
                    client_id = None
                    if customer_id:
                        # Get client_id from customer_id (user_id)
                        try:
                            client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                            if client_response.data:
                                client_id = client_response.data["id"]
                        except Exception:
                            pass
                    
                    # Call RPC function for vector search
                    rpc_response = supabase_storage.rpc(
                        "rag_search_quote_embeddings",
                        {
                            "query_embedding_text": embedding_str,
                            "match_limit": limit,
                            "client_id_filter": client_id
                        }
                    ).execute()
                    
                    if rpc_response.data:
                        results = rpc_response.data
                
                elif table == 'form_embeddings':
                    client_id = None
                    if customer_id:
                        try:
                            client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                            if client_response.data:
                                client_id = client_response.data["id"]
                        except Exception:
                            pass
                    
                    rpc_response = supabase_storage.rpc(
                        "rag_search_form_embeddings",
                        {
                            "query_embedding_text": embedding_str,
                            "match_limit": limit,
                            "client_id_filter": client_id
                        }
                    ).execute()
                    
                    if rpc_response.data:
                        results = rpc_response.data
                
                elif table == 'knowledge_embeddings':
                    rpc_response = supabase_storage.rpc(
                        "rag_search_knowledge_embeddings_vector",
                        {
                            "query_embedding_text": embedding_str,
                            "match_limit": limit
                        }
                    ).execute()
                    
                    if rpc_response.data:
                        results = rpc_response.data
                
                # Format results
                formatted_results = []
                for result in results:
                    formatted_results.append({
                        "id": result.get("id"),
                        "content_type": result.get("content_type", result.get("category", "information")),
                        "content": result.get("content", ""),
                        "metadata": result.get("metadata", {}),
                        "similarity": result.get("similarity", 0.0)
                    })
                
                return formatted_results
                
            except Exception as e:
                logger.warning(f"Error in vector similarity search (RPC): {str(e)}")
                # Fall back to empty results - keyword search will handle it
                return []
                
        except Exception as e:
            logger.error(f"Error searching similar content: {str(e)}", exc_info=True)
            return []
    
    def format_context_from_results(self, results: List[Dict]) -> str:
        """
        Format search results into context string for AI
        
        Args:
            results: List of search results with content and metadata
        
        Returns:
            Formatted context string
        """
        if not results:
            return ""
        
        context_parts = []
        for result in results:
            content_type = result.get("content_type", "information")
            content = result.get("content", "")
            metadata = result.get("metadata", {})
            
            # Format based on content type
            if content_type == "quote":
                quote_id = metadata.get("quote_id", "")
                title = metadata.get("title", "")
                total = metadata.get("total", "")
                context_parts.append(f"Quote: {title} (ID: {quote_id}) - Total: ${total}\n{content}")
            
            elif content_type == "line_item":
                description = metadata.get("description", "")
                price = metadata.get("unit_price", "")
                quantity = metadata.get("quantity", "")
                context_parts.append(f"Product: {description} - Price: ${price} each, Quantity: {quantity}\n{content}")
            
            elif content_type == "form":
                form_name = metadata.get("name", "")
                form_id = metadata.get("form_id", "")
                context_parts.append(f"Form: {form_name} (ID: {form_id})\n{content}")
            
            else:
                title = metadata.get("title", "")
                if title:
                    context_parts.append(f"{title}:\n{content}")
                else:
                    context_parts.append(content)
        
        return "\n\n".join(context_parts)

# Singleton instance
_embeddings_service: Optional[EmbeddingsService] = None

def get_embeddings_service() -> EmbeddingsService:
    """Get or create embeddings service instance"""
    global _embeddings_service
    if _embeddings_service is None:
        _embeddings_service = EmbeddingsService()
    return _embeddings_service

