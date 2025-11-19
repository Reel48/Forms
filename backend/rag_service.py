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
        limit: int = 5,
        is_admin: bool = False
    ) -> str:
        """
        Retrieve relevant context for a user query
        
        Args:
            user_query: The user's query/question
            customer_id: Customer ID - REQUIRED for data isolation (only this customer's data)
            limit: Maximum number of results to return
            is_admin: Whether the requester is an admin (admins see all data)
        
        Returns:
            Formatted context string
        """
        try:
            context_parts = []
            
            # SECURITY: Always require customer_id for customer requests
            # Admins can see all data, but customers can ONLY see their own
            if not is_admin and not customer_id:
                logger.warning("Customer context requested without customer_id - denying access")
                return ""
            
            # 1. Get pricing information (from pricing table, not quotes)
            pricing_context = self._get_pricing_info(user_query, limit)
            if pricing_context:
                context_parts.append(pricing_context)
            
            # 2. Search customer's own quotes (only if customer_id provided)
            if customer_id:
                quote_context = self._search_customer_quotes(user_query, customer_id, limit)
                if quote_context:
                    context_parts.append(quote_context)
            
            # 3. Search customer's own forms (only if customer_id provided)
            if customer_id:
                form_context = self._search_customer_forms(user_query, customer_id, limit)
                if form_context:
                    context_parts.append(form_context)
            
            # 4. Search knowledge base (FAQs, company info) - public info only
            knowledge_context = self._search_knowledge_base(user_query, limit)
            if knowledge_context:
                context_parts.append(knowledge_context)
            
            # 5. Get customer-specific information (only their own)
            if customer_id:
                customer_context = self._get_customer_context(customer_id)
                if customer_context:
                    context_parts.append(customer_context)
            
            return "\n\n".join(context_parts) if context_parts else ""
            
        except Exception as e:
            logger.error(f"Error retrieving context: {str(e)}", exc_info=True)
            return ""
    
    def _get_pricing_info(self, query: str, limit: int = 10) -> str:
        """Get pricing information from pricing table (not from quotes)"""
        try:
            query_lower = query.lower()
            
            # Search pricing products
            products_query = supabase_storage.table("pricing_products").select("*").eq("is_active", True)
            products_response = products_query.limit(limit * 2).execute()
            products = products_response.data if products_response.data else []
            
            # Filter relevant products based on query
            relevant_products = []
            for product in products:
                name = (product.get("product_name") or "").lower()
                description = (product.get("description") or "").lower()
                category = (product.get("category") or "").lower()
                
                # Check if query keywords match
                if any(keyword in name or keyword in description or keyword in category for keyword in query_lower.split()):
                    relevant_products.append(product)
                    if len(relevant_products) >= limit:
                        break
            
            # If no specific matches, include all active products (up to limit)
            if not relevant_products:
                relevant_products = products[:limit]
            
            if relevant_products:
                product_texts = []
                for product in relevant_products[:limit]:
                    name = product.get("product_name", "Product")
                    price = product.get("base_price", 0)
                    unit = product.get("unit", "each")
                    description = product.get("description", "")
                    category = product.get("category", "")
                    product_id = product.get("id")
                    
                    # Get pricing tiers for this product
                    tiers_response = supabase_storage.table("pricing_tiers").select("*").eq("product_id", product_id).order("min_quantity", desc=False).execute()
                    tiers = tiers_response.data if tiers_response.data else []
                    
                    if tiers:
                        # Product has tiered pricing
                        tier_texts = []
                        for tier in tiers:
                            min_qty = int(tier.get("min_quantity", 0))
                            max_qty = tier.get("max_quantity")
                            tier_price = tier.get("price_per_unit", 0)
                            
                            if max_qty:
                                tier_texts.append(f"  {min_qty}-{int(max_qty)}: ${tier_price:.2f} per {unit}")
                            else:
                                tier_texts.append(f"  {min_qty}+: ${tier_price:.2f} per {unit}")
                        
                        product_text = f"{name}:\n" + "\n".join(tier_texts)
                    else:
                        # Product has simple base pricing
                        product_text = f"{name}: ${price:.2f} per {unit}"
                    
                    if category:
                        product_text += f"\n  Category: {category}"
                    if description:
                        product_text += f"\n  {description}"
                    product_texts.append(product_text)
                
                # Get discounts
                discounts_response = supabase_storage.table("pricing_discounts").select("*").eq("is_active", True).limit(5).execute()
                discounts = discounts_response.data if discounts_response.data else []
                
                discount_texts = []
                for discount in discounts:
                    name = discount.get("discount_name", "")
                    discount_type = discount.get("discount_type", "")
                    value = discount.get("discount_value", 0)
                    
                    if discount_type == "percentage":
                        discount_text = f"{name}: {value}% off"
                    elif discount_type == "fixed_amount":
                        discount_text = f"{name}: ${value} off"
                    else:
                        discount_text = f"{name}: {discount_type} discount"
                    
                    min_qty = discount.get("min_quantity")
                    if min_qty:
                        discount_text += f" (min quantity: {min_qty})"
                    
                    discount_texts.append(discount_text)
                
                pricing_text = "PRICING INFORMATION:\n" + "\n".join(product_texts)
                if discount_texts:
                    pricing_text += "\n\nAVAILABLE DISCOUNTS:\n" + "\n".join(discount_texts)
                
                return pricing_text
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error getting pricing info: {str(e)}")
            return ""
    
    def _search_customer_quotes(
        self,
        query: str,
        customer_id: str,
        limit: int = 5
    ) -> str:
        """Search ONLY the customer's own quotes (strict data isolation)"""
        try:
            # SECURITY: Always filter by customer_id - never show other customers' quotes
            query_lower = query.lower()
            
            # Get client_id from customer_id (user_id)
            client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
            if not client_response.data:
                return ""  # Customer not found, return empty
            
            client_id = client_response.data["id"]
            
            # Search ONLY this customer's quotes
            quotes_query = supabase_storage.table("quotes").select("id, title, quote_number, total, status").eq("client_id", client_id)
            quotes_response = quotes_query.limit(limit * 2).execute()
            quotes = quotes_response.data if quotes_response.data else []
            
            # Filter quotes that might be relevant
            relevant_quotes = []
            for quote in quotes:
                title = (quote.get("title") or "").lower()
                quote_number = (quote.get("quote_number") or "").lower()
                
                if any(keyword in title or keyword in quote_number for keyword in query_lower.split()):
                    relevant_quotes.append(quote)
                    if len(relevant_quotes) >= limit:
                        break
            
            # Format quote context (without pricing details - pricing comes from pricing table)
            if relevant_quotes:
                quote_texts = []
                for quote in relevant_quotes[:limit]:
                    quote_text = f"Your Quote #{quote.get('quote_number', 'N/A')}: {quote.get('title', 'Untitled')}"
                    if quote.get('status'):
                        quote_text += f" - Status: {quote.get('status')}"
                    quote_texts.append(quote_text)
                
                return "YOUR QUOTES:\n" + "\n".join(quote_texts)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching customer quotes: {str(e)}")
            return ""
    
    def _search_customer_forms(
        self,
        query: str,
        customer_id: str,
        limit: int = 5
    ) -> str:
        """Search ONLY forms assigned to this customer (strict data isolation)"""
        try:
            # SECURITY: Only show forms that are assigned to this customer via folders
            query_lower = query.lower()
            
            # Get forms assigned to this customer through folders
            # First, get folders assigned to this customer
            client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
            if not client_response.data:
                return ""
            
            client_id = client_response.data["id"]
            
            # Get folders assigned to this customer (via client_id or folder_assignments)
            folders_response = supabase_storage.table("folders").select("id").eq("client_id", client_id).execute()
            folders = folders_response.data if folders_response.data else []
            folder_ids = [f["id"] for f in folders]
            
            if not folder_ids:
                return ""  # Customer has no folders
            
            # Get form IDs from form_folder_assignments junction table
            form_assignments_response = supabase_storage.table("form_folder_assignments").select("form_id").in_("folder_id", folder_ids).execute()
            form_assignments = form_assignments_response.data if form_assignments_response.data else []
            form_ids = list(set([fa.get("form_id") for fa in form_assignments if fa.get("form_id")]))
            
            if not form_ids:
                return ""  # Customer has no assigned forms
            
            # Get forms that are assigned to this customer
            forms_query = supabase_storage.table("forms").select("id, name, description, status").in_("id", form_ids).eq("status", "published")
            forms_response = forms_query.limit(limit * 2).execute()
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
                    form_text = f"Your Form: {form.get('name', 'Untitled')}"
                    if form.get('description'):
                        form_text += f" - {form.get('description')}"
                    form_texts.append(form_text)
                
                return "YOUR FORMS:\n" + "\n".join(form_texts)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching customer forms: {str(e)}")
            return ""
    
    def _search_knowledge_base(self, query: str, limit: int = 5) -> str:
        """Search knowledge base (FAQs, company info)"""
        try:
            query_lower = query.lower()
            context_items = []
            
            # Search knowledge_embeddings table
            try:
                knowledge_response = supabase_storage.table("knowledge_embeddings").select("*").limit(limit * 2).execute()
                knowledge_items = knowledge_response.data if knowledge_response.data else []
                
                # Filter relevant items based on query keywords
                relevant_items = []
                for item in knowledge_items:
                    content = (item.get("content") or "").lower()
                    metadata = item.get("metadata") or {}
                    title = (metadata.get("title") or "").lower()
                    category = (metadata.get("category") or "").lower()
                    
                    # Check if query keywords match
                    if any(keyword in content or keyword in title or keyword in category for keyword in query_lower.split()):
                        relevant_items.append(item)
                        if len(relevant_items) >= limit:
                            break
                
                # If no specific matches, include all items (up to limit)
                if not relevant_items:
                    relevant_items = knowledge_items[:limit]
                
                # Format knowledge base items
                for item in relevant_items[:limit]:
                    content = item.get("content", "")
                    metadata = item.get("metadata") or {}
                    title = metadata.get("title", "Information")
                    
                    if content:
                        context_items.append(f"{title}:\n{content}")
                
            except Exception as e:
                logger.warning(f"Error searching knowledge_embeddings table: {str(e)}")
                # Fallback to static FAQs if table doesn't exist or has issues
                faqs = {
                    "pricing": "Pricing is customized based on your specific needs. Please contact us for a quote.",
                    "forms": "Forms can be created and customized through the Forms section. Customers receive forms via folders.",
                    "quotes": "Quotes can be created by admins and shared with customers. Each quote includes line items with pricing.",
                }
                
                for keyword, answer in faqs.items():
                    if keyword in query_lower:
                        context_items.append(f"Q: About {keyword}\nA: {answer}")
                        if len(context_items) >= limit:
                            break
            
            if context_items:
                return "COMPANY AND PRODUCT INFORMATION:\n\n" + "\n\n".join(context_items)
            
            return ""
            
        except Exception as e:
            logger.warning(f"Error searching knowledge base: {str(e)}")
            return ""
    
    def _get_customer_context(self, customer_id: str) -> str:
        """Get customer-specific context (only their own information)"""
        try:
            # SECURITY: Only get information for this specific customer
            context_parts = []
            
            # Get customer info
            client_response = supabase_storage.table("clients").select("name, company, email").eq("user_id", customer_id).single().execute()
            if client_response.data:
                client = client_response.data
                if client.get("company"):
                    context_parts.append(f"Company: {client.get('company')}")
                if client.get("name"):
                    context_parts.append(f"Name: {client.get('name')}")
            
            # Get customer's quote count (for context, not pricing)
            if client_response.data:
                client_id = client_response.data.get("id")
                if client_id:
                    quotes_response = supabase_storage.table("quotes").select("id", count="exact").eq("client_id", client_id).execute()
                    quote_count = quotes_response.count if hasattr(quotes_response, 'count') else 0
                    if quote_count > 0:
                        context_parts.append(f"You have {quote_count} quote(s)")
            
            if context_parts:
                return "YOUR INFORMATION:\n" + "\n".join(context_parts)
            
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

