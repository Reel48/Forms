"""
AI Service for Google Gemini Integration
Handles AI response generation with RAG (Retrieval-Augmented Generation)
"""
import os
import google.generativeai as genai
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY and genai:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to configure Gemini API: {str(e)}")
elif not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables")

class AIService:
    """Service for interacting with Google Gemini AI"""
    
    def __init__(self):
        if not genai:
            raise ValueError("google-generativeai package is not installed")
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not set - AI service will not be available")
            raise ValueError("GEMINI_API_KEY environment variable is required")
        try:
            # Try gemini-1.5-pro first (newer model), fallback to gemini-pro
            try:
                self.model = genai.GenerativeModel('gemini-1.5-pro')
                logger.info("Initialized Gemini model: gemini-1.5-pro")
            except Exception as e1:
                logger.warning(f"Failed to initialize gemini-1.5-pro: {str(e1)}, trying gemini-pro")
                self.model = genai.GenerativeModel('gemini-pro')
                logger.info("Initialized Gemini model: gemini-pro")
            self.embedding_model = None  # Will be set when needed
        except Exception as e:
            logger.error(f"Failed to initialize Gemini model: {str(e)}", exc_info=True)
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
                response = self.model.generate_content(full_prompt)
                
                # Check if response has text
                if not response or not hasattr(response, 'text'):
                    logger.error(f"Invalid response from Gemini API: {response}")
                    raise ValueError("Invalid response from Gemini API")
                
                response_text = response.text
                if not response_text or len(response_text.strip()) == 0:
                    logger.warning("Empty response from Gemini API")
                    raise ValueError("Empty response from Gemini API")
                
                logger.info(f"Successfully generated AI response: {len(response_text)} characters")
                return response_text
                
            except Exception as api_error:
                logger.error(f"Gemini API error: {str(api_error)}", exc_info=True)
                # Re-raise to be caught by outer exception handler
                raise
            
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            logger.error(f"❌ Error generating AI response [{error_type}]: {error_msg}", exc_info=True)
            
            # Provide more specific error messages based on error type
            if "API key" in error_msg or "authentication" in error_msg.lower():
                logger.error("Gemini API key issue detected")
                return "I apologize, but there's an issue with the AI service configuration. Please contact support."
            elif "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
                logger.error("Gemini API quota/rate limit issue")
                return "I apologize, but the AI service is currently experiencing high demand. Please try again in a moment."
            elif "model" in error_msg.lower() or "not found" in error_msg.lower():
                logger.error("Gemini model issue detected")
                return "I apologize, but there's an issue with the AI model. Please contact support."
            else:
                # Generic error - log the actual error for debugging
                logger.error(f"Unexpected error in AI generation: {error_type}: {error_msg}")
                return "I apologize, but I'm having trouble processing your request right now. Please try again later."
    
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
- Always be friendly, professional, and customer-focused
- Use the provided context to answer questions accurately
- If you don't know something specific, acknowledge it and offer to help them get the information
- For pricing questions, always refer to the specific pricing tiers provided in the context
- Be conversational and helpful - you're representing the company
- If a customer asks about something not in your knowledge, politely let them know you'll need to check with the team
- Keep responses helpful but concise
- Always maintain a positive, service-oriented tone
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

# Singleton instance
_ai_service: Optional[AIService] = None

def get_ai_service() -> AIService:
    """Get or create AI service instance"""
    global _ai_service
    if _ai_service is None:
        try:
            _ai_service = AIService()
        except ValueError as e:
            logger.error(f"Failed to initialize AI service: {str(e)}")
            raise
    return _ai_service

