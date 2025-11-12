# Files, E-Signature, and Folders Implementation Plan

## Overview

This document outlines the implementation plan for three major features that will enhance the customer experience and provide better document management capabilities:

1. **Files** - A file management system for storing PDFs and other documents
2. **E-Signature** - Electronic signature capability for key documents
3. **Folders** - Project-based folder organization for the customer view

---

## 1. Files Management System

### Overview
A robust file management system that allows storing PDFs and other file types. While primary storage can be in Google Drive, the system will support on-site storage when needed (using Supabase Storage, which is already configured for form uploads).

### Key Capabilities
- **File Upload**: Support for PDFs, images, documents, and other file types
- **File Storage**: 
  - Primary: Supabase Storage (already configured)
  - Optional: Google Drive integration (future enhancement)
- **File Organization**: Files can be associated with:
  - Projects/Folders
  - Quotes
  - Forms
  - E-Signature documents
- **File Management**:
  - View, download, delete files
  - File metadata (name, size, type, upload date, uploaded by)
  - File versioning (optional, for future)
- **Access Control**: 
  - Admin: Full access to all files
  - Customer: Access only to files in their assigned folders/projects

### Database Schema

```sql
-- Files table
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL, -- MIME type
  file_size BIGINT NOT NULL, -- Size in bytes
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  storage_url TEXT, -- Public URL if available
  storage_provider VARCHAR(20) DEFAULT 'supabase', -- supabase, google_drive
  external_id TEXT, -- For Google Drive file ID if stored externally
  
  -- Relationships
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  esignature_document_id UUID REFERENCES esignature_documents(id) ON DELETE SET NULL,
  
  -- Metadata
  description TEXT,
  tags TEXT[], -- Array of tags for categorization
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_quote_id ON files(quote_id);
CREATE INDEX idx_files_form_id ON files(form_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
```

### API Endpoints

**Backend (`/api/files`)**
- `GET /api/files` - List files (with filters: folder_id, quote_id, form_id)
- `GET /api/files/{file_id}` - Get file details
- `POST /api/files/upload` - Upload a file
- `DELETE /api/files/{file_id}` - Delete a file
- `GET /api/files/{file_id}/download` - Download file
- `GET /api/files/{file_id}/preview` - Get preview URL (for images/PDFs)

**Customer Endpoints (`/api/customer/files`)**
- `GET /api/customer/files` - List files in customer's folders
- `GET /api/customer/files/{file_id}` - Get file details (if accessible)
- `GET /api/customer/files/{file_id}/download` - Download file (if accessible)

### Frontend Components

**Admin View:**
- `FilesList.tsx` - List all files with filters and search
- `FileUpload.tsx` - File upload component (drag & drop)
- `FileViewer.tsx` - Preview/download files

**Customer View:**
- Files integrated into Folder view (see Folders section)

---

## 2. E-Signature System

### Overview
Electronic signature capability that allows customers to sign key documents (like Terms of Service) before starting a project. Documents are stored in the Files system and can be accessed through Folders.

### Key Capabilities
- **Document Management**:
  - Store signature-ready documents (PDFs) in Files
  - Mark documents as requiring signatures
  - Track signature status (pending, signed, declined)
- **Signature Process**:
  - Customer receives notification/access to document
  - Customer views document
  - Customer signs using:
    - Draw signature (canvas-based)
    - Type signature (text-based)
    - Upload signature image
  - Signature is embedded into PDF
  - Signed document is stored and timestamped
- **Signature Tracking**:
  - Who signed
  - When signed
  - IP address (for audit)
  - Signature method used
- **Document Types**:
  - Terms of Service
  - Contracts
  - Agreements
  - Custom documents

### Database Schema

```sql
-- E-Signature documents table
CREATE TABLE esignature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  document_type VARCHAR(50) DEFAULT 'terms_of_service', -- terms_of_service, contract, agreement, custom
  
  -- Signature requirements
  require_signature BOOLEAN DEFAULT true,
  signature_fields JSONB DEFAULT '[]'::jsonb, -- Array of signature field positions on PDF
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, signed, declined, expired
  signed_by UUID REFERENCES auth.users(id),
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_ip_address VARCHAR(45),
  signature_method VARCHAR(20), -- draw, type, upload
  
  -- Relationships
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE -- Optional expiration
);

-- E-Signature signatures table (stores actual signature data)
CREATE TABLE esignature_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES esignature_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Signature data
  signature_data TEXT NOT NULL, -- Base64 encoded signature image or text
  signature_type VARCHAR(20) NOT NULL, -- draw, type, upload
  signature_position JSONB, -- Position on document (x, y, page)
  
  -- Metadata
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Signed document
  signed_file_id UUID REFERENCES files(id), -- Reference to signed PDF
  signed_file_url TEXT -- URL to signed PDF
);

-- Indexes
CREATE INDEX idx_esignature_documents_folder_id ON esignature_documents(folder_id);
CREATE INDEX idx_esignature_documents_quote_id ON esignature_documents(quote_id);
CREATE INDEX idx_esignature_documents_status ON esignature_documents(status);
CREATE INDEX idx_esignature_documents_signed_by ON esignature_documents(signed_by);
CREATE INDEX idx_esignature_signatures_document_id ON esignature_signatures(document_id);
CREATE INDEX idx_esignature_signatures_user_id ON esignature_signatures(user_id);
```

### API Endpoints

**Backend (`/api/esignature`)**
- `GET /api/esignature/documents` - List e-signature documents
- `GET /api/esignature/documents/{doc_id}` - Get document details
- `POST /api/esignature/documents` - Create e-signature document
- `PUT /api/esignature/documents/{doc_id}` - Update document
- `DELETE /api/esignature/documents/{doc_id}` - Delete document
- `POST /api/esignature/documents/{doc_id}/sign` - Sign a document
- `GET /api/esignature/documents/{doc_id}/signed-pdf` - Get signed PDF
- `GET /api/esignature/documents/{doc_id}/signature-history` - Get signature history

**Customer Endpoints (`/api/customer/esignature`)**
- `GET /api/customer/esignature/documents` - List documents requiring signature
- `GET /api/customer/esignature/documents/{doc_id}` - Get document (if accessible)
- `POST /api/customer/esignature/documents/{doc_id}/sign` - Sign document
- `GET /api/customer/esignature/documents/{doc_id}/signed-pdf` - Download signed PDF

### Frontend Components

**Admin View:**
- `ESignatureDocumentsList.tsx` - List all e-signature documents
- `ESignatureDocumentView.tsx` - View document and signature status
- `CreateESignatureDocument.tsx` - Upload and configure document for signing

**Customer View:**
- `ESignatureViewer.tsx` - View document and sign
- `SignatureCanvas.tsx` - Canvas component for drawing signature
- `SignatureInput.tsx` - Text input for typed signature
- Integrated into Folder view

### Signature Implementation Details

**Signature Methods:**
1. **Draw Signature**: 
   - HTML5 Canvas for drawing
   - Convert to image (PNG)
   - Embed into PDF using PyPDF2 or similar

2. **Type Signature**:
   - Text input with font styling
   - Convert to image
   - Embed into PDF

3. **Upload Signature**:
   - Image upload
   - Resize/validate
   - Embed into PDF

**PDF Processing:**
- Use Python library (PyPDF2, pdf-lib, or reportlab) to embed signature
- Store signed PDF as new file in Files system
- Maintain original unsigned document

---

## 3. Folders (Project Organization)

### Overview
Folder-based organization system for the customer view. Instead of having forms, quotes, e-signatures, and files separate, customers see one folder per project that contains all related items.

### Key Capabilities
- **Project Folders**: Each project gets a folder containing:
  - Forms assigned to the project
  - Quotes for the project
  - E-Signature documents
  - Files/documents
  - Project notes/updates
- **Folder Structure**:
  - One folder = One project
  - Folders are assigned to customers
  - Admins can create/manage folders
  - Customers see only their assigned folders
- **Folder Contents**:
  - Forms (with completion status)
  - Quotes (with status: draft, sent, accepted, etc.)
  - E-Signature documents (with signature status)
  - Files (all related documents)
  - Activity timeline (recent updates)
- **Folder Management**:
  - Create, rename, archive folders
  - Assign folders to customers
  - Set folder permissions
  - Folder-level notifications

### Database Schema

```sql
-- Folders table (represents projects)
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_number VARCHAR(50) UNIQUE, -- Optional project number
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, archived, completed
  
  -- Relationships
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL, -- Primary quote for project
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE
);

-- Folder assignments (which customers can access which folders)
CREATE TABLE folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  role VARCHAR(20) DEFAULT 'viewer', -- viewer, collaborator, owner
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(folder_id, user_id)
);

-- Link forms to folders
ALTER TABLE forms ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forms_folder_id ON forms(folder_id);

-- Link quotes to folders (already have client_id, but folder provides project context)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_folder_id ON quotes(folder_id);

-- Indexes
CREATE INDEX idx_folders_client_id ON folders(client_id);
CREATE INDEX idx_folders_status ON folders(status);
CREATE INDEX idx_folders_created_at ON folders(created_at DESC);
CREATE INDEX idx_folder_assignments_folder_id ON folder_assignments(folder_id);
CREATE INDEX idx_folder_assignments_user_id ON folder_assignments(user_id);
```

### API Endpoints

**Backend (`/api/folders`)**
- `GET /api/folders` - List folders (admin: all, customer: assigned)
- `GET /api/folders/{folder_id}` - Get folder details
- `POST /api/folders` - Create folder
- `PUT /api/folders/{folder_id}` - Update folder
- `DELETE /api/folders/{folder_id}` - Delete/archive folder
- `GET /api/folders/{folder_id}/contents` - Get all contents (forms, quotes, files, e-signatures)
- `POST /api/folders/{folder_id}/assign` - Assign folder to customer
- `DELETE /api/folders/{folder_id}/assign/{user_id}` - Remove assignment

**Customer Endpoints (`/api/customer/folders`)**
- `GET /api/customer/folders` - List assigned folders
- `GET /api/customer/folders/{folder_id}` - Get folder details
- `GET /api/customer/folders/{folder_id}/contents` - Get folder contents

### Frontend Components

**Admin View:**
- `FoldersList.tsx` - List all folders
- `FolderView.tsx` - View folder contents and manage
- `CreateFolder.tsx` - Create new folder
- `FolderAssignments.tsx` - Manage folder assignments

**Customer View:**
- `CustomerFoldersView.tsx` - Main customer dashboard (replaces CustomerDashboard)
  - Shows folders instead of separate forms/quotes
  - Each folder card shows:
    - Project name
    - Status indicators (pending signatures, incomplete forms, etc.)
    - Recent activity
    - Quick actions
- `FolderDetailView.tsx` - Detailed folder view with:
  - Tabs for: Overview, Forms, Quotes, Documents, E-Signatures, Files
  - Activity timeline
  - Status summary

### Customer Experience Flow

**Before (Current):**
- Customer sees separate lists: Forms, Quotes
- No organization by project
- Hard to see what belongs together

**After (With Folders):**
- Customer sees folders (projects)
- Click folder → See everything for that project:
  - Forms to complete
  - Quotes to review/accept
  - Documents to sign
  - Files to download
  - Activity timeline
- Clear project-based organization

---

## Implementation Phases

### Phase 1: Database & Backend Foundation (Week 1)
1. Create database migrations for:
   - `files` table
   - `esignature_documents` table
   - `esignature_signatures` table
   - `folders` table
   - `folder_assignments` table
   - Add `folder_id` columns to existing tables
2. Create backend models (Pydantic)
3. Create backend routers:
   - `/api/files`
   - `/api/esignature`
   - `/api/folders`
4. Implement file upload/download using Supabase Storage
5. Basic folder CRUD operations

### Phase 2: Files System (Week 1-2)
1. File upload component (drag & drop)
2. File list/view components
3. File management (delete, download)
4. File association with folders/quotes/forms
5. Customer file access controls

### Phase 3: E-Signature System (Week 2-3)
1. E-signature document management
2. Signature canvas component (draw signature)
3. Signature input component (type signature)
4. PDF signature embedding (backend)
5. Signature tracking and history
6. Customer signature flow

### Phase 4: Folders System (Week 3-4)
1. Folder creation and management (admin)
2. Folder assignment system
3. Customer folder view (replace CustomerDashboard)
4. Folder contents aggregation
5. Activity timeline
6. Folder-based navigation

### Phase 5: Integration & Polish (Week 4)
1. Integrate all three systems
2. Update existing forms/quotes to support folders
3. Migration of existing data to folders
4. Testing and bug fixes
5. Documentation

---

## Technical Considerations

### File Storage
- **Primary**: Supabase Storage (already configured)
- **Bucket**: Create `project-files` bucket (separate from `form-uploads`)
- **Permissions**: RLS policies for file access
- **Size Limits**: 10MB per file (configurable)
- **Supported Types**: PDF, images, documents, etc.

### E-Signature Security
- Signature data stored securely
- IP address and timestamp tracking
- Signed PDFs are immutable (new file, don't modify original)
- Audit trail for compliance

### Performance
- Lazy loading for folder contents
- Pagination for large file lists
- Image thumbnails for previews
- Caching for frequently accessed files

### Migration Strategy
- Existing quotes/forms can be assigned to folders retroactively
- Default folder creation for existing clients (optional)
- Gradual rollout (folders optional, then required)

---

## Questions for Clarification

1. **Files**:
   - Should there be a file size limit? (Suggested: 10MB)
   - Should we support file versioning initially?
   - Do you want Google Drive integration in Phase 1 or later?

2. **E-Signature**:
   - Should signatures be legally binding? (affects audit requirements)
   - Do you need multiple signature fields per document?
   - Should there be signature expiration dates?

3. **Folders**:
   - Should folders be automatically created when a quote is sent?
   - Can one quote/form belong to multiple folders?
   - Should there be a default "General" folder for unassigned items?

4. **Customer Experience**:
   - Should customers see folders immediately, or should we keep the current dashboard as an option?
   - Should folders be visible to admins in the same way?

---

## Next Steps

Once you review this plan and answer the clarification questions, we can:
1. Finalize the database schema
2. Create detailed task breakdown
3. Begin implementation starting with Phase 1

Let me know if you'd like any adjustments to the plan or have additional requirements!

