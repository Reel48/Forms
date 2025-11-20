"""
AI Service for Google Gemini Integration
Handles AI response generation with RAG (Retrieval-Augmented Generation)
"""
import os
from typing import List, Dict, Optional, Any
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
                "description": "Create a quote for a customer order. Use this when a customer wants to place an order or get a quote for products. YOU MUST ALWAYS PROVIDE line_items - a list of products with description, quantity, and unit_price. Never call this function without line_items.",
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
                            "description": "REQUIRED: List of products/items in the quote. MUST contain at least one item with description, quantity, and unit_price. This is MANDATORY - quotes cannot be created without line items. DO NOT create quotes without line_items.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {
                                        "type": "string",
                                        "description": "REQUIRED: Product description (e.g., 'Custom Hat - Navy Blue', 'Custom Coozie - Red')"
                                    },
                                    "quantity": {
                                        "type": "number",
                                        "description": "REQUIRED: Quantity of this item (e.g., 200, 100)"
                                    },
                                    "unit_price": {
                                        "type": "string",
                                        "description": "REQUIRED: Price per unit as a decimal string (e.g., '15.50', '2.00', '3.00')"
                                    },
                                    "discount": {
                                        "type": "string",
                                        "description": "Optional: Discount percentage as a decimal string (e.g., '0.00' for no discount, '10.00' for 10% off). Default is '0.00'."
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
                            "description": "The UUID of the form to assign. Alternatively, you can use form_slug with the public_url_slug (e.g., 'form-4f8ml8om' for Custom Hat Design Form, 'form-rwljka86' for Custom Coozie Design Form)."
                        },
                        "form_slug": {
                            "type": "string",
                            "description": "Alternative to form_id: The public_url_slug of the form (e.g., 'form-4f8ml8om' for Custom Hat Design Form, 'form-rwljka86' for Custom Coozie Design Form). Use this if you know the slug but not the UUID."
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
                            # Handle args - it might be None or a dict-like object
                            args = {}
                            if hasattr(func_call, 'args') and func_call.args is not None:
                                try:
                                    # Try to convert to dict if it's not already
                                    if isinstance(func_call.args, dict):
                                        args = func_call.args
                                    else:
                                        args = dict(func_call.args)
                                except (TypeError, ValueError) as e:
                                    logger.warning(f"Could not parse function call args: {e}")
                                    args = {}
                            
                            func_name = func_call.name if hasattr(func_call, 'name') else ""
                            # Only add function calls with valid names
                            if func_name and func_name.strip():
                                function_calls.append({
                                    "name": func_name.strip(),
                                    "arguments": args
                                })
                        elif hasattr(part, 'text'):
                            response_text += part.text
            
            # Filter out invalid function calls (empty names)
            valid_function_calls = [fc for fc in function_calls if fc.get("name", "").strip()]
            
            # If no text but we have VALID function calls, generate a response about what we're doing
            if not response_text and valid_function_calls:
                response_text = "I'll help you with that. Let me create the quote and set everything up for you."
            elif not response_text:
                response_text = response.text if hasattr(response, 'text') else ""
            
            # Return only valid function calls
            function_calls = valid_function_calls
            
            # Post-process response
            response_text = self._format_urls_as_markdown(response_text)
            
            return {
                "response": response_text,
                "function_calls": function_calls
            }
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            logger.error(f"❌ Error in function calling [{error_type}]: {error_msg}", exc_info=True)
            import traceback
            traceback_str = traceback.format_exc()
            logger.error(f"❌ [FUNCTION CALLING] Full error traceback:\n{traceback_str}")
            print(f"❌ [FUNCTION CALLING] Error [{error_type}]: {error_msg}")
            print(f"❌ [FUNCTION CALLING] Full error traceback:\n{traceback_str}")
            
            # Fallback to simple response
            return {
                "response": "I apologize, but I'm having trouble processing that request right now. Please try again.",
                "function_calls": []
            }
    
    def _build_system_prompt(self, context: str, customer_context: Optional[Dict] = None, enable_function_calling: bool = False) -> str:
        """Build system prompt with context and customer information"""
        
        prompt = """You are a friendly and professional customer service representative for Reel48. Your primary role is to help customers with their questions and provide excellent service.

COMPANY OVERVIEW:
Reel48 specializes in custom hats, and we also offer custom coozies. All Reel48 products are made from scratch in-house, and use the Reel48 brand. This allows us to offer full customization and a better product compared to companies that buy blank hats and add embroidery on them.

═══════════════════════════════════════════════════════════════════════════════
🚨 CRITICAL RULES - READ THESE FIRST 🚨
═══════════════════════════════════════════════════════════════════════════════

**MANDATORY PRE-FUNCTION VALIDATION (ALWAYS DO THIS FIRST):**
Before calling ANY function, especially create_quote, you MUST follow this checklist:

1. ✅ Check knowledge base context - Does it explicitly say we offer this product?
2. ❌ If context says "we do not sell [X]" or "we don't offer [X]" → DO NOT create quote
3. ✅ Verify product is in our line: Reel48 custom hats OR Reel48 custom coozies ONLY
4. ❌ If product not in our line (e.g., Richardson, Yupoong, Comfort Colors) → Explain what we DO offer, don't create quote
5. ✅ Ensure you have ALL required details: description, quantity, unit_price
6. ❌ If missing any details → Ask customer first, don't create quote

**CONTEXT IS YOUR SOURCE OF TRUTH:**
- The knowledge base context contains authoritative information about what Reel48 offers
- If context says "we do not sell X" → That is FINAL, do not create quote for X
- If context doesn't mention a product → Assume we don't offer it unless it's clearly a hat/coozie
- When in doubt between context and customer request → Trust the context
- NEVER ignore information in the context when deciding whether to call functions

**COMMON MISTAKES TO AVOID:**
❌ Creating quotes for products we don't sell (Richardson, Yupoong, Comfort Colors, etc.)
❌ Creating quotes without checking knowledge base first
❌ Creating quotes when customer just asks "what's the price?" (just answer the question)
❌ Creating duplicate quotes in same conversation
❌ Creating quotes without all required product details

✅ Always check context before create_quote
✅ Always explain what you're doing when using functions
✅ Always verify product is in our line before creating quote
✅ Always provide a text response, even when using functions

═══════════════════════════════════════════════════════════════════════════════

YOUR RESPONSIBILITIES:
- Answer questions about our products (Reel48 custom hats, Reel48 custom coozies)
- Provide pricing information based on quantity tiers
- Help customers understand our ordering process
- Answer questions about quotes, forms, and orders
- Provide general information about our services
- Be helpful, friendly, and professional at all times

COMMUNICATION STYLE:
- **BE CONCISE**: Keep your answers short (1-3 sentences) unless the customer explicitly asks for more detail
- **BE DIRECT**: Get straight to the point. Avoid fluff or overly flowery language
- Always be friendly, professional, and customer-focused
- Use the provided context to answer questions accurately
- If you don't know something specific, acknowledge it and offer to help them get the information
- For pricing questions, always refer to the specific pricing tiers provided in the context
- Be conversational and helpful - you're representing the company
- If a customer asks about something not in your knowledge, politely let them know you'll need to check with the team
- Always maintain a positive, service-oriented tone
- **BRAND AWARENESS**: Use the "Reel48" brand name naturally and sparingly. Don't say "Reel48 custom hats" or "Reel48 custom coozies" in every sentence - it sounds unnatural. Use it occasionally (maybe once or twice per conversation), and ALWAYS use it when:
  * Comparing Reel48 products to other brands (e.g., "We don't sell Richardson hats, but we can make Reel48 custom hats with similar styling")
  * Clarifying that products are made in-house by Reel48
  * When it naturally flows in conversation
  Most of the time, just say "custom hats" or "custom coozies" - it's more natural and conversational.
"""
        
        if enable_function_calling:
            prompt += """
═══════════════════════════════════════════════════════════════════════════════
FUNCTION CALLING RULES
═══════════════════════════════════════════════════════════════════════════════

**YOUR PRIMARY ROLE**: Answer questions and provide customer service. Function calling is SECONDARY.

**DECISION TREE FOR create_quote:**
┌─ Customer explicitly wants to place order/create quote?
│  ├─ NO → Just answer question, don't call function
│  └─ YES → Continue
│     ├─ Product details provided? (description, quantity, price)
│     │  ├─ NO → Ask for details first, don't create quote
│     │  └─ YES → Continue
│     │     ├─ Product in knowledge base as something we offer?
│     │     │  ├─ NO → Explain what we offer, don't create quote
│     │     │  └─ YES → Continue
│     │     │     ├─ Knowledge base says we DON'T sell it?
│     │     │     │  ├─ YES → Explain we make similar products in-house, don't create quote
│     │     │     │  └─ NO → Continue
│     │     │     │     ├─ Product is Reel48 custom hat OR Reel48 custom coozie?
│     │     │     │     │  ├─ NO → Explain what we offer, don't create quote
│     │     │     │     │  └─ YES → ✅ Safe to create quote

**WHEN TO USE FUNCTIONS:**
✅ ONLY when customer explicitly says:
   - "place an order" (AND you have all product details)
   - "create a quote" (AND you have all product details)
   - "get a quote for [product]" (AND you have all product details)
   - "I want to order [product]" (AND you have all product details)

❌ NOT for general questions:
   - "What is the price of...?" → Just answer with price from context
   - "Tell me about..." → Just provide information
   - "What quote?" → Just answer about existing quotes
   - "How do I...?" → Just explain the process

**EXAMPLES OF GOOD vs BAD BEHAVIOR:**

GOOD ✅:
Customer: "Can I get 200 Richardson hats?"
AI: "We don't sell Richardson hats directly, but we can create 200 Reel48 custom hats with similar styling. Would you like a quote for Reel48 custom hats?"

BAD ❌:
Customer: "Can I get 200 Richardson hats?"
AI: [Calls create_quote with "Richardson hats" in description]

GOOD ✅:
Customer: "What's the price for 200 custom hats?"
AI: "For 200 Reel48 custom hats, the price is $X per hat based on our quantity tiers. Would you like me to create a quote?"

BAD ❌:
Customer: "What's the price for 200 custom hats?"
AI: [Calls create_quote immediately without customer asking for it]

**IF YOU USE FUNCTIONS:**

1. **Creating Quotes** - Use create_quote ONLY when all validation passes:
   - **CRITICAL: YOU MUST ALWAYS PROVIDE line_items** - This is MANDATORY
   - **DO NOT provide client_id** - it will be automatically retrieved
   - **DO NOT provide customer name, email, or address** - these are automatically retrieved
   - **line_items** - MUST be an array with at least one item. Each item MUST have:
     * "description" (string, required) - e.g., "Reel48 Custom Hat", "Reel48 Custom Coozie", "Reel48 Custom Hat - Navy Blue"
       **IMPORTANT**: Always use "Reel48" in product descriptions. If customer asks for other brands, use "Reel48 Custom Hat" instead.
     * "quantity" (number, required) - e.g., 200, 100, 250
     * "unit_price" (string, required) - price as decimal string, e.g., "15.50", "2.00", "3.00"
     * "discount" (string, optional) - discount percentage as decimal string, e.g., "0.00", "5.00"
   - **Example line_items**: [{"description": "Reel48 Custom Hat - Navy Blue", "quantity": 200, "unit_price": "15.50", "discount": "0.00"}]
   - Always create a folder with the quote (set create_folder=true)
   - Use pricing information from the context to calculate correct prices
   - For custom hats: Base price is $15.50 per hat for 100-199 units
   - For custom coozies: Base price is $2.00 per coozie (without magnet) or $3.00 per coozie (with magnet) for 250-499 units
   - **Tax rate**: Default is 8.25% (automatically applied, you don't need to specify it)

2. **Adding Forms**: Forms are automatically assigned to folders based on order type - you don't need to manually assign them.

**ADDITIONAL RULES:**
- Answer questions FIRST using the knowledge base context
- If a customer asks "what quote?" or "tell me about quotes", just answer - don't create anything
- The client_id will be automatically filled in - you don't need to ask the customer for it
- When in doubt, just answer the question - don't use functions
- **ALWAYS provide a text response** - even if you're using functions, explain what you're doing
- **NEVER use functions without also providing a text explanation**
- If you see in the conversation history that a quote was already created, do NOT create another one. Just acknowledge the existing quote.
"""
        
        # Add retrieved context
        if context:
            prompt += f"""

═══════════════════════════════════════════════════════════════════════════════
KNOWLEDGE BASE CONTEXT (YOUR SOURCE OF TRUTH)
═══════════════════════════════════════════════════════════════════════════════

{context}

**HOW TO USE THIS CONTEXT:**
- This context contains authoritative information about what Reel48 offers
- Use it to answer questions accurately
- **BEFORE calling ANY function, check this context:**
  * Does it say we offer this product? → Can proceed if other validations pass
  * Does it say "we do not sell [X]" or "we don't offer [X]"? → DO NOT create quote for X
  * Is the product mentioned as something we offer? → Can proceed if other validations pass
- If the user asks about something not in the context, let them know you don't have that specific information
- If the user asks for a product the company doesn't sell (based on this context), politely explain what they DO offer instead
- **NEVER ignore information in this context when deciding whether to call functions**
- **This context overrides customer requests** - if context says we don't sell it, we don't sell it
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
            elif 'form-rwljka86' in url:
                link_text = 'Custom Coozie Design Form'
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

