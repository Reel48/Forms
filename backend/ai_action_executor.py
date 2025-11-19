"""
AI Action Executor Service
Handles execution of function calls from the AI chatbot
"""
import logging
from typing import Dict, Any, Optional, List
from decimal import Decimal
import uuid
from datetime import datetime

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
            tax_rate = params.get("tax_rate", "0.00")
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
            
            # Calculate totals
            from routers.quotes import calculate_quote_totals
            totals = calculate_quote_totals(line_items_data, tax_rate, "after_discount")
            
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
                for item in line_items_data:
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
                        "discount": str(item.get("discount", "0.00")),
                        "line_total": str(line_total),
                        "created_at": datetime.now().isoformat()
                    })
                
                if line_items_to_insert:
                    supabase_storage.table("line_items").insert(line_items_to_insert).execute()
            
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

