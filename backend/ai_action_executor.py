"""
AI Action Executor Service
Handles execution of function calls from the AI chatbot
"""
import logging
from typing import Dict, Any, Optional, Optional, List
from decimal import Decimal
import uuid
from datetime import datetime
import sys
import os

# Add parent directory to path for imports
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, repo_root)
sys.path.insert(0, backend_dir)

from database import supabase_storage
from folder_tasks import build_customer_tasks, compute_stage_and_next_step

logger = logging.getLogger(__name__)

class AIActionExecutor:
    """Executes actions requested by the AI chatbot"""
    
    def __init__(self, admin_user_id: str):
        """
        Initialize action executor with admin user ID for authentication
        
        Args:
            admin_user_id: The user ID of the admin user (or service account) 
                          that will be used to perform actions
        """
        self.admin_user_id = admin_user_id
    
    def execute_function(self, function_name: str, parameters: Dict[str, Any], user_message: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a function call from the AI
        
        Args:
            function_name: Name of the function to execute
            parameters: Parameters for the function
            user_message: Optional user message for validation checks
            
        Returns:
            Dict with 'success', 'result', and optionally 'error' keys
        """
        try:
            # 🚨 CRITICAL VALIDATION: Prevent create_quote when user asks to schedule
            if function_name == "create_quote" and user_message:
                user_msg_lower = user_message.lower()
                scheduling_keywords = ["schedule", "meeting", "meet", "call", "talk", "speak", "book time", "schedule time", "set up a call"]
                if any(keyword in user_msg_lower for keyword in scheduling_keywords):
                    logger.warning(f"🚨 BLOCKED: AI tried to call create_quote when user asked to schedule. User message: {user_message}")
                    return {
                        "success": False,
                        "error": "I understand you want to schedule a meeting, not create a quote. Let me help you find available times instead. Please use get_availability to show scheduling options.",
                        "suggestion": "Use get_availability instead"
                    }

                # 🚨 CONFIRMATION GATE: Don't create quotes unless user clearly asked for a quote/order
                confirmed = parameters.get("confirmed") is True or str(parameters.get("confirmed")).lower() == "true"
                if not confirmed:
                    # Allow if user explicitly requested a quote/order in the latest message
                    explicit_quote_intent = any(
                        phrase in user_msg_lower
                        for phrase in [
                            "create a quote",
                            "create quote",
                            "make a quote",
                            "give me a quote",
                            "get a quote",
                            "quote for",
                            "i want a quote",
                            "i'd like a quote",
                            "i want to order",
                            "i'd like to order",
                            "place an order",
                            "i want to purchase",
                            "i'd like to purchase",
                        ]
                    )
                    if not explicit_quote_intent:
                        logger.warning(f"🚨 BLOCKED: create_quote without explicit customer confirmation. User message: {user_message}")
                        return {
                            "success": False,
                            "requires_confirmation": True,
                            "error": "Before I create a quote, please confirm: would you like me to create the quote now? Reply 'Yes, create the quote' to proceed."
                        }
            
            if function_name == "create_quote":
                return self._create_quote(parameters)
            elif function_name == "update_quote":
                return self._update_quote(parameters)
            elif function_name == "create_folder":
                return self._create_folder(parameters)
            elif function_name == "assign_form_to_folder":
                return self._assign_form_to_folder(parameters)
            elif function_name == "assign_file_to_folder":
                return self._assign_file_to_folder(parameters)
            elif function_name == "assign_esignature_to_folder":
                return self._assign_esignature_to_folder(parameters)
            elif function_name == "get_availability":
                return self._get_availability(parameters)
            elif function_name == "schedule_meeting":
                # Redirect to scheduling page instead of scheduling
                return self._get_availability({})
            elif function_name == "get_folder_shipments":
                return self._get_folder_shipments(parameters)
            elif function_name == "get_delivery_status":
                return self._get_delivery_status(parameters)
            elif function_name == "get_folder_status":
                return self._get_folder_status(parameters)
            else:
                return {
                    "success": False,
                    "error": f"Unknown function: {function_name}"
                }
        except Exception as e:
            logger.error(f"Error executing function {function_name}: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    def _create_quote(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a quote for a customer"""
        try:
            # Extract parameters
            client_id = params.get("client_id")
            title = params.get("title", "New Quote")
            line_items_data = params.get("line_items", [])
            # Default tax rate is 8.25% (stored as percentage, not decimal)
            tax_rate = params.get("tax_rate", "8.25")
            create_folder = params.get("create_folder", True)
            
            if not client_id:
                return {
                    "success": False,
                    "error": "client_id is required"
                }
            
            # Verify client exists
            client_response = supabase_storage.table("clients").select("id").eq("id", client_id).single().execute()
            if not client_response.data:
                return {
                    "success": False,
                    "error": f"Client with ID {client_id} not found"
                }
            
            # Generate quote number
            quote_number = f"QT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
            
            # Normalize line items data for calculate_quote_totals (expects discount_percent, not discount)
            # Handle case where line_items might be a JSON string
            logger.info(f"Processing line_items_data: type={type(line_items_data)}, value={line_items_data}")
            
            if isinstance(line_items_data, str):
                try:
                    import json
                    line_items_data = json.loads(line_items_data)
                    logger.info(f"Parsed line_items from JSON string: {line_items_data}")
                except (json.JSONDecodeError, ValueError) as e:
                    logger.error(f"Could not parse line_items as JSON: {e}, value: {line_items_data}")
                    return {
                        "success": False,
                        "error": f"line_items must be a list or valid JSON string, got string that couldn't be parsed"
                    }
            
            # Ensure line_items_data is a list and each item is a dict
            if not isinstance(line_items_data, list):
                logger.error(f"line_items_data is not a list: type={type(line_items_data)}, value={line_items_data}")
                return {
                    "success": False,
                    "error": f"line_items must be a list, got {type(line_items_data).__name__}. Value: {str(line_items_data)[:100]}"
                }
            
            if not line_items_data:
                logger.warning("line_items_data is empty - quote will be created with no line items")
                logger.warning(f"Original params received: {params}")
                # Don't fail, but log a warning - quote will be created with $0 total
            
            normalized_line_items = []
            for idx, item in enumerate(line_items_data):
                # Ensure item is a dict
                if not isinstance(item, dict):
                    logger.error(f"Line item {idx} is not a dict: {type(item).__name__}, value: {item}")
                    return {
                        "success": False,
                        "error": f"Line item {idx} must be a dictionary with description, quantity, and unit_price"
                    }
                
                # Validate required fields
                if not item.get("description"):
                    logger.warning(f"Line item {idx} missing description")
                if not item.get("quantity"):
                    logger.warning(f"Line item {idx} missing quantity, using default 1")
                if not item.get("unit_price"):
                    logger.warning(f"Line item {idx} missing unit_price, using default 0.00")
                
                normalized_item = {
                    "quantity": item.get("quantity", 1),
                    "unit_price": item.get("unit_price", "0.00"),
                    "discount_percent": item.get("discount", item.get("discount_percent", "0.00"))
                }
                normalized_line_items.append(normalized_item)
                logger.debug(f"Normalized line item {idx}: {normalized_item}")
            
            # Calculate totals
            from routers.quotes import calculate_quote_totals
            totals = calculate_quote_totals(normalized_line_items, Decimal(str(tax_rate)), "after_discount")
            
            # Create quote data
            quote_data = {
                "id": str(uuid.uuid4()),
                "quote_number": quote_number,
                "title": title,
                "client_id": client_id,
                "subtotal": str(totals["subtotal"]),
                "tax_rate": tax_rate,
                "tax_amount": str(totals["tax_amount"]),
                "total": str(totals["total"]),
                "status": "draft",
                "created_by": self.admin_user_id,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            # Insert quote
            quote_response = supabase_storage.table("quotes").insert(quote_data).execute()
            created_quote = quote_response.data[0]
            quote_id = created_quote["id"]
            
            # Create line items
            if line_items_data:
                line_items_to_insert = []
                for idx, item in enumerate(line_items_data):
                    # Ensure item is a dict
                    if not isinstance(item, dict):
                        logger.error(f"Line item {idx} is not a dict: {type(item).__name__}, value: {item}")
                        continue  # Skip invalid items
                    
                    from routers.quotes import calculate_line_item_total
                    from models import LineItemCreate
                    from decimal import Decimal as D
                    
                    # Create LineItemCreate object
                    line_item = LineItemCreate(
                        description=item.get("description", ""),
                        quantity=D(str(item.get("quantity", 1))),
                        unit_price=D(str(item.get("unit_price", "0.00"))),
                        discount_percent=D(str(item.get("discount", "0.00")))
                    )
                    
                    line_total = calculate_line_item_total(
                        line_item,
                        use_line_tax=True,
                        quote_tax_rate=Decimal(tax_rate)
                    )
                    line_items_to_insert.append({
                        "id": str(uuid.uuid4()),
                        "quote_id": quote_id,
                        "description": item.get("description", ""),
                        "quantity": str(item.get("quantity", 1)),
                        "unit_price": str(item.get("unit_price", "0.00")),
                        "discount_percent": str(item.get("discount", item.get("discount_percent", "0.00"))),  # Database column is discount_percent
                        "line_total": str(line_total),
                        "created_at": datetime.now().isoformat()
                    })
                
                if line_items_to_insert:
                    logger.info(f"Inserting {len(line_items_to_insert)} line items for quote {quote_id}")
                    logger.debug(f"Line items data: {line_items_to_insert}")
                    supabase_storage.table("line_items").insert(line_items_to_insert).execute()
                    logger.info(f"Successfully inserted {len(line_items_to_insert)} line items")
                else:
                    logger.warning(f"No line items to insert for quote {quote_id}. Original line_items_data: {line_items_data}")
            
            # Create folder if requested
            folder_id = None
            if create_folder:
                folder_result = self._create_folder({
                    "client_id": client_id,
                    "name": f"Order: {title}",
                    "quote_id": quote_id
                })
                if folder_result.get("success"):
                    folder_id = folder_result.get("result", {}).get("id")
                    # Update quote with folder_id
                    supabase_storage.table("quotes").update({"folder_id": folder_id}).eq("id", quote_id).execute()
            
            return {
                "success": True,
                "result": {
                    "quote_id": quote_id,
                    "quote_number": quote_number,
                    "folder_id": folder_id,
                    "total": str(totals["total"])
                }
            }
        except Exception as e:
            logger.error(f"Error creating quote: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to create quote: {str(e)}"
            }
    
    def _update_quote(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing quote - can update line items, title, notes, etc."""
        try:
            quote_id = params.get("quote_id")
            if not quote_id:
                return {
                    "success": False,
                    "error": "quote_id is required"
                }
            
            # Verify quote exists
            quote_response = supabase_storage.table("quotes").select("*, line_items(*)").eq("id", quote_id).execute()
            if not quote_response.data:
                return {
                    "success": False,
                    "error": f"Quote with ID {quote_id} not found"
                }
            
            current_quote = quote_response.data[0]
            
            # Prepare update data
            update_data = {
                "updated_at": datetime.now().isoformat()
            }
            
            # Update quote fields if provided
            if "title" in params:
                update_data["title"] = params["title"]
            if "notes" in params:
                update_data["notes"] = params.get("notes")
            if "terms" in params:
                update_data["terms"] = params.get("terms")
            if "tax_rate" in params:
                update_data["tax_rate"] = str(params["tax_rate"])
            
            # Handle line items update
            line_items_data = params.get("line_items")
            if line_items_data:
                # Delete existing line items
                supabase_storage.table("line_items").delete().eq("quote_id", quote_id).execute()
                
                # Insert new line items
                from routers.quotes import calculate_line_item_total, calculate_quote_totals
                from models import LineItemCreate
                
                # Normalize line items data
                if isinstance(line_items_data, str):
                    import json
                    line_items_data = json.loads(line_items_data)
                
                line_items_to_insert = []
                for idx, item in enumerate(line_items_data):
                    if not isinstance(item, dict):
                        logger.error(f"Line item {idx} is not a dict: {type(item).__name__}, value: {item}")
                        continue
                    
                    line_item = LineItemCreate(
                        description=item.get("description", ""),
                        quantity=Decimal(str(item.get("quantity", 1))),
                        unit_price=Decimal(str(item.get("unit_price", "0.00"))),
                        discount_percent=Decimal(str(item.get("discount", item.get("discount_percent", "0.00"))))
                    )
                    
                    tax_rate = Decimal(str(update_data.get("tax_rate", current_quote.get("tax_rate", "8.25"))))
                    line_total = calculate_line_item_total(line_item, use_line_tax=True, quote_tax_rate=tax_rate)
                    
                    line_items_to_insert.append({
                        "id": str(uuid.uuid4()),
                        "quote_id": quote_id,
                        "description": item.get("description", ""),
                        "quantity": str(item.get("quantity", 1)),
                        "unit_price": str(item.get("unit_price", "0.00")),
                        "discount_percent": str(item.get("discount", item.get("discount_percent", "0.00"))),
                        "line_total": str(line_total),
                        "created_at": datetime.now().isoformat()
                    })
                
                if line_items_to_insert:
                    supabase_storage.table("line_items").insert(line_items_to_insert).execute()
                    
                    # Recalculate totals - convert line_items_to_insert to format expected by calculate_quote_totals
                    tax_rate = Decimal(str(update_data.get("tax_rate", current_quote.get("tax_rate", "8.25"))))
                    line_items_for_totals = [
                        {
                            "quantity": item["quantity"],
                            "unit_price": item["unit_price"],
                            "discount_percent": item.get("discount_percent", "0.00")
                        }
                        for item in line_items_to_insert
                    ]
                    totals = calculate_quote_totals(line_items_for_totals, tax_rate, "after_discount")
                    update_data.update(totals)
            
            # Update quote
            if update_data:
                supabase_storage.table("quotes").update(update_data).eq("id", quote_id).execute()
            
            # Fetch updated quote
            updated_response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
            updated_quote = updated_response.data[0] if updated_response.data else current_quote
            
            return {
                "success": True,
                "result": {
                    "quote_id": quote_id,
                    "quote_number": updated_quote.get("quote_number"),
                    "total": str(updated_quote.get("total", "0.00")),
                    "message": "Quote updated successfully"
                }
            }
        except Exception as e:
            logger.error(f"Error updating quote: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to update quote: {str(e)}"
            }
    
    def _create_folder(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a folder for a customer"""
        try:
            client_id = params.get("client_id")
            name = params.get("name", "New Folder")
            quote_id = params.get("quote_id")
            
            if not client_id:
                return {
                    "success": False,
                    "error": "client_id is required"
                }
            
            # Verify client exists
            client_response = supabase_storage.table("clients").select("id").eq("id", client_id).single().execute()
            if not client_response.data:
                return {
                    "success": False,
                    "error": f"Client with ID {client_id} not found"
                }
            
            # Create folder
            folder_data = {
                "id": str(uuid.uuid4()),
                "name": name,
                "client_id": client_id,
                "status": "active",
                "created_by": self.admin_user_id,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            if quote_id:
                folder_data["quote_id"] = quote_id
            
            folder_response = supabase_storage.table("folders").insert(folder_data).execute()
            created_folder = folder_response.data[0]
            folder_id = created_folder["id"]
            
            # Auto-assign "Reel48 Purchase Agreement" e-signature template to the folder
            try:
                self._auto_assign_purchase_agreement(folder_id)
            except Exception as e:
                logger.warning(f"Could not auto-assign Purchase Agreement e-signature: {str(e)}")
            
            # Create folder assignment for the client
            try:
                # Get client's user_id
                client_user_response = supabase_storage.table("clients").select("user_id").eq("id", client_id).single().execute()
                if client_user_response.data and client_user_response.data.get("user_id"):
                    user_id = client_user_response.data["user_id"]
                    assignment_data = {
                        "id": str(uuid.uuid4()),
                        "folder_id": folder_id,
                        "user_id": user_id,
                        "role": "viewer",
                        "assigned_by": self.admin_user_id,
                        "assigned_at": datetime.now().isoformat()
                    }
                    supabase_storage.table("folder_assignments").insert(assignment_data).execute()
            except Exception as e:
                logger.warning(f"Could not create folder assignment: {str(e)}")
            
            return {
                "success": True,
                "result": {
                    "id": folder_id,
                    "name": name
                }
            }
        except Exception as e:
            logger.error(f"Error creating folder: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to create folder: {str(e)}"
            }
    
    def _auto_assign_purchase_agreement(self, folder_id: str):
        """Helper function to auto-assign 'Reel48 Purchase Agreement' e-signature template to a folder"""
        try:
            # Find the "Reel48 Purchase Agreement" template by name
            template_response = supabase_storage.table("esignature_documents").select("*").eq("name", "Reel48 Purchase Agreement").eq("is_template", True).single().execute()
            
            if not template_response.data:
                logger.warning("Reel48 Purchase Agreement e-signature template not found")
                return
            
            template_doc = template_response.data
            template_id = template_doc["id"]
            template_name = template_doc.get("name", "Reel48 Purchase Agreement")
            
            # Get folder name
            folder_response = supabase_storage.table("folders").select("name").eq("id", folder_id).single().execute()
            folder_name = folder_response.data.get("name", "Folder") if folder_response.data else "Folder"
            
            # Generate the copy name: "Folder Name - E-Signature Name"
            copy_name = f"{folder_name} - {template_name}"
            
            # Check if a copy already exists for this template in this folder
            existing_copy = supabase_storage.table("esignature_documents").select("id").eq("folder_id", folder_id).eq("is_template", False).eq("name", copy_name).execute()
            if existing_copy.data:
                # Copy already exists, skip
                return
            
            # Create a copy of the template document for this folder
            copy_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            copy_data = {
                "id": copy_id,
                "name": copy_name,
                "description": template_doc.get("description"),
                "file_id": template_doc.get("file_id"),
                "document_type": template_doc.get("document_type", "agreement"),
                "signature_mode": template_doc.get("signature_mode", "simple"),
                "require_signature": template_doc.get("require_signature", True),
                "signature_fields": template_doc.get("signature_fields"),
                "is_template": False,
                "folder_id": folder_id,
                "quote_id": template_doc.get("quote_id"),
                "expires_at": template_doc.get("expires_at"),
                "created_by": self.admin_user_id,
                "status": "pending",
                "created_at": now,
                "updated_at": now
            }
            
            # Create the copy
            copy_response = supabase_storage.table("esignature_documents").insert(copy_data).execute()
            
            # Also create an assignment record linking the template to the folder
            assignment_data = {
                "document_id": template_id,
                "folder_id": folder_id,
                "assigned_by": self.admin_user_id,
                "status": "pending"
            }
            
            try:
                supabase_storage.table("esignature_document_folder_assignments").insert(assignment_data).execute()
            except Exception as e:
                logger.warning(f"Could not create assignment record: {str(e)}")
            
            logger.info(f"Auto-assigned Reel48 Purchase Agreement to folder {folder_id}")
        except Exception as e:
            logger.error(f"Error auto-assigning Purchase Agreement: {str(e)}", exc_info=True)
            # Don't raise - this is a non-critical operation
    
    def _assign_form_to_folder(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Assign a form to a folder"""
        try:
            folder_id = params.get("folder_id")
            form_id = params.get("form_id")
            form_slug = params.get("form_slug")  # Support form slug as alternative
            
            if not folder_id:
                return {
                    "success": False,
                    "error": "folder_id is required"
                }
            
            # If form_slug is provided instead of form_id, look it up
            if form_slug and not form_id:
                try:
                    form_response = supabase_storage.table("forms").select("id").eq("public_url_slug", form_slug).single().execute()
                    if form_response.data:
                        form_id = form_response.data["id"]
                    else:
                        return {
                            "success": False,
                            "error": f"Form with slug '{form_slug}' not found"
                        }
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"Could not find form by slug: {str(e)}"
                    }
            
            if not form_id:
                return {
                    "success": False,
                    "error": "form_id or form_slug is required"
                }
            
            # Check if assignment already exists
            existing = supabase_storage.table("form_folder_assignments").select("id").eq("folder_id", folder_id).eq("form_id", form_id).execute()
            if existing.data:
                return {
                    "success": True,
                    "result": {
                        "message": "Form already assigned to folder",
                        "assignment_id": existing.data[0]["id"]
                    }
                }
            
            # Create assignment
            assignment_data = {
                "id": str(uuid.uuid4()),
                "folder_id": folder_id,
                "form_id": form_id,
                "assigned_by": self.admin_user_id,
                "assigned_at": datetime.now().isoformat()
            }
            
            assignment_response = supabase_storage.table("form_folder_assignments").insert(assignment_data).execute()
            
            return {
                "success": True,
                "result": {
                    "assignment_id": assignment_response.data[0]["id"]
                }
            }
        except Exception as e:
            logger.error(f"Error assigning form to folder: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to assign form: {str(e)}"
            }
    
    def _assign_file_to_folder(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Assign a file to a folder"""
        try:
            folder_id = params.get("folder_id")
            file_id = params.get("file_id")
            
            if not folder_id or not file_id:
                return {
                    "success": False,
                    "error": "folder_id and file_id are required"
                }
            
            # Check if assignment already exists
            existing = supabase_storage.table("file_folder_assignments").select("id").eq("folder_id", folder_id).eq("file_id", file_id).execute()
            if existing.data:
                return {
                    "success": True,
                    "result": {
                        "message": "File already assigned to folder",
                        "assignment_id": existing.data[0]["id"]
                    }
                }
            
            # Create assignment
            assignment_data = {
                "id": str(uuid.uuid4()),
                "folder_id": folder_id,
                "file_id": file_id,
                "assigned_by": self.admin_user_id,
                "assigned_at": datetime.now().isoformat()
            }
            
            assignment_response = supabase_storage.table("file_folder_assignments").insert(assignment_data).execute()
            
            return {
                "success": True,
                "result": {
                    "assignment_id": assignment_response.data[0]["id"]
                }
            }
        except Exception as e:
            logger.error(f"Error assigning file to folder: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to assign file: {str(e)}"
            }
    
    def _assign_esignature_to_folder(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Assign an e-signature document to a folder"""
        try:
            folder_id = params.get("folder_id")
            document_id = params.get("document_id")
            
            if not folder_id or not document_id:
                return {
                    "success": False,
                    "error": "folder_id and document_id are required"
                }
            
            # Check if assignment already exists
            existing = supabase_storage.table("esignature_document_folder_assignments").select("id").eq("folder_id", folder_id).eq("document_id", document_id).execute()
            if existing.data:
                return {
                    "success": True,
                    "result": {
                        "message": "E-signature already assigned to folder",
                        "assignment_id": existing.data[0]["id"]
                    }
                }
            
            # Create assignment
            assignment_data = {
                "id": str(uuid.uuid4()),
                "folder_id": folder_id,
                "document_id": document_id,
                "assigned_by": self.admin_user_id,
                "assigned_at": datetime.now().isoformat()
            }
            
            assignment_response = supabase_storage.table("esignature_document_folder_assignments").insert(assignment_data).execute()
            
            return {
                "success": True,
                "result": {
                    "assignment_id": assignment_response.data[0]["id"]
                }
            }
        except Exception as e:
            logger.error(f"Error assigning e-signature to folder: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to assign e-signature: {str(e)}"
            }
    
    def _get_availability(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Redirect users to the scheduling page instead of fetching availability"""
        scheduling_url = "https://reel48.app/scheduling"
        return {
            "success": True,
            "result": {
                "scheduling_url": scheduling_url,
                "message": f"I'd be happy to help you schedule a meeting! Please visit our [scheduling page]({scheduling_url}) to view available times and book your preferred slot. The scheduling page allows you to see all available meeting times, choose a time that works for you, and book directly. Once you've selected a time, you'll receive a confirmation email with all the meeting details."
            }
        }
    
    def _schedule_meeting(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Redirect users to scheduling page instead of scheduling meetings"""
        # This function is kept for backwards compatibility but now redirects to scheduling page
        return self._get_availability({})

    def _get_folder_shipments(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get shipment/tracking status for a folder (read-only)."""
        try:
            folder_id = params.get("folder_id")
            if not folder_id:
                return {"success": False, "error": "folder_id is required"}

            shipments_resp = (
                supabase_storage.table("shipments")
                .select("*")
                .eq("folder_id", folder_id)
                .order("created_at", desc=True)
                .limit(5)
                .execute()
            )
            shipments = shipments_resp.data or []

            # Attach latest event (best-effort)
            enriched = []
            for s in shipments:
                shipment_id = s.get("id")
                latest_event = None
                if shipment_id:
                    try:
                        ev = (
                            supabase_storage.table("shipment_tracking_events")
                            .select("*")
                            .eq("shipment_id", shipment_id)
                            .order("timestamp", desc=True)
                            .limit(1)
                            .execute()
                        )
                        if ev.data:
                            latest_event = ev.data[0]
                    except Exception:
                        latest_event = None
                enriched.append({**s, "latest_event": latest_event})

            return {
                "success": True,
                "result": {"folder_id": folder_id, "shipments": enriched},
                "message": "Here’s the latest shipment status for this folder."
            }
        except Exception as e:
            logger.error(f"Error getting folder shipments: {str(e)}", exc_info=True)
            return {"success": False, "error": f"Failed to get shipments: {str(e)}"}

    def _get_delivery_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get delivery status/ETA for the customer's order.

        SECURITY: Expects `client_id` to be injected upstream (chat router overrides client_id from conversation).
        """
        try:
            client_id = params.get("client_id")
            quote_number = (params.get("quote_number") or "").strip()

            if not client_id:
                return {"success": False, "error": "client_id is required"}

            folder_id = None

            # If quote_number is provided, use it to find the specific folder_id.
            if quote_number:
                q = (
                    supabase_storage.table("quotes")
                    .select("id, quote_number, folder_id, status, title")
                    .eq("client_id", client_id)
                    .eq("quote_number", quote_number)
                    .single()
                    .execute()
                )
                if q.data:
                    folder_id = q.data.get("folder_id")

            # Otherwise, fall back to the most recently updated folder for this client.
            if not folder_id:
                f = (
                    supabase_storage.table("folders")
                    .select("id")
                    .eq("client_id", client_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if f.data:
                    folder_id = f.data[0].get("id")

            if not folder_id:
                return {"success": False, "error": "No folder/order found for this customer"}

            shipments_resp = (
                supabase_storage.table("shipments")
                .select("*")
                .eq("folder_id", folder_id)
                .order("created_at", desc=True)
                .limit(5)
                .execute()
            )
            shipments = shipments_resp.data or []

            latest_shipment = shipments[0] if shipments else None
            latest_event = None
            if latest_shipment and latest_shipment.get("id"):
                try:
                    ev = (
                        supabase_storage.table("shipment_tracking_events")
                        .select("*")
                        .eq("shipment_id", latest_shipment.get("id"))
                        .order("timestamp", desc=True)
                        .limit(1)
                        .execute()
                    )
                    if ev.data:
                        latest_event = ev.data[0]
                except Exception:
                    latest_event = None

            return {
                "success": True,
                "result": {
                    "client_id": client_id,
                    "folder_id": folder_id,
                    "quote_number": quote_number or None,
                    "latest_shipment": latest_shipment,
                    "latest_event": latest_event,
                    "shipments": shipments,
                },
                "message": "Here’s the latest delivery estimate we have on file."
            }
        except Exception as e:
            logger.error(f"Error getting delivery status: {str(e)}", exc_info=True)
            return {"success": False, "error": f"Failed to get delivery status: {str(e)}"}

    def _get_folder_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get order stage + next step + ETA for the customer's order.

        SECURITY: Expects `client_id` to be injected upstream (chat router overrides client_id from conversation).
        """
        try:
            client_id = params.get("client_id")
            folder_id = (params.get("folder_id") or "").strip()
            quote_number = (params.get("quote_number") or "").strip()

            if not client_id:
                return {"success": False, "error": "client_id is required"}

            # Resolve folder_id by quote number (if provided)
            if not folder_id and quote_number:
                q = (
                    supabase_storage.table("quotes")
                    .select("id, quote_number, folder_id")
                    .eq("client_id", client_id)
                    .eq("quote_number", quote_number)
                    .limit(1)
                    .execute()
                )
                if q.data:
                    folder_id = q.data[0].get("folder_id")

            # Otherwise use latest folder for client
            if not folder_id:
                f = (
                    supabase_storage.table("folders")
                    .select("id")
                    .eq("client_id", client_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if f.data:
                    folder_id = f.data[0].get("id")

            if not folder_id:
                return {"success": False, "error": "No folder/order found for this customer"}

            folder = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute().data
            if not folder:
                return {"success": False, "error": "Folder not found"}

            quote = None
            if folder.get("quote_id"):
                try:
                    quote = (
                        supabase_storage.table("quotes")
                        .select("id, quote_number, status, payment_status, total")
                        .eq("id", folder.get("quote_id"))
                        .single()
                        .execute()
                    ).data
                except Exception:
                    quote = None

            # Shipping summary
            shipments = (
                supabase_storage.table("shipments")
                .select("*")
                .eq("folder_id", folder_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            ).data or []
            shipment = shipments[0] if shipments else None

            shipping = {"has_shipment": bool(shipment)}
            if shipment:
                shipping.update({
                    "status": shipment.get("status"),
                    "carrier_name": shipment.get("carrier_name") or shipment.get("carrier"),
                    "tracking_number": shipment.get("tracking_number"),
                    "estimated_delivery_date": shipment.get("estimated_delivery_date"),
                    "actual_delivery_date": shipment.get("actual_delivery_date"),
                })

            client = None
            try:
                client = supabase_storage.table("clients").select("email, user_id").eq("id", client_id).single().execute().data
            except Exception:
                client = None
            client_email = (client or {}).get("email")
            client_user_id = (client or {}).get("user_id")
            client_email_norm = client_email.lower().strip() if isinstance(client_email, str) and client_email.strip() else None

            # Build task list (best-effort) so next-step messaging matches folder summary
            # Forms: per-form completion for this customer's email
            forms_for_tasks: List[Dict[str, Any]] = []
            try:
                assigned = supabase_storage.table("form_folder_assignments").select("form_id").eq("folder_id", folder_id).execute().data or []
                form_ids = [a.get("form_id") for a in assigned if a.get("form_id")]
                name_map: Dict[str, str] = {}
                if form_ids:
                    try:
                        metas = supabase_storage.table("forms").select("id,name").in_("id", form_ids).execute().data or []
                        name_map = {m.get("id"): (m.get("name") or "Form") for m in metas if m.get("id")}
                    except Exception:
                        name_map = {}
                for fid in form_ids:
                    if not fid:
                        continue
                    completed = False
                    if client_email_norm:
                        try:
                            chk = (
                                supabase_storage.table("form_submissions")
                                .select("id")
                                .eq("form_id", fid)
                                .eq("submitter_email", client_email_norm)
                                .limit(1)
                                .execute()
                            )
                            completed = bool(chk.data)
                        except Exception:
                            completed = False
                    forms_for_tasks.append({"id": fid, "name": name_map.get(fid) or "Form", "is_completed": completed})
            except Exception:
                forms_for_tasks = []

            # E-signatures: per-doc completion for this customer's user_id
            esigs_for_tasks: List[Dict[str, Any]] = []
            try:
                docs = (
                    supabase_storage.table("esignature_documents")
                    .select("id,name")
                    .eq("folder_id", folder_id)
                    .eq("is_template", False)
                    .execute()
                ).data or []
                for d in docs:
                    did = d.get("id")
                    if not did:
                        continue
                    completed = False
                    try:
                        qsig = supabase_storage.table("esignature_signatures").select("id").eq("document_id", did)
                        if client_user_id:
                            qsig = qsig.eq("user_id", client_user_id)
                        qsig = qsig.limit(1).execute()
                        completed = bool(qsig.data)
                    except Exception:
                        completed = False
                    esigs_for_tasks.append({"id": did, "name": d.get("name"), "is_completed": completed})
            except Exception:
                esigs_for_tasks = []

            # Files: viewed count for this customer
            files_total = 0
            files_viewed = 0
            try:
                file_rows = (
                    supabase_storage.table("files")
                    .select("id")
                    .eq("folder_id", folder_id)
                    .eq("is_reusable", False)
                    .execute()
                ).data or []
                file_ids = [f.get("id") for f in file_rows if f.get("id")]
                files_total = len(file_ids)
                if client_user_id and file_ids:
                    views = (
                        supabase_storage.table("file_views")
                        .select("file_id")
                        .eq("user_id", client_user_id)
                        .in_("file_id", file_ids)
                        .execute()
                    ).data or []
                    files_viewed = len({v.get("file_id") for v in views if v.get("file_id")})
            except Exception:
                files_total = 0
                files_viewed = 0

            tasks = build_customer_tasks(
                folder_id=folder_id,
                quote=quote,
                forms=forms_for_tasks,
                esignatures=esigs_for_tasks,
                files_total=files_total,
                files_viewed=files_viewed,
            )

            stage_info = compute_stage_and_next_step(folder=folder, quote=quote, shipping=shipping, tasks=tasks)
            tasks_progress = stage_info.get("tasks_progress") or {}

            progress = {
                "tasks_total": tasks_progress.get("tasks_total", 0),
                "tasks_completed": tasks_progress.get("tasks_completed", 0),
                "forms_total": len(forms_for_tasks),
                "forms_completed": len([f for f in forms_for_tasks if f.get("is_completed")]),
                "esignatures_total": len(esigs_for_tasks),
                "esignatures_completed": len([e for e in esigs_for_tasks if e.get("is_completed")]),
                "files_total": files_total,
                "files_viewed": files_viewed,
            }

            return {
                "success": True,
                "result": {
                    "client_id": client_id,
                    "folder_id": folder_id,
                    "quote_number": (quote or {}).get("quote_number") or None,
                    "stage": stage_info.get("stage"),
                    "next_step": stage_info.get("next_step"),
                    "next_step_owner": stage_info.get("next_step_owner"),
                    "computed_stage": stage_info.get("computed_stage"),
                    "computed_next_step": stage_info.get("computed_next_step"),
                    "computed_next_step_owner": stage_info.get("computed_next_step_owner"),
                    "progress": progress,
                    "shipping": shipping,
                    "deep_link": f"/folders/{folder_id}",
                },
                "message": "Here’s the latest status for your order."
            }
        except Exception as e:
            logger.error(f"Error getting folder status: {str(e)}", exc_info=True)
            return {"success": False, "error": f"Failed to get folder status: {str(e)}"}
