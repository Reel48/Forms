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
            elif function_name == "create_folder":
                return self._create_folder(parameters)
            elif function_name == "assign_form_to_folder":
                return self._assign_form_to_folder(parameters)
            elif function_name == "assign_file_to_folder":
                return self._assign_file_to_folder(parameters)
            elif function_name == "assign_esignature_to_folder":
                return self._assign_esignature_to_folder(parameters)
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

