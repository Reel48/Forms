# AI Function Calling Implementation - Complete ✅

## Overview

The AI chatbot can now automatically create quotes, folders, and assign forms/files/e-signatures to customer folders. This enables the AI to handle the complete order workflow from customer inquiry to quote creation and form assignment.

## Current Runtime Architecture (as implemented in code)

### Endpoints + data model
- **Backend router**: `backend/routers/chat.py` (`/api/chat/*`)
  - Conversations stored in **`chat_conversations`**
  - Messages stored in **`chat_messages`**
  - AI messages are stored as normal chat messages with `sender_id = OCHO_USER_ID` (retrieved from env or looked up via `clients.email = ocho@reel48.ai` fallback).

### How AI responses are generated
1. Customer sends message via `POST /api/chat/messages` (creates conversation if needed; one conversation per customer).
2. Backend inserts the customer message.
3. Backend schedules `_generate_ai_response_async(conversation_id, customer_id)` via **FastAPI `BackgroundTasks`**.
4. Background task:
   - Fetches the most recent customer message + last ~10 messages for context
   - Retrieves RAG context via `backend/rag_service.py`
   - Calls Gemini via `backend/ai_service.py`
   - Executes function calls via `backend/ai_action_executor.py` (if enabled) and mutates the final AI response text based on results (e.g., quote overview formatting)
   - Inserts the AI response as a new row into `chat_messages`

### Delivery to UI (no streaming)
- There is **no token streaming**. The UI updates when a new `chat_messages` row appears.
- Customer + Admin UIs subscribe to Supabase **Realtime** (postgres_changes) for `chat_messages` and (some) `chat_conversations` updates:
  - Customer page: `frontend/src/pages/CustomerChatPage.tsx`
  - Admin inbox: `frontend/src/pages/ChatPage.tsx`
  - Customer widget: `frontend/src/components/CustomerChatWidget.tsx`

### Current RAG behavior
- RAG is implemented in `backend/rag_service.py`.
- Retrieval is primarily **keyword-based filtering** over:
  - `pricing_products` + `pricing_tiers` (+ discounts)
  - Customer’s own `quotes`
  - Customer’s own assigned `forms`
  - `knowledge_embeddings` (not true vector similarity)

### Current UX behavior (important)
- Customer chat currently shows an **AI “typing/thinking” indicator** that is driven by the frontend (set true after sending) and hidden when a new AI message arrives; it also uses a **30s timeout** fallback.
- Admin chat does not use the thinking indicator (admins don’t trigger AI manually; AI auto-responds to customers unless admin intervenes).

## What Was Implemented

### 1. **Action Executor Service** (`backend/ai_action_executor.py`)
   - Handles execution of function calls from the AI
   - Supports creating quotes, folders, and assigning forms/files/e-signatures
   - Uses admin user ID for authentication
   - Includes error handling and validation

### 2. **Function Calling in AI Service** (`backend/ai_service.py`)
   - Added Gemini function calling support
   - Defined 5 functions:
     - `create_quote` - Create quotes with line items
     - `create_folder` - Create folders for orders
     - `assign_form_to_folder` - Assign forms to folders
     - `assign_file_to_folder` - Assign files to folders
     - `assign_esignature_to_folder` - Assign e-signatures to folders
   - Supports both form_id (UUID) and form_slug (public_url_slug) for form assignment

### 3. **Chat Router Updates** (`backend/routers/chat.py`)
   - Processes function calls from AI responses
   - Executes actions using the action executor
   - Auto-fills client_id from conversation context
   - Auto-assigns Custom Hat Design Form for hat orders
   - Updates AI response with action results

### 4. **Knowledge Base Updates**
   - Added "Form and File Assignment Rules" entry
   - Documents which forms to assign for different order types
   - Includes form slug mappings

## How It Works

### Workflow Example

1. **Customer**: "I need 100 custom hats"
2. **AI**: Asks clarifying questions (colors, design, etc.)
3. **AI**: Extracts information and calls `create_quote()` function
4. **System**: 
   - Creates quote with line items
   - Creates folder automatically (create_folder=true)
   - Links quote to folder
5. **System**: Auto-assigns Custom Hat Design Form (if hat order detected)
6. **AI**: Confirms completion with quote number and form link

### Function Execution Flow

```
Customer Message
    ↓
AI Service (with function calling enabled)
    ↓
Gemini generates response + function calls
    ↓
Chat Router processes function calls
    ↓
Action Executor executes functions
    ↓
Results added to AI response
    ↓
Message saved to conversation
```

## Available Functions

### 1. create_quote
**Purpose**: Create a quote for a customer order

**Parameters**:
- `client_id` (string, required) - Customer's client UUID (auto-filled from context)
- `title` (string, required) - Quote title
- `line_items` (array, required) - List of products with:
  - `description` (string)
  - `quantity` (number)
  - `unit_price` (string, decimal)
  - `discount` (string, decimal, optional)
- `tax_rate` (string, optional) - Tax rate as decimal
- `create_folder` (boolean, optional) - Auto-create folder (default: true)

**Returns**: Quote ID, quote number, folder ID, total

### 2. create_folder
**Purpose**: Create a folder for organizing order content

**Parameters**:
- `client_id` (string, required) - Customer's client UUID
- `name` (string, required) - Folder name
- `quote_id` (string, optional) - Link to quote

**Returns**: Folder ID and name

### 3. assign_form_to_folder
**Purpose**: Assign a form to a customer's folder

**Parameters**:
- `folder_id` (string, required) - Folder UUID
- `form_id` (string, optional) - Form UUID
- `form_slug` (string, optional) - Form public_url_slug (e.g., "form-4f8ml8om")

**Returns**: Assignment ID

### 4. assign_file_to_folder
**Purpose**: Assign a file/document to a folder

**Parameters**:
- `folder_id` (string, required) - Folder UUID
- `file_id` (string, required) - File UUID

**Returns**: Assignment ID

### 5. assign_esignature_to_folder
**Purpose**: Assign an e-signature document to a folder

**Parameters**:
- `folder_id` (string, required) - Folder UUID
- `document_id` (string, required) - E-signature document UUID

**Returns**: Assignment ID

## Security & Authentication

- **Admin User ID**: Actions are performed using an admin user ID
  - If the requester is an admin, their ID is used
  - Otherwise, the system finds the first admin user
- **Client Isolation**: client_id is automatically extracted from conversation context
- **Validation**: All parameters are validated before execution
- **Error Handling**: Errors are logged but don't expose sensitive information

## Auto-Assignment Rules

The system automatically:
- Creates a folder when creating a quote (if `create_folder=true`)
- Assigns Custom Hat Design Form to folders for hat orders
- Links quotes to their folders
- Creates folder assignments for customers

## Configuration

### Environment Variables
- `GEMINI_API_KEY` - Required for AI service
- `OCHO_USER_ID` - Optional, for AI message sender ID

### Knowledge Base
The AI uses knowledge base entries to know:
- Which forms to assign for different order types
- Pricing information for products
- Company processes and workflows

## Testing

To test the functionality:

1. **Start a conversation** as a customer
2. **Ask for a quote**: "I need 100 custom hats"
3. **AI will**:
   - Ask clarifying questions if needed
   - Create the quote and folder
   - Assign the Custom Hat Design Form
   - Confirm completion

## Example Conversation

**Customer**: "I'd like to order 100 custom hats"

**AI**: "Great! I'd be happy to help you with that. To create an accurate quote, I need a few details:
- What color would you like for the hats?
- Do you have a logo or design ready?
- Any specific style preferences?"

**Customer**: "Navy blue hats with our company logo"

**AI**: "Perfect! I'll create a quote for 100 navy blue custom hats with your logo. Based on our pricing, that would be $15.50 per hat for 100 units, for a total of $1,550.00. Should I proceed with creating the quote?"

**Customer**: "Yes, please"

**AI**: *[Calls create_quote function]*
"✅ Quote QT-20250119-ABC123 has been created! You can view it in your account.

📋 I've also added the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om) to your folder for you to fill out. This will help us collect your design preferences and specifications."

## Future Enhancements

Potential improvements:
- Support for file uploads in chat
- E-signature document creation from templates
- More sophisticated pricing calculation
- Order status updates
- Invoice creation from quotes
- Multi-step quote creation with customer approval

## Files Modified

1. `backend/ai_service.py` - Added function calling support
2. `backend/ai_action_executor.py` - New file for action execution
3. `backend/routers/chat.py` - Updated to handle function calls
4. `database/update_knowledge_base.sql` - Added form/file mapping rules

## Status

✅ **Implementation Complete**
- All core functionality implemented
- Function calling integrated
- Action executor working
- Auto-assignment rules configured
- Knowledge base updated

Ready for testing and deployment!

