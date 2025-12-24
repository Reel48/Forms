#!/usr/bin/env python3
"""
Script to populate embeddings for existing data in the database.
This generates vector embeddings for quotes, forms, and knowledge base entries.

Usage:
    python scripts/populate_embeddings.py

Environment Variables Required:
    - SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - GEMINI_API_KEY
"""

import os
import sys
import logging
import uuid
from typing import List, Dict, Optional

# Add backend directory to path
backend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend')
sys.path.insert(0, backend_path)

from database import supabase_storage
from embeddings_service import get_embeddings_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_embeddings_for_knowledge_base(limit: Optional[int] = None):
    """Generate embeddings for knowledge_embeddings table entries that don't have embeddings yet"""
    logger.info("Generating embeddings for knowledge base...")
    
    embeddings_service = get_embeddings_service()
    if not embeddings_service.embedding_model:
        logger.error("Embedding model not available. Check GEMINI_API_KEY.")
        return
    
    # Get entries without embeddings
    query = supabase_storage.table("knowledge_embeddings").select("*")
    if limit:
        query = query.limit(limit)
    
    response = query.execute()
    entries = response.data if response.data else []
    
    logger.info(f"Found {len(entries)} knowledge base entries")
    
    updated = 0
    for entry in entries:
        entry_id = entry.get("id")
        content = entry.get("content", "")
        existing_embedding = entry.get("embedding")
        
        # Skip if already has embedding
        if existing_embedding:
            logger.debug(f"Skipping {entry_id} - already has embedding")
            continue
        
        if not content or not content.strip():
            logger.warning(f"Skipping {entry_id} - empty content")
            continue
        
        try:
            # Generate embedding
            logger.info(f"Generating embedding for: {entry.get('title', entry_id)}")
            embedding = embeddings_service.generate_embedding(content)
            
            if not embedding or len(embedding) == 0:
                logger.warning(f"Failed to generate embedding for {entry_id}")
                continue
            
            # Convert to string format for pgvector
            embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
            
            # Update entry with embedding
            supabase_storage.table("knowledge_embeddings").update({
                "embedding": embedding_str
            }).eq("id", entry_id).execute()
            
            updated += 1
            logger.info(f"✓ Updated {entry_id} ({updated}/{len(entries)})")
            
        except Exception as e:
            logger.error(f"Error processing {entry_id}: {str(e)}")
            continue
    
    logger.info(f"Completed: Updated {updated} knowledge base entries with embeddings")

def generate_embeddings_for_quotes(limit: Optional[int] = None):
    """Generate embeddings for quotes and line items"""
    logger.info("Generating embeddings for quotes...")
    
    embeddings_service = get_embeddings_service()
    if not embeddings_service.embedding_model:
        logger.error("Embedding model not available. Check GEMINI_API_KEY.")
        return
    
    # Get quotes
    query = supabase_storage.table("quotes").select("id, title, quote_number, total, client_id, line_items(*)")
    if limit:
        query = query.limit(limit)
    
    response = query.execute()
    quotes = response.data if response.data else []
    
    logger.info(f"Found {len(quotes)} quotes")
    
    updated = 0
    for quote in quotes:
        quote_id = quote.get("id")
        title = quote.get("title", "")
        quote_number = quote.get("quote_number", "")
        line_items = quote.get("line_items", [])
        
        # Check if embedding already exists
        existing = supabase_storage.table("quote_embeddings").select("id").eq("quote_id", quote_id).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            logger.debug(f"Skipping quote {quote_id} - already has embedding")
            continue
        
        try:
            # Create content for embedding (quote title + line items summary)
            content_parts = [f"Quote: {title}"]
            if quote_number:
                content_parts.append(f"Quote Number: {quote_number}")
            
            if line_items:
                items_summary = []
                for item in line_items:
                    desc = item.get("description", "")
                    qty = item.get("quantity", 0)
                    price = item.get("unit_price", "0")
                    items_summary.append(f"{desc} - Quantity: {qty}, Price: ${price}")
                content_parts.append("Line Items: " + "; ".join(items_summary))
            
            content = "\n".join(content_parts)
            
            if not content.strip():
                logger.warning(f"Skipping quote {quote_id} - no content")
                continue
            
            # Generate embedding
            logger.info(f"Generating embedding for quote: {title}")
            embedding = embeddings_service.generate_embedding(content)
            
            if not embedding or len(embedding) == 0:
                logger.warning(f"Failed to generate embedding for quote {quote_id}")
                continue
            
            # Convert to string format
            embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
            
            # Insert embedding
            supabase_storage.table("quote_embeddings").insert({
                "id": str(uuid.uuid4()),
                "quote_id": quote_id,
                "content_type": "quote",
                "content": content,
                "embedding": embedding_str,
                "metadata": {
                    "title": title,
                    "quote_number": quote_number,
                    "total": str(quote.get("total", "0"))
                }
            }).execute()
            
            updated += 1
            logger.info(f"✓ Created embedding for quote {quote_id} ({updated}/{len(quotes)})")
            
        except Exception as e:
            logger.error(f"Error processing quote {quote_id}: {str(e)}")
            continue
    
    logger.info(f"Completed: Created embeddings for {updated} quotes")

def generate_embeddings_for_forms(limit: Optional[int] = None):
    """Generate embeddings for forms"""
    logger.info("Generating embeddings for forms...")
    
    embeddings_service = get_embeddings_service()
    if not embeddings_service.embedding_model:
        logger.error("Embedding model not available. Check GEMINI_API_KEY.")
        return
    
    # Get published forms
    query = supabase_storage.table("forms").select("id, name, description, status").eq("status", "published")
    if limit:
        query = query.limit(limit)
    
    response = query.execute()
    forms = response.data if response.data else []
    
    logger.info(f"Found {len(forms)} forms")
    
    updated = 0
    for form in forms:
        form_id = form.get("id")
        name = form.get("name", "")
        description = form.get("description", "")
        
        # Check if embedding already exists
        existing = supabase_storage.table("form_embeddings").select("id").eq("form_id", form_id).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            logger.debug(f"Skipping form {form_id} - already has embedding")
            continue
        
        try:
            # Create content for embedding
            content_parts = [f"Form: {name}"]
            if description:
                content_parts.append(f"Description: {description}")
            
            content = "\n".join(content_parts)
            
            if not content.strip():
                logger.warning(f"Skipping form {form_id} - no content")
                continue
            
            # Generate embedding
            logger.info(f"Generating embedding for form: {name}")
            embedding = embeddings_service.generate_embedding(content)
            
            if not embedding or len(embedding) == 0:
                logger.warning(f"Failed to generate embedding for form {form_id}")
                continue
            
            # Convert to string format
            embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
            
            # Insert embedding
            supabase_storage.table("form_embeddings").insert({
                "id": str(uuid.uuid4()),
                "form_id": form_id,
                "content_type": "form",
                "content": content,
                "embedding": embedding_str,
                "metadata": {
                    "name": name,
                    "description": description
                }
            }).execute()
            
            updated += 1
            logger.info(f"✓ Created embedding for form {form_id} ({updated}/{len(forms)})")
            
        except Exception as e:
            logger.error(f"Error processing form {form_id}: {str(e)}")
            continue
    
    logger.info(f"Completed: Created embeddings for {updated} forms")

def main():
    """Main function to populate all embeddings"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Populate embeddings for RAG")
    parser.add_argument("--knowledge-only", action="store_true", help="Only populate knowledge base embeddings")
    parser.add_argument("--quotes-only", action="store_true", help="Only populate quote embeddings")
    parser.add_argument("--forms-only", action="store_true", help="Only populate form embeddings")
    parser.add_argument("--limit", type=int, help="Limit number of entries to process (for testing)")
    
    args = parser.parse_args()
    
    try:
        if args.knowledge_only:
            generate_embeddings_for_knowledge_base(args.limit)
        elif args.quotes_only:
            generate_embeddings_for_quotes(args.limit)
        elif args.forms_only:
            generate_embeddings_for_forms(args.limit)
        else:
            # Populate all
            logger.info("Populating all embeddings...")
            generate_embeddings_for_knowledge_base(args.limit)
            generate_embeddings_for_quotes(args.limit)
            generate_embeddings_for_forms(args.limit)
        
        logger.info("✓ Embedding population complete!")
        
    except Exception as e:
        logger.error(f"Error in main: {str(e)}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

