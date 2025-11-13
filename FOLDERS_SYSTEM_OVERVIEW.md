# Folders System Overview

## Core Concept

Folders are the central organizing structure for the entire platform. Each folder represents an **order** and belongs to **one client/company**. Folders connect all content types (quotes, invoices, forms, files, e-signatures) into a cohesive project view.

## Folder Structure & Relationships

### One-to-One Relationships (Exclusive to Folder)
- **Quotes**: Each quote belongs to exactly one folder. When a quote is created, a folder can be auto-created with it.
- **Invoices**: Each invoice belongs to exactly one folder (future implementation).

### Many-to-Many Relationships (Reusable Across Folders)
- **Files**: Can be assigned to multiple folders (e.g., Terms of Service PDF used in many orders)
- **Forms**: Can be assigned to multiple folders (e.g., standard intake form reused across orders)
- **E-Signatures**: Can be assigned to multiple folders (e.g., Terms of Service e-signature document)

### Folder Ownership
- Each folder belongs to **one client/company**
- One client can have **many folders** (one per order)
- Folders are created when quotes are created (optional, but recommended)

## Database Schema

```sql
-- Folders table
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL, -- Main quote for this folder
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE, -- Owner of the folder
  status VARCHAR(50) DEFAULT 'active', -- active, completed, archived, cancelled
  created_by UUID REFERENCES auth.users(id), -- Admin who created it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Folder assignments (many-to-many: users/clients to folders)
CREATE TABLE folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer', -- viewer, editor (future: for team collaboration)
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(folder_id, user_id)
);

-- File folder assignments (already exists, many-to-many)
-- file_folder_assignments table

-- Form folder assignments (many-to-many)
CREATE TABLE form_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(form_id, folder_id)
);

-- E-Signature folder assignments (already exists, many-to-many)
-- esignature_document_folder_assignments table
```

## Permissions Model

### Folder-Level Permissions

**Admin Users:**
- ✅ **Full Access**: Can view, create, edit, and delete all folders
- ✅ **Content Management**: Can add/remove any content (files, forms, e-signatures) to/from any folder
- ✅ **Assignment Management**: Can assign folders to any user/client

**Client/User Access:**
- ✅ **Own Folders**: Can view folders assigned to them (via `folder_assignments`)
- ✅ **Folder Content**: Can view all content within their accessible folders:
  - Quotes in the folder
  - Files assigned to the folder
  - Forms assigned to the folder
  - E-Signature documents assigned to the folder
- ❌ **No Folder Creation**: Clients cannot create folders (admins create them)
- ❌ **No Folder Deletion**: Clients cannot delete folders
- ⚠️ **Limited Editing**: Clients may have limited editing capabilities (TBD based on requirements)

### Content-Level Permissions (Cascading from Folders)

**Files:**
- Users can access a file if:
  - They uploaded it themselves, OR
  - The file is assigned to at least one folder they have access to
- Admins can access all files

**Forms:**
- Users can access a form if:
  - They created it, OR
  - The form is assigned to at least one folder they have access to
- Admins can access all forms

**E-Signature Documents:**
- Users can view/sign a document if:
  - They created it, OR
  - The document is assigned to at least one folder they have access to
- Admins can access all documents

**Quotes:**
- Users can view a quote if:
  - The quote's folder is assigned to them
- Admins can view all quotes

### Permission Flow Example

**Scenario**: Client "ABC Company" has a folder "Order #12345"

1. **Folder Assignment**: Admin assigns folder to ABC Company's user account
   - `folder_assignments`: `{folder_id: "folder-123", user_id: "abc-user-id"}`

2. **Content Assignment**: Admin adds reusable content to folder
   - Terms of Service PDF (file) → assigned to folder
   - Standard Intake Form → assigned to folder
   - Terms of Service E-Signature → assigned to folder

3. **Client Access**: ABC Company user logs in
   - ✅ Can see folder "Order #12345" in their dashboard
   - ✅ Can view the quote in that folder
   - ✅ Can view/download Terms of Service PDF
   - ✅ Can fill out the Standard Intake Form
   - ✅ Can sign the Terms of Service document
   - ❌ Cannot see other clients' folders
   - ❌ Cannot see files/forms not assigned to their folders

## User Experience

### Admin View
- **Folder Management Page**: List all folders, filter by client, status, date
- **Folder Detail Page**: View all content in a folder, manage assignments
- **Quote Creation**: Option to "Create folder with this quote" checkbox
- **Content Assignment**: Drag-and-drop or select content to add to folders

### Client/Customer View
- **Dashboard**: Shows folders assigned to them (one per order)
- **Folder View**: All content for that order in one place:
  - Quote (main piece)
  - Files (downloadable documents)
  - Forms (fillable forms)
  - E-Signatures (documents to sign)
- **Table View**: List of folders in date order (current view)
- **Card/Project View**: Visual cards showing each folder/order (new option)

## Implementation Phases

### Phase 1: Core Folder System
1. Create `folders` table
2. Create `folder_assignments` table
3. Update `quotes` table to link to folders
4. Backend API for folder CRUD operations
5. Frontend folder management (admin)

### Phase 2: Content Integration
1. Update existing many-to-many tables (files, e-signatures)
2. Create `form_folder_assignments` table
3. Backend APIs to assign content to folders
4. Frontend UI to manage folder content

### Phase 3: Customer View
1. Customer folder dashboard
2. Folder detail view with all content
3. Toggle between table and card view
4. Folder-based navigation

### Phase 4: Auto-Creation & Workflow
1. Auto-create folder when quote is created (optional)
2. Bulk assignment tools
3. Folder templates
4. Status management (active, completed, archived)

## Security Considerations

1. **Row Level Security (RLS)**: All tables will have RLS policies
2. **Folder-Based Access Control**: Content access determined by folder assignments
3. **Admin Override**: Admins bypass all restrictions
4. **Audit Trail**: Track who assigned what to which folders
5. **Cascade Deletes**: Deleting a folder removes assignments but preserves content (files, forms remain)

## Key Features

- ✅ **One folder per order**: Clean organization
- ✅ **Reusable content**: Files, forms, e-signatures can be in multiple folders
- ✅ **Client isolation**: Clients only see their own folders
- ✅ **Admin control**: Full management capabilities
- ✅ **Quote-centric**: Quote is the main piece, folder created with it
- ✅ **Scalable**: Supports many folders per client, many clients

---

**Ready to proceed?** This structure provides a solid foundation for organizing all content while maintaining proper access control and reusability.

