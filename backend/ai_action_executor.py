"""
AI Action Executor Service
Handles execution of function calls from the AI chatbot
"""
import logging
from typing import Dict, Any, Optional, List
from decimal import Decimal
import uuid
from datetime import datetime
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase_storage

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
    
    def execute_function(self, function_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a function call from the AI
        
        Args:
            function_name: Name of the function to execute
            parameters: Parameters for the function
            
        Returns:
            Dict with 'success', 'result', and optionally 'error' keys
        """
        try:
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
                return self._schedule_meeting(parameters)
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
        """Get available time slots for scheduling"""
        try:
            from calcom_service import CalComService
            calcom_service = CalComService()
            
            date_from = params.get("date_from")
            date_to = params.get("date_to")
            event_type_id = params.get("event_type_id")
            
            availability = calcom_service.get_availability(
                date_from=date_from,
                date_to=date_to,
                event_type_id=event_type_id
            )
            
            return {
                "success": True,
                "result": availability
            }
        except Exception as e:
            logger.error(f"Error getting availability: {str(e)}", exc_info=True)
            # Return a more user-friendly error message
            error_msg = str(e)
            if "404" in error_msg:
                return {
                    "success": False,
                    "error": "The scheduling service is temporarily unavailable. Please try using the scheduling page directly or contact support."
                }
            return {
                "success": False,
                "error": f"Failed to get availability: {str(e)}"
            }
    
    def _schedule_meeting(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Schedule a meeting with the Reel48 team"""
        try:
            from calcom_service import CalComService
            calcom_service = CalComService()
            
            event_type_id = params.get("event_type_id")
            start_time = params.get("start_time")
            customer_email = params.get("customer_email")
            customer_name = params.get("customer_name")
            notes = params.get("notes")
            
            if not event_type_id or not start_time or not customer_email or not customer_name:
                return {
                    "success": False,
                    "error": "event_type_id, start_time, customer_email, and customer_name are required"
                }
            
            # Create booking
            booking = calcom_service.create_booking(
                event_type_id=event_type_id,
                start_time=start_time,
                attendee_info={
                    "name": customer_name,
                    "email": customer_email
                },
                notes=notes
            )
            
            # Store in database (get customer_id from email)
            try:
                client_response = supabase_storage.table("clients").select("user_id").eq("email", customer_email).single().execute()
                customer_id = None
                if client_response.data and client_response.data.get("user_id"):
                    customer_id = client_response.data["user_id"]
                
                if customer_id:
                    # Get event type name
                    event_types = calcom_service.get_event_types()
                    event_type_name = None
                    for et in event_types:
                        if et.get("id") == event_type_id:
                            event_type_name = et.get("title", et.get("slug", ""))
                            break
                    
                    # Parse start and end times
                    from datetime import datetime, timedelta
                    start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                    # Estimate end time (default 30 minutes, or use event type duration)
                    duration = 30  # minutes
                    for et in event_types:
                        if et.get("id") == event_type_id:
                            duration = et.get("length", 30)
                            break
                    end_dt = start_dt + timedelta(minutes=duration)
                    
                    # Store in database
                    booking_record = {
                        "id": str(uuid.uuid4()),
                        "booking_id": str(booking.get("id", "")),
                        "customer_id": customer_id,
                        "customer_email": customer_email,
                        "customer_name": customer_name,
                        "event_type": event_type_name,
                        "event_type_id": str(event_type_id),
                        "start_time": start_dt.isoformat(),
                        "end_time": end_dt.isoformat(),
                        "timezone": "America/New_York",
                        "meeting_url": booking.get("location", {}).get("url") if isinstance(booking.get("location"), dict) else booking.get("location"),
                        "status": "confirmed",
                        "notes": notes,
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat()
                    }
                    
                    supabase_storage.table("calcom_bookings").insert(booking_record).execute()
            except Exception as db_error:
                logger.warning(f"Could not store booking in database: {str(db_error)}")
                # Continue anyway - booking was created in Cal.com
            
            return {
                "success": True,
                "result": {
                    "booking_id": booking.get("id"),
                    "start_time": start_time,
                    "meeting_url": booking.get("location", {}).get("url") if isinstance(booking.get("location"), dict) else booking.get("location"),
                    "message": "Meeting scheduled successfully"
                }
            }
        except Exception as e:
            logger.error(f"Error scheduling meeting: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"Failed to schedule meeting: {str(e)}"
            }

