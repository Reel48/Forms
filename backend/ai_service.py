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
    
    def get_function_definitions(self) -> List[Dict]:
        """Get function definitions for Gemini function calling"""
        return [
            {
                "name": "create_quote",
                "description": "Create a quote for a customer order. Use this when a customer wants to place an order or get a quote for products.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "client_id": {
                            "type": "string",
                            "description": "The UUID of the client/customer for whom the quote is being created"
                        },
                        "title": {
                            "type": "string",
                            "description": "Title/name for the quote (e.g., 'Custom Hat Order - 100 units')"
                        },
                        "line_items": {
                            "type": "array",
                            "description": "List of products/items in the quote",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {
                                        "type": "string",
                                        "description": "Product description (e.g., 'Custom Hat - Navy Blue')"
                                    },
                                    "quantity": {
                                        "type": "number",
                                        "description": "Quantity of this item"
                                    },
                                    "unit_price": {
                                        "type": "string",
                                        "description": "Price per unit as a decimal string (e.g., '15.50')"
                                    },
                                    "discount": {
                                        "type": "string",
                                        "description": "Discount percentage as a decimal string (e.g., '0.00' for no discount, '10.00' for 10% off)"
                                    }
                                },
                                "required": ["description", "quantity", "unit_price"]
                            }
                        },
                        "tax_rate": {
                            "type": "string",
                            "description": "Tax rate as a decimal string (e.g., '0.00' for no tax, '8.50' for 8.5% tax)"
                        },
                        "create_folder": {
                            "type": "boolean",
                            "description": "Whether to create a folder for this order (default: true)"
                        }
                    },
                    "required": ["client_id", "title", "line_items"]
                }
            },
            {
                "name": "create_folder",
                "description": "Create a folder for a customer order/project. Folders organize quotes, forms, files, and e-signatures.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "client_id": {
                            "type": "string",
                            "description": "The UUID of the client/customer who owns this folder"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name of the folder (e.g., 'Custom Hat Order - 100 units')"
                        },
                        "quote_id": {
                            "type": "string",
                            "description": "Optional: UUID of the quote to link to this folder"
                        }
                    },
                    "required": ["client_id", "name"]
                }
            },
            {
                "name": "assign_form_to_folder",
                "description": "Assign a form to a customer's folder. Use this to add forms that customers need to fill out for their order.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "The UUID of the folder to assign the form to"
                        },
                        "form_id": {
                            "type": "string",
                            "description": "The UUID of the form to assign. Alternatively, you can use form_slug with the public_url_slug (e.g., 'form-4f8ml8om' for Custom Hat Design Form)."
                        },
                        "form_slug": {
                            "type": "string",
                            "description": "Alternative to form_id: The public_url_slug of the form (e.g., 'form-4f8ml8om' for Custom Hat Design Form). Use this if you know the slug but not the UUID."
                        }
                    },
                    "required": ["folder_id"]
                }
            },
            {
                "name": "assign_file_to_folder",
                "description": "Assign a file/document to a customer's folder.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "The UUID of the folder to assign the file to"
                        },
                        "file_id": {
                            "type": "string",
                            "description": "The UUID of the file to assign"
                        }
                    },
                    "required": ["folder_id", "file_id"]
                }
            },
            {
                "name": "assign_esignature_to_folder",
                "description": "Assign an e-signature document to a customer's folder.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "The UUID of the folder to assign the e-signature to"
                        },
                        "document_id": {
                            "type": "string",
                            "description": "The UUID of the e-signature document to assign"
                        }
                    },
                    "required": ["folder_id", "document_id"]
                }
            }
        ]
    
    def generate_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        context: str = "",
        customer_context: Optional[Dict] = None,
        enable_function_calling: bool = False
    ) -> Dict[str, Any]:
        """
        Generate AI response with context using RAG
        
        Args:
            user_message: The user's current message
            conversation_history: List of previous messages in format [{"role": "user", "content": "..."}, ...]
            context: Retrieved context from RAG search
            customer_context: Customer-specific information (quotes, forms, etc.)
            enable_function_calling: Whether to enable function calling for actions
        
        Returns:
            Dict with 'response' (string) and optionally 'function_calls' (list of function calls to execute)
        """
        try:
            # Build system prompt with context
            system_prompt = self._build_system_prompt(context, customer_context, enable_function_calling)
            
            # If function calling is enabled, use Gemini's function calling feature
            if enable_function_calling:
                return self._generate_with_function_calling(
                    user_message, conversation_history, system_prompt
                )
            
            # Otherwise, use simple text generation
            # Format conversation history for Gemini
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
                return {"response": response_text, "function_calls": []}
                
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
            error_response = "I apologize, but I'm having trouble processing your request right now. Please try again later or contact support."
            
            if "api key" in error_lower or "authentication" in error_lower or "permission" in error_lower:
                logger.error("Gemini API key issue detected")
                error_response = "I apologize, but there's an issue with the AI service configuration. Please contact support."
            elif "quota" in error_lower or "rate limit" in error_lower or "429" in error_msg:
                logger.error("Gemini API quota/rate limit issue")
                error_response = "I apologize, but the AI service is currently experiencing high demand. Please try again in a moment."
            elif "model" in error_lower or "not found" in error_lower or "404" in error_msg:
                logger.error(f"Gemini model issue detected: {error_msg}")
                error_response = f"I apologize, but there's an issue with the AI model: {error_msg[:100]}. Please contact support."
            elif "timeout" in error_lower or "timed out" in error_lower:
                logger.error("Gemini API timeout issue")
                error_response = "I apologize, but the AI service took too long to respond. Please try again in a moment."
            else:
                # Generic error - log the actual error for debugging
                logger.error(f"Unexpected error in AI generation: {error_type}: {error_msg}")
            
            return {"response": error_response, "function_calls": []}
    
    def _generate_with_function_calling(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        system_prompt: str
    ) -> Dict[str, Any]:
        """Generate response with function calling support"""
        try:
            # Convert conversation history to Gemini format
            messages = []
            
            # Add system prompt as first message
            messages.append({
                "role": "user",
                "parts": [system_prompt]
            })
            
            # Add conversation history
            for msg in conversation_history[-10:]:
                role = msg.get("role", "user")
                content = msg.get("content", msg.get("message", ""))
                if content:
                    if role == "model":
                        messages.append({"role": "model", "parts": [content]})
                    else:
                        messages.append({"role": "user", "parts": [content]})
            
            # Add current user message
            messages.append({"role": "user", "parts": [user_message]})
            
            # Get function definitions
            functions = self.get_function_definitions()
            
            # Create model with tools
            model_with_tools = genai.GenerativeModel(
                'gemini-2.5-flash',
                tools=[{"function_declarations": functions}]
            )
            
            # Generate response
            response = model_with_tools.generate_content(messages)
            
            # Check for function calls
            function_calls = []
            response_text = ""
            
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                
                # Check if there are function calls
                if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                    for part in candidate.content.parts:
                        if hasattr(part, 'function_call'):
                            # Extract function call
                            func_call = part.function_call
                            function_calls.append({
                                "name": func_call.name,
                                "arguments": dict(func_call.args) if hasattr(func_call, 'args') else {}
                            })
                        elif hasattr(part, 'text'):
                            response_text += part.text
            
            # If no text but we have function calls, generate a response about what we're doing
            if not response_text and function_calls:
                response_text = "I'll help you with that. Let me create the quote and set everything up for you."
            elif not response_text:
                response_text = response.text if hasattr(response, 'text') else ""
            
            # Post-process response
            response_text = self._format_urls_as_markdown(response_text)
            
            return {
                "response": response_text,
                "function_calls": function_calls
            }
        except Exception as e:
            logger.error(f"Error in function calling: {str(e)}", exc_info=True)
            # Fallback to simple response
            return {
                "response": "I apologize, but I'm having trouble processing that request right now. Please try again.",
                "function_calls": []
            }
    
    def _build_system_prompt(self, context: str, customer_context: Optional[Dict] = None, enable_function_calling: bool = False) -> str:
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
        
        if enable_function_calling:
            prompt += """
ACTION CAPABILITIES:
You can help customers by creating quotes and organizing their orders. When a customer wants to place an order or get a quote:

1. **Creating Quotes**: Use the create_quote function when a customer wants to order products. You'll need:
   - The customer's client_id (this will be automatically provided from the conversation context - you don't need to ask for it)
   - Product details (description, quantity, price)
   - Always create a folder with the quote (set create_folder=true)
   - Use pricing information from the context to calculate correct prices
   - For custom hats: Base price is $15.50 per hat for 100-199 units, with lower prices for larger quantities
   - For custom coozies: Base price is $2.00 per coozie (without magnet) or $3.00 per coozie (with magnet) for 250-499 units

2. **Adding Forms**: After creating a quote/folder, assign the Custom Hat Design Form for hat orders:
   - Use assign_form_to_folder with form_slug='form-4f8ml8om' (you can use the slug instead of form_id)
   - This form is required for all custom hat orders

3. **Workflow**: 
   - Customer expresses interest in ordering → Ask clarifying questions if needed (quantity, colors, specifications)
   - Once you have the information → Create quote with folder (create_folder=true)
   - For hat orders → Automatically assign Custom Hat Design Form to the folder
   - Confirm completion and provide links to the quote and form

IMPORTANT: 
- Always confirm with the customer before creating quotes. Ask for any missing information (quantities, colors, specifications) before proceeding.
- Use the pricing information from the context to ensure accurate pricing.
- The client_id will be automatically filled in - you don't need to ask the customer for it.
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

