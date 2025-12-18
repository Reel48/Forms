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

# Optional multimodal support (images) for google.generativeai
try:
    from google.generativeai.types import Part  # type: ignore
except Exception:
    Part = None  # type: ignore

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
            # Get model name from environment variable, default to gemini-3-pro-preview
            model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-3-pro-preview")
            print(f"🔧 [AI SERVICE] Using model: {model_name}")
            
            # List available models for debugging
            try:
                print("🔧 [AI SERVICE] Listing available models...")
                available_models = []
                for m in genai.list_models():
                    if 'generateContent' in m.supported_generation_methods:
                        model_display_name = m.name.split('/')[-1] if '/' in m.name else m.name
                        available_models.append(model_display_name)
                        print(f"  - {model_display_name}")
                
                # Check if requested model is available
                if model_name not in available_models:
                    print(f"⚠️ [AI SERVICE] Warning: Model '{model_name}' not found in available models")
                    print(f"⚠️ [AI SERVICE] Available models: {', '.join(available_models)}")
            except Exception as e:
                print(f"⚠️ [AI SERVICE] Failed to list models: {e}")

            # Try to initialize the requested model, fallback to gemini-2.5-flash if it fails
            try:
                self.model = genai.GenerativeModel(model_name)
                print(f"✅ [AI SERVICE] Successfully initialized Gemini model: {model_name}")
                logger.info(f"✅ [AI SERVICE] Successfully initialized Gemini model: {model_name}")
            except Exception as model_error:
                print(f"⚠️ [AI SERVICE] Failed to initialize {model_name}: {model_error}")
                print(f"⚠️ [AI SERVICE] Falling back to gemini-2.5-flash...")
                logger.warning(f"Failed to initialize {model_name}, falling back to gemini-2.5-flash: {model_error}")
                try:
                    self.model = genai.GenerativeModel('gemini-2.5-flash')
                    print(f"✅ [AI SERVICE] Successfully initialized fallback model: gemini-2.5-flash")
                    logger.info(f"✅ [AI SERVICE] Successfully initialized fallback model: gemini-2.5-flash")
                except Exception as fallback_error:
                    print(f"❌ [AI SERVICE] Fallback model also failed: {fallback_error}")
                    raise
            
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
                "description": "Create a quote for a customer order. Use this when a customer explicitly wants a quote or to place an order. YOU MUST ALWAYS PROVIDE line_items - a list of products with description, quantity, and unit_price. Never call this function without line_items. Confirmation: Only call if the customer clearly asked you to create a quote/order, OR set confirmed=true after the customer explicitly confirms. 🚨 CRITICAL: For hat quotes, you MUST ask about side embroideries BEFORE calling this function. Do NOT call create_quote for hats until you have asked: 'Would you like any side embroideries on the hats? You can add one on the left side, one on the right side, or both. For orders under 300 units, each side embroidery is $1 per hat. For orders of 300 or more, side embroideries are included at no additional cost.'",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "confirmed": {
                            "type": "boolean",
                            "description": "Set true only after the customer explicitly confirms they want you to create the quote now."
                        },
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
                "name": "update_quote",
                "description": "Update an existing quote. Use this when you need to correct a mistake in a quote you just created, add missing items (like side embroideries), or modify the quote. This replaces all line items in the quote with the new ones you provide.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "quote_id": {
                            "type": "string",
                            "description": "REQUIRED: The UUID of the quote to update"
                        },
                        "title": {
                            "type": "string",
                            "description": "Optional: New title/name for the quote"
                        },
                        "notes": {
                            "type": "string",
                            "description": "Optional: Notes to add or update on the quote"
                        },
                        "line_items": {
                            "type": "array",
                            "description": "REQUIRED: Complete list of all line items for the quote. This REPLACES all existing line items. Include ALL items you want in the quote (original items plus any additions like side embroideries).",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {
                                        "type": "string",
                                        "description": "REQUIRED: Product description (e.g., 'Custom Hat - Navy Blue', 'Side Embroidery - Left (under 300 units)')"
                                    },
                                    "quantity": {
                                        "type": "number",
                                        "description": "REQUIRED: Quantity of this item"
                                    },
                                    "unit_price": {
                                        "type": "string",
                                        "description": "REQUIRED: Price per unit as a decimal string (e.g., '15.50', '1.00', '0.00')"
                                    },
                                    "discount": {
                                        "type": "string",
                                        "description": "Optional: Discount percentage as a decimal string (default: '0.00')"
                                    }
                                },
                                "required": ["description", "quantity", "unit_price"]
                            }
                        },
                        "tax_rate": {
                            "type": "string",
                            "description": "Optional: Tax rate as a decimal string (e.g., '8.25' for 8.25%). If not provided, uses existing tax rate."
                        }
                    },
                    "required": ["quote_id", "line_items"]
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
            },
            {
                "name": "get_availability",
                "description": "🚨 USE THIS FOR SCHEDULING MEETINGS ONLY! When a customer wants to schedule a meeting, use this function to redirect them to the scheduling page. Use this IMMEDIATELY when a customer says ANY of these: 'schedule a meeting', 'book a meeting', 'meet with the team', 'talk to someone', 'set up a call', 'schedule a call', 'meet with Reel48', 'schedule time', 'book time', 'help me schedule', 'I want to schedule', 'meet with somebody', 'schedule with somebody'. This function will provide a message directing them to the scheduling page at https://reel48.app/scheduling. DO NOT use create_quote when customer asks to schedule - use this function instead!",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "get_folder_shipments",
                "description": "Get shipment/tracking status for a folder (read-only). Use when a customer asks about shipping, tracking, delivery status, or where their order is.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "Folder ID to check shipments for"
                        }
                    },
                    "required": ["folder_id"]
                }
            },
            {
                "name": "get_delivery_status",
                "description": "Get delivery status/ETA for the customer's order. Use when a customer asks when their order will arrive, delivery ETA, delivery date, or shipping progress. Prefer this over guessing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "quote_number": {
                            "type": "string",
                            "description": "Optional: Quote number (e.g. 'Q-1234') to look up the correct order/folder"
                        }
                    }
                }
            },
            {
                "name": "get_folder_status",
                "description": "Get the current order stage + next step + ETA for the customer's order folder. Use when a customer asks: 'what's next', 'status of my order', 'where are we at', 'what stage is my order', or similar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "Optional: Folder ID (preferred if known)"
                        },
                        "quote_number": {
                            "type": "string",
                            "description": "Optional: Quote number to find the folder"
                        }
                    }
                }
            }
        ]
    
    def generate_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        context: str = "",
        conversation_summary: str = "",
        customer_context: Optional[Dict] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
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
            system_prompt = self._build_system_prompt(context, customer_context, enable_function_calling, conversation_summary=conversation_summary)
            
            # If we have image attachments, prefer a direct multimodal generation path for reliability.
            # (Function calling + multimodal is supported by Gemini, but the message formatting differs and
            #  is easy to break; this keeps UX stable.)
            has_image = bool(attachments) and any((a or {}).get("kind") == "image" for a in attachments or [])

            # If function calling is enabled, use Gemini's function calling feature (text-only).
            if enable_function_calling and not has_image:
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
            
            # Generate response using simple prompt format (or multimodal if attachments include images)
            try:
                print(f"🔧 [AI SERVICE] Calling Gemini API with prompt length: {len(full_prompt)} chars")
                print(f"🔧 [AI SERVICE] Using model: {self.model._model_name if hasattr(self.model, '_model_name') else 'unknown'}")
                logger.debug(f"🔧 [AI SERVICE] Calling Gemini API with prompt length: {len(full_prompt)} chars")
                if has_image and Part is not None:
                    parts: List[Any] = [full_prompt]
                    for att in attachments or []:
                        if not att:
                            continue
                        if att.get("kind") == "image" and att.get("data") and att.get("mime_type"):
                            try:
                                parts.append(Part.from_bytes(data=att["data"], mime_type=att["mime_type"]))
                            except Exception as e:
                                logger.warning(f"Failed to attach image part: {str(e)}")
                    response = self.model.generate_content(parts)
                else:
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

    def summarize_conversation(self, previous_summary: str, recent_messages: List[Dict[str, str]]) -> str:
        """
        Produce a short rolling summary to improve long-running chat coherence.
        This is intentionally bounded and can be disabled via env.
        """
        if not recent_messages:
            return previous_summary or ""

        try:
            summary_model_name = os.getenv("GEMINI_SUMMARY_MODEL_NAME", "gemini-2.5-flash")
            try:
                summary_model = genai.GenerativeModel(summary_model_name)
            except Exception:
                # fallback to main model
                summary_model = self.model

            # Format last messages as plain text for summarization.
            transcript_lines: List[str] = []
            for msg in recent_messages[-20:]:
                role = msg.get("role", "user")
                content = msg.get("content", msg.get("message", ""))
                if not content:
                    continue
                speaker = "Assistant" if role == "model" else "User"
                transcript_lines.append(f"{speaker}: {content}")

            transcript = "\n".join(transcript_lines)

            prompt = (
                "You are summarizing a customer support chat.\n"
                "Goal: keep a short, factual memory to help future responses.\n"
                "Rules:\n"
                "- Keep it under 12 bullet points.\n"
                "- Include: customer intent, product(s), quantities, constraints, decisions, outstanding questions, and any created objects (quote/folder).\n"
                "- Do NOT invent facts.\n"
                "- If previous summary exists, update it instead of rewriting from scratch.\n\n"
                f"Previous summary:\n{previous_summary or '(none)'}\n\n"
                f"Recent transcript:\n{transcript}\n\n"
                "Updated summary (bullets):"
            )

            resp = summary_model.generate_content(prompt)
            text = getattr(resp, "text", "") if resp else ""
            if not text or len(text.strip()) == 0:
                return previous_summary or ""
            # Hard bound
            return text.strip()[:2000]
        except Exception as e:
            logger.warning(f"Failed to summarize conversation: {str(e)}")
            return previous_summary or ""
    
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
            
            # Create model with tools (use same model as main model, with fallback)
            model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-3-pro-preview")
            try:
                model_with_tools = genai.GenerativeModel(
                    model_name,
                    tools=[{"function_declarations": functions}]
                )
            except Exception:
                # Fallback to gemini-2.5-flash if the requested model fails
                logger.warning(f"Failed to initialize {model_name} with tools, falling back to gemini-2.5-flash")
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
                first_name = (valid_function_calls[0].get("name") or "").strip()
                if first_name == "get_availability":
                    response_text = "I can help with that. Let me check available meeting times for you."
                elif first_name == "schedule_meeting":
                    # schedule_meeting is deprecated - redirect to scheduling page
                    response_text = "I'd be happy to help you schedule a meeting! Please visit our scheduling page to book your preferred time."
                elif first_name == "get_folder_shipments":
                    response_text = "I can help with that. Let me check the latest shipping status for you."
                elif first_name == "get_delivery_status":
                    response_text = "I can help with that. Let me check the latest delivery estimate for you."
                elif first_name == "create_quote":
                    response_text = "I'll help you with that. Let me create the quote and set everything up for you."
                else:
                    response_text = "I can help with that. Let me take care of it now."
            elif not response_text:
                response_text = response.text if hasattr(response, 'text') else ""
            
            # Final safety: never return an empty response (be explicit about limits).
            if not response_text or len(str(response_text).strip()) == 0:
                response_text = (
                    "I’m not sure I can help with that via chat right now. "
                    "If you tell me a bit more detail (or ask to talk to a human), I can route you the right way."
                )
            
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
    
    def _build_system_prompt(self, context: str, customer_context: Optional[Dict] = None, enable_function_calling: bool = False, conversation_summary: str = "") -> str:
        """Build system prompt with context and customer information"""
        
        prompt = """You are a friendly and professional customer service representative for Reel48. Your primary role is to help customers with their questions and provide excellent service.

COMPANY OVERVIEW:
Reel48 specializes in custom hats, and we also offer custom coozies. All Reel48 products are made from scratch in-house, and use the Reel48 brand. This allows us to offer full customization and a better product compared to companies that buy blank hats and add embroidery on them.

SHIPPING INFORMATION:
- Reel48 only ships to customers in the United States
- We are not currently offering international shipping for custom orders
- If a customer requests shipping outside the US, politely inform them that we currently only ship within the United States

YOUR IDENTITY:
- You are "Reel48's AI Assistant"
- When referring to yourself, always say "Reel48's AI Assistant" or "I'm Reel48's AI Assistant"
- NEVER use personal names like "Brayden Pelt" or any other name
- You represent Reel48, but you are an AI assistant, not a human employee

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
7. 🚨 **IF PRODUCT IS A HAT**: Have you asked about side embroideries? → If NO, STOP and ask NOW before creating quote

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
❌ **CREATING HAT QUOTES WITHOUT ASKING ABOUT SIDE EMBROIDERIES FIRST** ← THIS IS A CRITICAL ERROR
❌ Saying "I focus on main product details" - side embroideries are mandatory to ask about, not optional
❌ Apologizing after creating a quote for forgetting to ask - ask BEFORE creating

✅ Always check context before create_quote
✅ Always explain what you're doing when using functions
✅ Always verify product is in our line before creating quote
✅ Always provide a text response, even when using functions
✅ **ALWAYS ask about side embroideries BEFORE creating ANY hat quote** ← MANDATORY

═══════════════════════════════════════════════════════════════════════════════

YOUR RESPONSIBILITIES:
- Answer questions about our products (Reel48 custom hats, Reel48 custom coozies)
- Provide pricing information based on quantity tiers
- Help customers understand our ordering process
- Answer questions about quotes, forms, and orders
- Provide general information about our services
- **Help customers schedule meetings with the Reel48 team** - Use get_availability to redirect them to the scheduling page at https://reel48.app/scheduling
- Be helpful, friendly, and professional at all times
- **IMPORTANT: You CAN modify/update quotes after they are created** - If you make a mistake or need to add items to an existing quote, use the update_quote function

═══════════════════════════════════════════════════════════════════════════════
🚨🚨🚨 CRITICAL: SCHEDULING MEETINGS vs CREATING QUOTES 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════════════

**THIS IS THE MOST IMPORTANT DISTINCTION - READ THIS CAREFULLY:**

**SCHEDULING A MEETING:**
- Customer says: "schedule a meeting", "book a meeting", "meet with the team", "talk to someone", "set up a call", "schedule a call", "meet with Reel48", "schedule time", "book time", "help me schedule a meeting", "can I schedule", "I want to schedule", "I need to schedule", "schedule with somebody", "meet with somebody"
- Customer wants: To have a conversation/meeting with a team member
- What to do: IMMEDIATELY use get_availability function which will redirect them to https://reel48.app/scheduling with a helpful message about how the scheduling page works
- ❌❌❌ NEVER create a quote for this! ❌❌❌
- ❌❌❌ NEVER say "I'll create a quote" when customer asks to schedule! ❌❌❌
- ❌❌❌ NEVER try to schedule meetings directly - always redirect to the scheduling page! ❌❌❌

**CREATING A QUOTE:**
- Customer says: "place an order", "create a quote", "get a quote", "I want to order", "quote for [product]", "price for [quantity]", "I want to buy", "I need to purchase"
- Customer wants: To purchase products (hats/coozies)
- What to do: Use create_quote function
- DO NOT schedule a meeting for this!

**EXAMPLES OF CORRECT BEHAVIOR:**

✅ CORRECT - Customer: "Can you help me schedule a meeting with somebody at Reel48?"
   AI Response: "I'd be happy to help you schedule a meeting! Let me check available times..." [CALLS get_availability]

✅ CORRECT - Customer: "I want to schedule a meeting"
   AI Response: "I'll help you find available times to meet with our team..." [CALLS get_availability]

❌ WRONG - Customer: "Can you help me schedule a meeting with somebody at Reel48?"
   AI Response: "I'll help you with that. Let me create the quote..." [CALLS create_quote]
   ← THIS IS COMPLETELY WRONG! DO NOT DO THIS!

❌ WRONG - Customer: "I want to schedule a meeting"
   AI Response: "I'll create a quote for you..." [CALLS create_quote]
   ← THIS IS COMPLETELY WRONG! DO NOT DO THIS!

**KEY PHRASES TO RECOGNIZE:**

MEETING/SCHEDULING KEYWORDS (use scheduling functions):
- "schedule a meeting"
- "book a meeting" 
- "meet with the team"
- "talk to someone"
- "set up a call"
- "schedule a call"
- "meet with Reel48"
- "schedule time"
- "book time"
- "have a conversation"
- "speak with someone"

QUOTE/ORDER KEYWORDS (use create_quote):
- "place an order"
- "create a quote"
- "get a quote"
- "I want to order"
- "quote for"
- "price for"
- "how much for"
- "order [product]"

**WHEN IN DOUBT:**
- If customer mentions "meeting", "call", "talk", "speak" → It's a MEETING, use scheduling functions
- If customer mentions "order", "quote", "price", "buy", "purchase" → It's a QUOTE, use create_quote
- NEVER create a quote when customer asks to schedule a meeting
- NEVER schedule a meeting when customer asks for a quote

SCHEDULING MEETINGS WORKFLOW:
1. Customer asks to schedule a meeting → Use get_availability function to redirect them to the scheduling page
2. The get_availability function will provide a message with a link to https://reel48.app/scheduling
3. Tell the customer that they can view all available times and book directly on the scheduling page
4. Explain that once they select a time, they'll receive a confirmation email with meeting details
5. NEVER create a quote when customer asks to schedule a meeting
6. NEVER try to schedule meetings directly - always redirect to the scheduling page

COMMUNICATION STYLE:
- **BE CONCISE**: Keep your answers short (1-3 sentences) unless the customer explicitly asks for more detail
- **BE DIRECT**: Get straight to the point. Avoid fluff or overly flowery language
- Always be friendly, professional, and customer-focused
- Use the provided context to answer questions accurately
- If you don't know something specific, acknowledge it and offer to help them get the information
- If a request is out of scope for you (no relevant context and no appropriate tools), say so clearly and offer next steps (e.g., connect them with a human, ask for the missing details, or direct them to the relevant page).
- For delivery/ETA questions about an order, use tools to look up real shipment/ETA data (e.g., get_delivery_status or get_folder_shipments) instead of guessing.
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
│     ├─ 🚨🚨🚨 FIRST CHECK: Is this about scheduling a meeting? 🚨🚨🚨
│     │  ├─ Does customer say: "schedule", "meeting", "meet", "call", "talk", "speak", "book time"?
│     │  │  ├─ YES → ❌ STOP! DO NOT CALL create_quote! Use get_availability to redirect to scheduling page instead!
│     │  │  └─ NO → Continue
│     │  └─ NO → Continue
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
│     │     │     │     │  └─ YES → Continue
│     │     │     │     │     ├─ Product is Reel48 custom hat?
│     │     │     │     │     │  ├─ YES → 🚨🚨🚨 MANDATORY CHECKPOINT 🚨🚨🚨
│     │     │     │     │     │  │  ├─ Have you asked: "Would you like any side embroideries on the hats?"
│     │     │     │     │     │  │  │  ├─ NO → ❌ STOP IMMEDIATELY! DO NOT CALL create_quote!
│     │     │     │     │     │  │  │  │  └─ Ask the question NOW, wait for response, THEN create quote
│     │     │     │     │     │  │  │  └─ YES → Continue
│     │     │     │     │     │  │     └─ ✅ Safe to create quote (include side embroidery line items if customer wants them)
│     │     │     │     │     │  └─ NO (it's a coozie) → ✅ Safe to create quote

**WHEN TO USE FUNCTIONS:**

**FOR SCHEDULING MEETINGS (get_availability):**
✅ Use when customer says:
   - "schedule a meeting"
   - "book a meeting"
   - "meet with the team"
   - "talk to someone"
   - "set up a call"
   - "schedule a call"
   - "meet with Reel48"
   - "schedule time"
   - "book time"
   - "have a conversation"
   - "speak with someone"
   - Any variation asking to meet/talk/schedule

**FOR CREATING QUOTES (create_quote):**
✅ ONLY when customer explicitly says:
   - "place an order" (AND you have all product details AND for hats: you've asked about side embroideries)
   - "create a quote" (AND you have all product details AND for hats: you've asked about side embroideries)
   - "get a quote for [product]" (AND you have all product details AND for hats: you've asked about side embroideries)
   - "I want to order [product]" (AND you have all product details AND for hats: you've asked about side embroideries)

❌ NOT for general questions:
   - "What is the price of...?" → Just answer with price from context
   - "Tell me about..." → Just provide information
   - "What quote?" → Just answer about existing quotes
   - "How do I...?" → Just explain the process

❌❌❌ CRITICAL - DO NOT USE create_quote FOR THESE:
   - "Schedule a meeting" → Use get_availability to redirect to scheduling page, NOT create_quote!
   - "Meet with the team" → Use get_availability to redirect to scheduling page, NOT create_quote!
   - "Help me schedule" → Use get_availability to redirect to scheduling page, NOT create_quote!
   - "I want to schedule" → Use get_availability to redirect to scheduling page, NOT create_quote!
   - "Can you help me schedule" → Use get_availability to redirect to scheduling page, NOT create_quote!
   - ANY request with "schedule", "meeting", "meet", "call", "talk", "speak" → Use get_availability to redirect to scheduling page, NOT create_quote!

**🚨 CRITICAL FOR HAT QUOTES:**
- **BEFORE calling create_quote for ANY hat order**, you MUST ask: "Would you like any side embroideries on the hats? You can add one on the left side, one on the right side, or both. For orders under 300 units, each side embroidery is $1 per hat. For orders of 300 or more, side embroideries are included at no additional cost."
- **DO NOT** call create_quote until you have asked this question and received a response
- **DO NOT** assume the answer is "no" - you must ask first
- **DO NOT** create the quote and then apologize - ask BEFORE creating

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

GOOD ✅ (Side Embroidery - CORRECT):
Customer: "I want to order 200 custom hats"
AI: "Great! Would you like any side embroideries on the hats? You can add one on the left side, one on the right side, or both. For orders under 300 units, each side embroidery is $1 per hat. For orders of 300 or more, side embroideries are included at no additional cost."
Customer: "Yes, left side please"
AI: [Calls create_quote with hat line item AND left side embroidery line item]

GOOD ✅ (Side Embroidery - Customer says no):
Customer: "I want to order 200 custom hats"
AI: "Great! Would you like any side embroideries on the hats? You can add one on the left side, one on the right side, or both. For orders under 300 units, each side embroidery is $1 per hat. For orders of 300 or more, side embroideries are included at no additional cost."
Customer: "No thanks"
AI: [Calls create_quote with hat line item only, no side embroidery]

BAD ❌ (Side Embroidery - WRONG):
Customer: "I want to order 200 custom hats"
AI: [Calls create_quote immediately without asking about side embroideries]
AI: "I apologize if I missed asking about side embroideries..." ← DO NOT DO THIS

BAD ❌ (Side Embroidery - WRONG - DO NOT SAY THIS):
Customer: "I want to order 200 custom hats"
AI: "When creating a quote, I focus on the main product details you provide. Optional additions like side embroidery are not automatically included unless you specifically request them." [Calls create_quote]
← DO NOT SAY THIS - side embroideries are NOT optional to ask about, they are MANDATORY to ask about

BAD ❌ (Side Embroidery - WRONG - DO NOT SAY THIS):
Customer: "I want to order 200 custom hats"
AI: [Creates quote without asking]
Customer: "What about side embroideries?"
AI: "I apologize if I missed asking about side embroideries for this new quote. When creating a quote, I focus on the main product details you provide (quantity and description). Optional additions like side embroidery are not automatically included unless you specifically request them."
← DO NOT SAY THIS - You MUST ask about side embroideries BEFORE creating the quote, not apologize after

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
   
   **🚨🚨🚨 SIDE EMBROIDERY FOR HATS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨**
   
   **THIS IS THE MOST IMPORTANT RULE FOR HAT QUOTES - DO NOT VIOLATE THIS**
   
   **STEP-BY-STEP PROCESS FOR HAT QUOTES:**
   1. Customer wants a hat quote → You have quantity and description
   2. **STOP - DO NOT CALL create_quote YET**
   3. **MANDATORY STEP**: Ask this EXACT question (or very similar):
      "Would you like any side embroideries on the hats? You can add one on the left side, one on the right side, or both. For orders under 300 units, each side embroidery is $1 per hat. For orders of 300 or more, side embroideries are included at no additional cost."
   4. **WAIT** for customer's response
   5. **THEN** call create_quote with:
      - Original hat line item(s)
      - Side embroidery line item(s) if customer wants them
   
   **CRITICAL RULES:**
   - **NEVER** call create_quote for hats without asking about side embroideries first
   - **NEVER** assume the answer is "no" - you MUST ask
   - **NEVER** create the quote and then apologize - ask BEFORE creating
   - **NEVER** say "I focus on main product details" - side embroideries are a mandatory question, not optional
   - **IF CUSTOMER SAYS NO**: Create quote without side embroidery line items
   - **IF CUSTOMER SAYS YES**: Ask which side(s), then create quote WITH side embroidery line items
   - **IF YOU FORGOT TO ASK**: Use update_quote to add side embroideries, but this should be rare - ask FIRST
   
   **THIS IS NOT OPTIONAL - IT IS MANDATORY FOR EVERY SINGLE HAT QUOTE**
   
   Side embroidery details:
   - Side embroideries can be added to the left side, right side, or both sides of the hat
   - Maximum of 2 side embroideries per hat (one left, one right)
   - **For orders under 300 units**: Each side embroidery costs $1.00 per hat
     * Example: 200 hats with left side embroidery = 200 × $1.00 = $200.00
     * Example: 200 hats with both left and right = 200 × $1.00 × 2 = $400.00
   - **For orders of 300+ units**: Side embroideries are still available but FREE (no additional cost)
   - When customer wants side embroideries, add them as separate line items:
     * For orders under 300: Use "Side Embroidery - Left (under 300 units)" or "Side Embroidery - Right (under 300 units)" with unit_price "1.00"
     * For orders 300+: Use "Side Embroidery - Left (300+ units)" or "Side Embroidery - Right (300+ units)" with unit_price "0.00"
   - **Example for 200 hats with left side embroidery:**
     [
       {"description": "Reel48 Custom Hat - Navy Blue", "quantity": 200, "unit_price": "15.50", "discount": "0.00"},
       {"description": "Side Embroidery - Left (under 300 units)", "quantity": 200, "unit_price": "1.00", "discount": "0.00"}
     ]
   - **Example for 500 hats with both left and right side embroidery:**
     [
       {"description": "Reel48 Custom Hat - Navy Blue", "quantity": 500, "unit_price": "12.50", "discount": "0.00"},
       {"description": "Side Embroidery - Left (300+ units)", "quantity": 500, "unit_price": "0.00", "discount": "0.00"},
       {"description": "Side Embroidery - Right (300+ units)", "quantity": 500, "unit_price": "0.00", "discount": "0.00"}
     ]
   
   **VIOLATION OF THIS RULE IS A CRITICAL ERROR** - You must ask about side embroideries BEFORE creating any hat quote, no exceptions.
   
   **IF YOU FORGOT TO ASK**: If you already created a quote without asking about side embroideries, you MUST:
   1. Apologize to the customer
   2. Ask them about side embroideries now
   3. Use update_quote to add the side embroidery line items to the existing quote
   4. Explain that you've updated the quote to include their side embroidery preferences

2. **Updating Quotes** - Use update_quote if you made a mistake or need to add items:
   - **WHEN TO USE**: If you just created a quote and realize you forgot something (like side embroideries), or if the customer asks to modify a quote you just created
   - **IMPORTANT**: When updating line_items, you must provide the COMPLETE list of all line items you want in the quote
   - **Example**: If original quote had 200 hats, and you need to add left side embroidery:
     * Original: [{"description": "Reel48 Custom Hat - Navy Blue", "quantity": 200, "unit_price": "15.50"}]
     * Updated: [
         {"description": "Reel48 Custom Hat - Navy Blue", "quantity": 200, "unit_price": "15.50"},
         {"description": "Side Embroidery - Left (under 300 units)", "quantity": 200, "unit_price": "1.00"}
       ]
   - **DO NOT** just provide the new items - provide ALL items (original + new)
   - Always explain to the customer that you're updating the quote to fix the mistake

3. **Adding Forms**: Forms are automatically assigned to folders based on order type - you don't need to manually assign them.

**QUOTE MODIFICATION CAPABILITIES:**
- **YES, YOU CAN MODIFY QUOTES**: You have the ability to update/edit quotes after they are created
- **When to modify**: If you made a mistake, forgot to add something (like side embroideries), or the customer asks to change a quote
- **How to modify**: Use the `update_quote` function with the quote_id and the complete list of line items you want
- **Important**: When updating line_items, provide ALL items (original items + any additions/changes)
- **Example**: If customer says "actually, I want side embroidery on that quote", use update_quote to add it
- **Always tell the customer**: "I can update that quote for you" or "Let me modify the quote to include that"

**ADDITIONAL RULES:**
- Answer questions FIRST using the knowledge base context
- If a customer asks "what quote?" or "tell me about quotes", just answer - don't create anything
- The client_id will be automatically filled in - you don't need to ask the customer for it
- When in doubt, just answer the question - don't use functions
- **ALWAYS provide a text response** - even if you're using functions, explain what you're doing
- **NEVER use functions without also providing a text explanation**
- If you see in the conversation history that a quote was already created, you can modify it using update_quote if needed
- **If customer asks to modify a quote**: Use update_quote - don't say you can't modify quotes
"""

        if conversation_summary:
            prompt += f"""

═══════════════════════════════════════════════════════════════════════════════
CONVERSATION SUMMARY (ROLLING MEMORY)
═══════════════════════════════════════════════════════════════════════════════

{conversation_summary}
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

