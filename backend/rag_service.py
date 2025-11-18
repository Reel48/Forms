"""
RAG (Retrieval-Augmented Generation) Service
Retrieves relevant context from database for AI responses
"""
import logging
from typing import List, Dict, Optional
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase_storage

logger = logging.getLogger(__name__)

class RAGService:
    """Service for retrieving relevant context for RAG"""
    
    def retrieve_context(
        self,
        user_query: str,
        customer_id: Optional[str] = None,
        limit: int = 5
    ) -> str:
        """
        Retrieve relevant context for a user query
        
        Args:
            user_query: The user's query/question
            customer_id: Optional customer ID for customer-specific context
            limit: Maximum number of results to return
        
        Returns:
            Formatted context string
        """
        try:
            context_parts = []
            
            # 1. Search quotes and line items
            quote_context = self._search_quotes(user_query, customer_id, limit)
            if quote_context:
                context_parts.append(quote_context)
            
            # 2. Search forms
            form_context = self._search_forms(user_query, customer_id, limit)
            if form_context:
                context_parts.append(form_context)
            
            # 3. Search knowledge base (FAQs, company info)
            knowledge_context = self._search_knowledge_base(user_query, limit)
            if knowledge_context:
                context_parts.append(knowledge_context)
            
            # 4. Get customer-specific information if available
            if customer_id:
                customer_context = self._get_customer_context(customer_id)
                if customer_context:
                    context_parts.append(customer_context)
            
            return "\n\n".join(context_parts) if context_parts else ""
            
        except Exception as e:
            logger.error(f"Error retrieving context: {str(e)}", exc_info=True)
            return ""
    
    def _search_quotes(
        self,
        query: str,
        customer_id: Optional[str] = None,
        limit: int = 5
    ) -> str:
        """Search quotes and line items"""
        try:
            # For now, use simple text search on quotes
            # TODO: Replace with vector similarity search once embeddings are set up
            
            query_lower = query.lower()
            context_items = []
            
            # Search quotes by title
            quote_query = supabase_storage.table("quotes").select("id, title, quote_number, total, status, client_id")
            
            if customer_id:
                # Get client_id from customer_id (user_id)
                client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                if client_response.data:
                    quote_query = quote_query.eq("client_id", client_response.data["id"])
            
            quotes_response = quote_query.limit(limit * 2).execute()
            quotes = quotes_response.data if quotes_response.data else []
            
            # Filter quotes that might be relevant (simple keyword matching)
            relevant_quotes = []
            for quote in quotes:
                title = (quote.get("title") or "").lower()
                quote_number = (quote.get("quote_number") or "").lower()
                
                # Check if query keywords match
                if any(keyword in title or keyword in quote_number for keyword in query_lower.split()):
                    relevant_quotes.append(quote)
                    if len(relevant_quotes) >= limit:
                        break
            
            # Format quote context
            if relevant_quotes:
                quote_texts = []
                for quote in relevant_quotes[:limit]:
                    quote_text = f"Quote #{quote.get('quote_number', 'N/A')}: {quote.get('title', 'Untitled')}"
                    if quote.get('total'):
                        quote_text += f" - Total: ${quote.get('total'):.2f}"
                    if quote.get('status'):
                        quote_text += f" - Status: {quote.get('status')}"
                    quote_texts.append(quote_text)
                
                # Get line items for these quotes
                quote_ids = [q["id"] for q in relevant_quotes[:limit]]
                line_items_response = supabase_storage.table("line_items").select("quote_id, description, quantity, unit_price, line_total").in_("quote_id", quote_ids).limit(limit * 3).execute()
                line_items = line_items_response.data if line_items_response.data else []
                
                # Add line items to context
                for quote in relevant_quotes[:limit]:
                    quote_line_items = [li for li in line_items if li.get("quote_id") == quote["id"]]
                    if quote_line_items:
                        items_text = []
                        for li in quote_line_items[:3]:  # Limit to 3 items per quote
                            desc = li.get("description", "")
                            qty = li.get("quantity", 1)
                            price = li.get("unit_price", 0)
                            items_text.append(f"  - {desc}: {qty} × ${price:.2f}")
                        if items_text:
                            quote_texts[relevant_quotes.index(quote)] += "\n" + "\n".join(items_text)
                
                return "QUOTES AND PRICING:\n" + "\n".join(quote_texts)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching quotes: {str(e)}")
            return ""
    
    def _search_forms(
        self,
        query: str,
        customer_id: Optional[str] = None,
        limit: int = 5
    ) -> str:
        """Search forms"""
        try:
            query_lower = query.lower()
            
            # Search forms by name or description
            forms_query = supabase_storage.table("forms").select("id, name, description, status")
            
            # For customers, we might want to filter by folders they have access to
            # For now, search all published forms
            
            forms_response = forms_query.eq("status", "published").limit(limit * 2).execute()
            forms = forms_response.data if forms_response.data else []
            
            # Filter relevant forms
            relevant_forms = []
            for form in forms:
                name = (form.get("name") or "").lower()
                description = (form.get("description") or "").lower()
                
                if any(keyword in name or keyword in description for keyword in query_lower.split()):
                    relevant_forms.append(form)
                    if len(relevant_forms) >= limit:
                        break
            
            if relevant_forms:
                form_texts = []
                for form in relevant_forms[:limit]:
                    form_text = f"Form: {form.get('name', 'Untitled')}"
                    if form.get('description'):
                        form_text += f" - {form.get('description')}"
                    form_texts.append(form_text)
                
                return "FORMS:\n" + "\n".join(form_texts)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching forms: {str(e)}")
            return ""
    
    def _search_knowledge_base(self, query: str, limit: int = 3) -> str:
        """Search knowledge base (FAQs, company info)"""
        try:
            # For now, return empty - knowledge base can be populated later
            # TODO: Search knowledge_embeddings table once populated
            
            # You can add static FAQs here as a starting point
            faqs = {
                "pricing": "Pricing is customized based on your specific needs. Please contact us for a quote.",
                "forms": "Forms can be created and customized through the Forms section. Customers receive forms via folders.",
                "quotes": "Quotes can be created by admins and shared with customers. Each quote includes line items with pricing.",
            }
            
            query_lower = query.lower()
            relevant_faqs = []
            
            for keyword, answer in faqs.items():
                if keyword in query_lower:
                    relevant_faqs.append(f"Q: About {keyword}\nA: {answer}")
                    if len(relevant_faqs) >= limit:
                        break
            
            if relevant_faqs:
                return "FREQUENTLY ASKED QUESTIONS:\n" + "\n\n".join(relevant_faqs)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching knowledge base: {str(e)}")
            return ""
    
    def _get_customer_context(self, customer_id: str) -> str:
        """Get customer-specific context"""
        try:
            context_parts = []
            
            # Get customer info
            client_response = supabase_storage.table("clients").select("name, company, email").eq("user_id", customer_id).single().execute()
            if client_response.data:
                client = client_response.data
                if client.get("company"):
                    context_parts.append(f"Customer Company: {client.get('company')}")
                if client.get("name"):
                    context_parts.append(f"Customer Name: {client.get('name')}")
            
            # Get customer's recent quotes count
            if client_response.data:
                client_id = client_response.data.get("id")
                if client_id:
                    quotes_response = supabase_storage.table("quotes").select("id", count="exact").eq("client_id", client_id).execute()
                    quote_count = quotes_response.count if hasattr(quotes_response, 'count') else 0
                    if quote_count > 0:
                        context_parts.append(f"Customer has {quote_count} quote(s)")
            
            if context_parts:
                return "CUSTOMER INFORMATION:\n" + "\n".join(context_parts)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error getting customer context: {str(e)}")
            return ""

# Singleton instance
_rag_service: Optional[RAGService] = None

def get_rag_service() -> RAGService:
    """Get or create RAG service instance"""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service

