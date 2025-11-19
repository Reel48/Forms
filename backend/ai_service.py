"""
AI Service for Google Gemini Integration
Handles AI response generation with RAG (Retrieval-Augmented Generation)
"""
import os
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Try to import google.generativeai - make it optional so app can start without it
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    GENAI_AVAILABLE = False
    logger.warning("google-generativeai package not installed - AI features will not be available")

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY and GENAI_AVAILABLE and genai:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to configure Gemini API: {str(e)}")
elif not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables")

class AIService:
    """Service for interacting with Google Gemini AI"""
    
    def __init__(self):
        print(f"🔧 [AI SERVICE] Initializing AI service...")
        logger.info(f"🔧 [AI SERVICE] Initializing AI service...")
        if not GENAI_AVAILABLE or not genai:
            error_msg = "google-generativeai package is not installed"
            print(f"❌ [AI SERVICE] {error_msg}")
            raise ValueError(error_msg)
        if not GEMINI_API_KEY:
            error_msg = "GEMINI_API_KEY environment variable is required"
            print(f"❌ [AI SERVICE] {error_msg}")
            logger.warning("GEMINI_API_KEY not set - AI service will not be available")
            raise ValueError(error_msg)
        print(f"✅ [AI SERVICE] GEMINI_API_KEY found (length: {len(GEMINI_API_KEY)} chars)")
        try:
            # Use gemini-1.5-flash - fast, cost-effective, and reliable for customer service
            # gemini-pro has been deprecated, so we use the newer 1.5 models
            # gemini-1.5-flash was not found, so we use the available 2.5-flash model
            print(f"🔧 [AI SERVICE] Initializing gemini-2.5-flash model...")
            
            # List available models for debugging
            try:
                print("🔧 [AI SERVICE] Listing available models...")
                for m in genai.list_models():
                    if 'generateContent' in m.supported_generation_methods:
                        print(f"  - {m.name}")
            except Exception as e:
                print(f"⚠️ [AI SERVICE] Failed to list models: {e}")

            self.model = genai.GenerativeModel('gemini-2.5-flash')
            print(f"✅ [AI SERVICE] Successfully initialized Gemini model: gemini-2.5-flash")
            logger.info(f"✅ [AI SERVICE] Successfully initialized Gemini model: gemini-2.5-flash")
            
            self.embedding_model = None  # Will be set when needed
            print(f"✅ [AI SERVICE] AI service initialization complete")
        except Exception as e:
            error_msg = f"Failed to initialize Gemini model: {str(e)}"
            print(f"❌ [AI SERVICE] {error_msg}")
            logger.error(f"❌ [AI SERVICE] {error_msg}", exc_info=True)
            import traceback
            print(f"❌ [AI SERVICE] Traceback:\n{traceback.format_exc()}")
            raise
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for text using Gemini's embedding model
        Note: Gemini Pro doesn't have a separate embedding model, so we'll use
        a workaround or use a different embedding service
        For now, we'll use a simple text-based approach or integrate with
        Google's text-embedding-004 model via API
        """
        # TODO: Implement proper embedding generation
        # For now, return empty list - will implement with actual embedding API
        # You may want to use Google's text-embedding-004 or another embedding service
        logger.warning("Embedding generation not yet implemented - using placeholder")
        return []
    
    def generate_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        context: str = "",
        customer_context: Optional[Dict] = None
    ) -> str:
        """
        Generate AI response with context using RAG
        
        Args:
            user_message: The user's current message
            conversation_history: List of previous messages in format [{"role": "user", "content": "..."}, ...]
            context: Retrieved context from RAG search
            customer_context: Customer-specific information (quotes, forms, etc.)
        
        Returns:
            AI-generated response string
        """
        try:
            # Build system prompt with context
            system_prompt = self._build_system_prompt(context, customer_context)
            
            # Format conversation history for Gemini
            # Gemini uses a different format - we need to use ChatSession or format properly
            # For now, we'll combine system prompt with user message and use simple format
            full_prompt = f"{system_prompt}\n\n"
            
            # Add conversation history
            if conversation_history:
                full_prompt += "Previous conversation:\n"
                for msg in conversation_history[-10:]:  # Limit to last 10 messages for context
                    role = msg.get("role", "user")
                    content = msg.get("content", msg.get("message", ""))
                    if content:
                        if role == "model":
                            full_prompt += f"Assistant: {content}\n"
                        else:
                            full_prompt += f"User: {content}\n"
                full_prompt += "\n"
            
            # Add current user message
            full_prompt += f"User: {user_message}\n\nAssistant:"
            
            logger.debug(f"Generated prompt length: {len(full_prompt)} characters")
            
            # Generate response using simple prompt format
            try:
                print(f"🔧 [AI SERVICE] Calling Gemini API with prompt length: {len(full_prompt)} chars")
                print(f"🔧 [AI SERVICE] Using model: {self.model._model_name if hasattr(self.model, '_model_name') else 'unknown'}")
                logger.debug(f"🔧 [AI SERVICE] Calling Gemini API with prompt length: {len(full_prompt)} chars")
                response = self.model.generate_content(full_prompt)
                print(f"🔧 [AI SERVICE] Received response from Gemini API")
                
                # Check if response has text
                if not response or not hasattr(response, 'text'):
                    error_msg = f"Invalid response from Gemini API: {response}"
                    print(f"❌ [AI SERVICE] {error_msg}")
                    logger.error(f"❌ [AI SERVICE] {error_msg}")
                    raise ValueError("Invalid response from Gemini API")
                
                response_text = response.text
                if not response_text or len(response_text.strip()) == 0:
                    error_msg = "Empty response from Gemini API"
                    print(f"⚠️ [AI SERVICE] {error_msg}")
                    logger.warning(f"⚠️ [AI SERVICE] {error_msg}")
                    raise ValueError("Empty response from Gemini API")
                
                # Post-process response to convert plain URLs to markdown format
                response_text = self._format_urls_as_markdown(response_text)
                
                print(f"✅ [AI SERVICE] Successfully generated AI response: {len(response_text)} characters")
                logger.info(f"✅ [AI SERVICE] Successfully generated AI response: {len(response_text)} characters")
                return response_text
                
            except Exception as api_error:
                error_msg = str(api_error)
                error_type = type(api_error).__name__
                print(f"❌ [AI SERVICE] Gemini API error [{error_type}]: {error_msg}")
                logger.error(f"❌ [AI SERVICE] Gemini API error [{error_type}]: {error_msg}", exc_info=True)
                import traceback
                traceback_str = traceback.format_exc()
                print(f"❌ [AI SERVICE] Full traceback:\n{traceback_str}")
                logger.error(f"❌ [AI SERVICE] Full traceback:\n{traceback_str}")
                # Re-raise to be caught by outer exception handler
                raise
            
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"❌ [AI SERVICE] Error generating AI response [{error_type}]: {error_msg}")
            logger.error(f"❌ Error generating AI response [{error_type}]: {error_msg}", exc_info=True)
            import traceback
            traceback_str = traceback.format_exc()
            print(f"❌ [AI SERVICE] Full error traceback:\n{traceback_str}")
            logger.error(f"❌ [AI SERVICE] Full error traceback:\n{traceback_str}")
            
            # Provide more specific error messages based on error type
            error_lower = error_msg.lower()
            if "api key" in error_lower or "authentication" in error_lower or "permission" in error_lower:
                logger.error("Gemini API key issue detected")
                return "I apologize, but there's an issue with the AI service configuration. Please contact support."
            elif "quota" in error_lower or "rate limit" in error_lower or "429" in error_msg:
                logger.error("Gemini API quota/rate limit issue")
                return "I apologize, but the AI service is currently experiencing high demand. Please try again in a moment."
            elif "model" in error_lower or "not found" in error_lower or "404" in error_msg:
                logger.error(f"Gemini model issue detected: {error_msg}")
                return f"I apologize, but there's an issue with the AI model: {error_msg[:100]}. Please contact support."
            elif "timeout" in error_lower or "timed out" in error_lower:
                logger.error("Gemini API timeout issue")
                return "I apologize, but the AI service took too long to respond. Please try again in a moment."
            else:
                # Generic error - log the actual error for debugging
                logger.error(f"Unexpected error in AI generation: {error_type}: {error_msg}")
                return f"I apologize, but I'm having trouble processing your request right now. Error: {error_type}. Please try again later or contact support."
    
    def _build_system_prompt(self, context: str, customer_context: Optional[Dict] = None) -> str:
        """Build system prompt with context and customer information"""
        
        prompt = """You are a friendly and professional customer service representative for a custom promotional products company. Your primary role is to help customers with their questions and provide excellent service.

COMPANY OVERVIEW:
We specialize in custom promotional products, including custom hats and custom coozies (with and without magnets). We work with businesses, events, and organizations to create high-quality branded merchandise.

YOUR RESPONSIBILITIES:
- Answer questions about our products (custom hats, custom coozies)
- Provide pricing information based on quantity tiers
- Help customers understand our ordering process
- Answer questions about quotes, forms, and orders
- Provide general information about our services
- Be helpful, friendly, and professional at all times

IMPORTANT GUIDELINES:
- **BE CONCISE**: Keep your answers short (1-3 sentences) unless the customer explicitly asks for more detail.
- **BE DIRECT**: Get straight to the point. Avoid fluff or overly flowery language.
- Always be friendly, professional, and customer-focused
- Use the provided context to answer questions accurately
- If you don't know something specific, acknowledge it and offer to help them get the information
- For pricing questions, always refer to the specific pricing tiers provided in the context
- Be conversational and helpful - you're representing the company
- If a customer asks about something not in your knowledge, politely let them know you'll need to check with the team
- Always maintain a positive, service-oriented tone
- **CRITICAL**: When recommending that a customer fill out a form, you MUST include the complete form link/URL in your response. Never recommend a form without providing the link. If the context contains a form link, always include it in your recommendation.
- **LINK FORMATTING**: Always format links using markdown format: [link text](url). For example, instead of "Fill out the form at https://reel48.app/public/form/form-4f8ml8om", write "Fill out the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om)". This makes links clickable and more user-friendly. Never paste raw URLs - always use markdown link format [text](url).
"""
        
        # Add retrieved context
        if context:
            prompt += f"""

RELEVANT CONTEXT FROM KNOWLEDGE BASE:
{context}

Use this context to answer questions accurately. If the user asks about something not in the context, let them know you don't have that specific information.
"""
        
        # Add customer-specific context
        if customer_context:
            customer_info = []
            
            if customer_context.get("quotes"):
                customer_info.append(f"\nCustomer's Quotes: {customer_context['quotes']}")
            
            if customer_context.get("forms"):
                customer_info.append(f"\nCustomer's Forms: {customer_context['forms']}")
            
            if customer_context.get("company"):
                customer_info.append(f"\nCustomer's Company: {customer_context['company']}")
            
            if customer_info:
                prompt += "\n\nCUSTOMER-SPECIFIC INFORMATION:" + "\n".join(customer_info)
        
        return prompt
    
    def _format_urls_as_markdown(self, text: str) -> str:
        """
        Convert plain URLs in text to markdown format [text](url)
        This ensures links are always clickable in the chat interface
        """
        import re
        
        # Skip if text already contains markdown links
        if re.search(r'\[.*?\]\(https?://', text):
            return text
        
        # Pattern to match URLs (http/https or www.)
        # Exclude URLs that are already inside markdown links
        url_pattern = r'(?<!\]\()(https?://[^\s\)]+|www\.[^\s\)]+)'
        
        def replace_url(match):
            url = match.group(0)
            
            # Determine link text based on URL
            link_text = url
            if 'form-4f8ml8om' in url:
                link_text = 'Custom Hat Design Form'
            elif '/form/' in url:
                link_text = 'form'
            elif '/quote/' in url:
                link_text = 'quote'
            elif '/file/' in url:
                link_text = 'file'
            
            # Ensure URL has protocol
            full_url = url if url.startswith(('http://', 'https://')) else f'https://{url}'
            return f'[{link_text}]({full_url})'
        
        # Replace URLs with markdown format
        text = re.sub(url_pattern, replace_url, text)
        
        return text

# Singleton instance
_ai_service: Optional[AIService] = None

def get_ai_service() -> Optional[AIService]:
    """Get or create AI service instance. Returns None if initialization fails."""
    global _ai_service
    if _ai_service is None:
        try:
            _ai_service = AIService()
            print(f"✅ [AI SERVICE] AI service successfully initialized")
            logger.info(f"✅ [AI SERVICE] AI service successfully initialized")
        except Exception as e:
            error_msg = f"Failed to initialize AI service: {str(e)}"
            print(f"❌ [AI SERVICE] {error_msg}")
            logger.error(f"❌ [AI SERVICE] {error_msg}", exc_info=True)
            # Don't raise - allow app to start without AI
            _ai_service = None
    return _ai_service

