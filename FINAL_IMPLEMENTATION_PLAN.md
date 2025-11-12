# Final Implementation Plan: Files, E-Signature, and Folders

## Executive Summary

This document outlines the complete implementation plan for three integrated features that will transform the customer experience and provide comprehensive document management:

1. **Files Management** - Store PDFs and documents with ability to import/select from Google Drive
2. **E-Signature** - Two modes: Simple (scroll-to-sign) and Advanced (DocuSign-like)
3. **Folders** - Project-based organization with many-to-many relationships for reusable items

---

## 1. Files Management System

### Overview
A robust file management system using Supabase Storage for file uploads, with the ability to import/select files from Google Drive. Files can be associated with multiple folders (for reusable items like Terms of Service) or single folders (project-specific files).

### Key Capabilities
- **Primary Storage**: Supabase Storage for uploaded files (10MB limit)
- **Google Drive Import**: Select and link files from Google Drive (no upload to Drive)
- **File Upload**: 10MB limit, drag & drop interface
- **Many-to-Many Relationships**: Files can belong to multiple folders
- **File Types**: PDFs, images, documents, etc.
- **Access Control**: Admin sees all; customers see only assigned folders

### Database Schema

```sql
-- Files table
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL, -- MIME type
  file_size BIGINT, -- Size in bytes (nullable for Google Drive files)
  storage_path TEXT, -- Path in Supabase Storage (nullable if Google Drive only)
  storage_url TEXT, -- Public URL if available (for Supabase files)
  storage_provider VARCHAR(20) DEFAULT 'supabase', -- supabase, google_drive
  google_drive_file_id TEXT, -- Google Drive file ID if imported from Drive
  google_drive_url TEXT, -- Google Drive share/view URL
  google_drive_web_view_link TEXT, -- Google Drive web view link
  
  -- Metadata
  description TEXT,
  tags TEXT[], -- Array of tags for categorization
  is_reusable BOOLEAN DEFAULT false, -- Can be used in multiple folders
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Many-to-many: Files to Folders (allows reusable files)
CREATE TABLE file_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(file_id, folder_id)
);

-- Direct relationships (for backward compatibility and single-folder files)
ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES forms(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS esignature_document_id UUID REFERENCES esignature_documents(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_quote_id ON files(quote_id);
CREATE INDEX idx_files_form_id ON files(form_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_is_reusable ON files(is_reusable);
CREATE INDEX idx_file_folder_assignments_file_id ON file_folder_assignments(file_id);
CREATE INDEX idx_file_folder_assignments_folder_id ON file_folder_assignments(folder_id);
```

### Google Drive Integration

**Overview:**
- Import/select files from Google Drive (not upload to Drive)
- Store references to Google Drive files
- Access files through Google Drive share links

**Setup Requirements:**
- Google Cloud Project with Drive API enabled
- OAuth 2.0 Client credentials (for user authentication)
- Frontend Google Picker API or backend OAuth flow

**Implementation:**
- **Option 1 (Recommended)**: Google Picker API (frontend)
  - User clicks "Import from Google Drive"
  - Google Picker opens in popup
  - User selects file(s)
  - Frontend receives file metadata
  - Backend stores file reference (ID, name, URL)
  
- **Option 2**: Backend OAuth flow
  - User authorizes Google Drive access
  - Backend uses OAuth token to browse Drive
  - User selects file from list
  - Backend stores file reference

**What We Store:**
- Google Drive file ID
- File name and metadata
- Google Drive share/view URL
- No file content stored locally (accessed via Drive)

**Access:**
- Files accessed through Google Drive links
- Share permissions managed in Google Drive
- Preview available if file is shareable

### API Endpoints

**Backend (`/api/files`)**
- `GET /api/files` - List files (filters: folder_id, quote_id, form_id, is_reusable)
- `GET /api/files/{file_id}` - Get file details
- `POST /api/files/upload` - Upload file to Supabase Storage
- `POST /api/files/import-from-drive` - Import file from Google Drive (store reference)
- `PUT /api/files/{file_id}` - Update file metadata
- `DELETE /api/files/{file_id}` - Delete file (Supabase only; Drive files just remove reference)
- `GET /api/files/{file_id}/download` - Download file (Supabase files) or get Drive link
- `GET /api/files/{file_id}/preview` - Get preview URL
- `GET /api/files/google-drive/auth-url` - Get Google OAuth URL (if using backend OAuth)
- `POST /api/files/{file_id}/assign-to-folder` - Assign file to folder (many-to-many)
- `DELETE /api/files/{file_id}/assign-to-folder/{folder_id}` - Remove folder assignment

**Customer Endpoints (`/api/customer/files`)**
- `GET /api/customer/files` - List files in customer's folders
- `GET /api/customer/files/{file_id}` - Get file details (if accessible)
- `GET /api/customer/files/{file_id}/download` - Download file (if accessible)

---

## 2. E-Signature System

### Overview
Electronic signature system with two modes: **Simple Mode** (scroll to bottom and sign) for most documents, and **Advanced Mode** (DocuSign-like) for complex documents requiring multiple signatures.

### Key Capabilities

**Simple Mode:**
- Customer scrolls through PDF document
- Signature area at bottom of document
- Single signature required
- Quick and easy for Terms of Service, simple agreements

**Advanced Mode:**
- DocuSign-like interface
- Multiple signature fields per document
- Drag-and-drop signature placement
- Multiple signers support (future)
- Field types: signature, initial, date, text
- Sequential signing workflow

### Database Schema

```sql
-- E-Signature documents table
CREATE TABLE esignature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  document_type VARCHAR(50) DEFAULT 'terms_of_service', -- terms_of_service, contract, agreement, custom
  
  -- Signature mode
  signature_mode VARCHAR(20) DEFAULT 'simple', -- simple, advanced
  require_signature BOOLEAN DEFAULT true,
  
  -- Advanced mode: signature field definitions
  signature_fields JSONB DEFAULT '[]'::jsonb, -- Array of signature field positions/definitions
  -- Format for advanced mode:
  -- [
  --   {
  --     "id": "sig1",
  --     "type": "signature", // signature, initial, date, text
  --     "page": 1,
  --     "x": 100,
  --     "y": 200,
  --     "width": 200,
  --     "height": 50,
  --     "required": true,
  --     "signer": "customer" // customer, admin, or user_id
  --   }
  -- ]
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, signed, declined, expired
  signed_by UUID REFERENCES auth.users(id),
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_ip_address VARCHAR(45),
  signature_method VARCHAR(20), -- draw, type, upload
  
  -- Relationships (many-to-many for reusable documents)
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL, -- Primary folder (for simple mode)
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE -- Optional expiration
);

-- Many-to-many: E-Signature documents to Folders (for reusable documents like Terms of Service)
CREATE TABLE esignature_document_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES esignature_documents(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending', -- Status per folder assignment
  signed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(document_id, folder_id)
);

-- E-Signature signatures table (stores actual signature data)
CREATE TABLE esignature_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES esignature_documents(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL, -- Which folder instance this signature is for
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Signature data
  signature_data TEXT NOT NULL, -- Base64 encoded signature image or text
  signature_type VARCHAR(20) NOT NULL, -- draw, type, upload
  signature_position JSONB, -- Position on document (x, y, page) - for advanced mode
  field_id VARCHAR(50), -- For advanced mode: which signature field
  
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
CREATE INDEX idx_esignature_documents_signature_mode ON esignature_documents(signature_mode);
CREATE INDEX idx_esignature_signatures_document_id ON esignature_signatures(document_id);
CREATE INDEX idx_esignature_signatures_user_id ON esignature_signatures(user_id);
CREATE INDEX idx_esignature_signatures_folder_id ON esignature_signatures(folder_id);
CREATE INDEX idx_esignature_document_folder_assignments_document_id ON esignature_document_folder_assignments(document_id);
CREATE INDEX idx_esignature_document_folder_assignments_folder_id ON esignature_document_folder_assignments(folder_id);
```

### Signature Modes

**Simple Mode Flow:**
1. Customer opens document
2. PDF viewer displays document
3. Customer scrolls to bottom
4. Signature area appears
5. Customer signs (draw/type/upload)
6. Signature embedded at bottom of PDF
7. Signed PDF saved

**Advanced Mode Flow:**
1. Customer opens document
2. PDF viewer with signature field overlays
3. Customer fills required fields (signature, initial, date, etc.)
4. Fields can be dragged to position (admin configures)
5. Customer completes all required fields
6. Signatures embedded at specified positions
7. Signed PDF saved

### API Endpoints

**Backend (`/api/esignature`)**
- `GET /api/esignature/documents` - List e-signature documents
- `GET /api/esignature/documents/{doc_id}` - Get document details
- `POST /api/esignature/documents` - Create e-signature document
- `PUT /api/esignature/documents/{doc_id}` - Update document (including signature fields for advanced mode)
- `DELETE /api/esignature/documents/{doc_id}` - Delete document
- `POST /api/esignature/documents/{doc_id}/sign` - Sign a document
- `GET /api/esignature/documents/{doc_id}/signed-pdf` - Get signed PDF
- `GET /api/esignature/documents/{doc_id}/signature-history` - Get signature history
- `POST /api/esignature/documents/{doc_id}/assign-to-folder` - Assign reusable document to folder
- `DELETE /api/esignature/documents/{doc_id}/assign-to-folder/{folder_id}` - Remove folder assignment

**Customer Endpoints (`/api/customer/esignature`)**
- `GET /api/customer/esignature/documents` - List documents requiring signature
- `GET /api/customer/esignature/documents/{doc_id}` - Get document (if accessible)
- `POST /api/customer/esignature/documents/{doc_id}/sign` - Sign document
- `GET /api/customer/esignature/documents/{doc_id}/signed-pdf` - Download signed PDF

### Frontend Components

**Admin View:**
- `ESignatureDocumentsList.tsx` - List all e-signature documents
- `CreateESignatureDocument.tsx` - Upload and configure document
- `ESignatureDocumentView.tsx` - View document and signature status
- `AdvancedSignatureFieldEditor.tsx` - Configure signature fields for advanced mode (drag-and-drop)

**Customer View:**
- `ESignatureViewer.tsx` - Main viewer component (handles both modes)
- `SimpleSignatureView.tsx` - Simple mode: PDF viewer with signature at bottom
- `AdvancedSignatureView.tsx` - Advanced mode: PDF with field overlays
- `SignatureCanvas.tsx` - Canvas component for drawing signature
- `SignatureInput.tsx` - Text input for typed signature
- `SignatureUpload.tsx` - Upload signature image

---

## 3. Folders (Project Organization)

### Overview
Folder-based organization system where each project gets a folder containing all related items. Reusable items (forms, Terms of Service, etc.) can be assigned to multiple folders.

### Key Capabilities
- **Auto-Create Folders**: Option to create folder when creating a quote
- **Many-to-Many Relationships**: Forms, files, and e-signature documents can belong to multiple folders
- **Folder Contents**: Forms, quotes, e-signature documents, files, activity timeline
- **Dual Customer View**: List view (current style) + Folder view (project-based)
- **Folder Assignment**: Assign folders to customers with proper access control

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

-- Many-to-many: Forms to Folders (for reusable forms)
CREATE TABLE form_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(form_id, folder_id)
);

-- Link quotes to folders (quotes typically belong to one folder)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_folder_id ON quotes(folder_id);

-- Link forms to folders (for backward compatibility - primary folder)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forms_folder_id ON forms(folder_id);

-- Indexes
CREATE INDEX idx_folders_client_id ON folders(client_id);
CREATE INDEX idx_folders_status ON folders(status);
CREATE INDEX idx_folders_created_at ON folders(created_at DESC);
CREATE INDEX idx_folder_assignments_folder_id ON folder_assignments(folder_id);
CREATE INDEX idx_folder_assignments_user_id ON folder_assignments(user_id);
CREATE INDEX idx_form_folder_assignments_form_id ON form_folder_assignments(form_id);
CREATE INDEX idx_form_folder_assignments_folder_id ON form_folder_assignments(folder_id);
```

### Auto-Create Folder Feature

**Quote Creation Flow:**
1. Admin creates quote
2. Checkbox: "Create new folder for this project"
3. If checked:
   - Create folder with name based on quote title or client name
   - Link quote to folder
   - Optionally assign folder to client's user account
4. If unchecked:
   - Option to select existing folder or leave unassigned

### Customer View Options

**List View (Current Style):**
- All folders listed in date order
- Each folder shows:
  - Project name/number
  - Status indicators (pending signatures, incomplete forms)
  - Last activity date
  - Quick actions
- Click folder → Opens folder detail view

**Folder View (Project-Based):**
- Grid or card layout of folders
- Each folder card shows:
  - Project name
  - Thumbnail/preview
  - Status summary (X forms pending, Y signatures needed)
  - Recent activity
- Click folder → Opens folder detail view

**Toggle Between Views:**
- View switcher in customer dashboard
- User preference saved (localStorage or user settings)

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
- `POST /api/folders/{folder_id}/assign-form` - Assign form to folder (many-to-many)
- `DELETE /api/folders/{folder_id}/assign-form/{form_id}` - Remove form assignment

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
- Update `QuoteBuilder.tsx` - Add "Create folder" checkbox

**Customer View:**
- `CustomerDashboard.tsx` - Updated with view toggle
  - List view (current style, enhanced)
  - Folder view (new project-based cards)
- `FolderDetailView.tsx` - Detailed folder view with:
  - Tabs: Overview, Forms, Quotes, Documents, E-Signatures, Files
  - Activity timeline
  - Status summary
  - Quick actions

---

## Implementation Phases

### Phase 1: Database & Backend Foundation (Week 1)

**Database Migrations:**
1. Create `files` table with Google Drive support
2. Create `file_folder_assignments` table (many-to-many)
3. Create `esignature_documents` table with signature_mode
4. Create `esignature_signatures` table
5. Create `esignature_document_folder_assignments` table (many-to-many)
6. Create `folders` table
7. Create `folder_assignments` table
8. Create `form_folder_assignments` table (many-to-many)
9. Add `folder_id` columns to existing tables (quotes, forms)
10. Create all indexes

**Backend Models:**
1. File models (Pydantic)
2. E-Signature models (simple + advanced)
3. Folder models
4. Many-to-many relationship models

**Backend Routers:**
1. `/api/files` - Basic CRUD + Google Drive integration
2. `/api/esignature` - Document management
3. `/api/folders` - Folder management

**Google Drive Setup:**
1. Set up Google Cloud Project with Drive API enabled
2. Create OAuth 2.0 Client credentials
3. Frontend: Google Picker API integration (recommended)
4. Backend: Endpoint to store Google Drive file references
5. Environment variables for OAuth client ID

### Phase 2: Files System + Google Drive Import (Week 1-2)

**Backend:**
1. File upload to Supabase Storage
2. Google Drive import endpoint (store file references)
3. File metadata management
4. File download (Supabase files) / link generation (Drive files)
5. Many-to-many folder assignments

**Frontend:**
1. `FileUpload.tsx` - Drag & drop component for Supabase uploads
2. `GoogleDrivePicker.tsx` - Google Picker API integration for file selection
3. `FilesList.tsx` - File list with filters
4. `FileViewer.tsx` - Preview/download (handles both Supabase and Drive files)
5. File assignment to folders
6. "Import from Google Drive" button/action

### Phase 3: E-Signature - Simple Mode (Week 2)

**Backend:**
1. E-signature document creation
2. PDF signature embedding (simple mode - bottom of page)
3. Signature storage and tracking
4. Signed PDF generation

**Frontend:**
1. `ESignatureViewer.tsx` - Simple mode viewer
2. `SimpleSignatureView.tsx` - PDF viewer with signature area
3. `SignatureCanvas.tsx` - Draw signature
4. `SignatureInput.tsx` - Type signature
5. `SignatureUpload.tsx` - Upload signature image

### Phase 4: E-Signature - Advanced Mode (Week 2-3)

**Backend:**
1. Advanced signature field management
2. Multiple signature field embedding
3. Field position tracking
4. Sequential signing support

**Frontend:**
1. `AdvancedSignatureView.tsx` - PDF with field overlays
2. `AdvancedSignatureFieldEditor.tsx` - Admin field configuration
3. Drag-and-drop signature field placement
4. Field completion tracking

### Phase 5: Folders System (Week 3)

**Backend:**
1. Folder CRUD operations
2. Folder assignment to customers
3. Folder contents aggregation
4. Many-to-many form assignments
5. Auto-create folder on quote creation

**Frontend:**
1. `FoldersList.tsx` - Admin folder management
2. `FolderView.tsx` - Folder detail view
3. `CreateFolder.tsx` - Folder creation
4. Update `QuoteBuilder.tsx` - Add folder creation option
5. Folder assignment UI

### Phase 6: Customer Dashboard - Dual View (Week 3-4)

**Frontend:**
1. Update `CustomerDashboard.tsx`:
   - Add view toggle (List/Folder)
   - List view: Enhanced folder list
   - Folder view: Project-based cards
2. `FolderDetailView.tsx` - Complete folder view
3. Folder contents tabs (Forms, Quotes, Documents, Files)
4. Activity timeline
5. Status indicators

### Phase 7: Integration & Many-to-Many (Week 4)

**Backend:**
1. Reusable items support:
   - Forms in multiple folders
   - Files in multiple folders
   - E-signature documents in multiple folders
2. Assignment endpoints for all item types
3. Content aggregation per folder

**Frontend:**
1. Assignment UI for reusable items
2. "Add to folder" actions throughout app
3. Folder selection when creating items
4. Reusable item management

### Phase 8: Polish & Testing (Week 4)

1. End-to-end testing
2. Bug fixes
3. Performance optimization
4. Documentation
5. Migration of existing data (optional)

---

## Technical Details

### Google Drive Integration

**Setup:**
1. Create Google Cloud Project
2. Enable Google Drive API and Google Picker API
3. Create OAuth 2.0 Client credentials (Web application)
4. Configure authorized JavaScript origins and redirect URIs
5. Store OAuth client ID in environment variables

**Implementation - Frontend (Google Picker API):**
```typescript
// frontend/src/components/GoogleDrivePicker.tsx
import { useEffect } from 'react';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

function GoogleDrivePicker({ onFileSelect }: { onFileSelect: (file: any) => void }) {
  useEffect(() => {
    // Load Google Picker API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('picker', () => {
        // Picker API ready
      });
    };
    document.body.appendChild(script);
  }, []);

  const showPicker = () => {
    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.DOCS)
      .setOAuthToken(accessToken) // Get from OAuth flow
      .setCallback((data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
          const file = data[window.google.picker.Response.DOCUMENTS][0];
          onFileSelect({
            id: file.id,
            name: file.name,
            url: file.url,
            mimeType: file.mimeType
          });
        }
      })
      .build();
    picker.setVisible(true);
  };
}
```

**Implementation - Backend:**
```python
# backend/routers/files.py
@router.post("/import-from-drive")
async def import_from_drive(file_data: GoogleDriveFileImport):
    """Store reference to Google Drive file"""
    # file_data contains: file_id, name, url, mime_type
    # Store in database, don't download file content
    pass
```

**Environment Variables:**
- `GOOGLE_DRIVE_CLIENT_ID` - OAuth 2.0 Client ID (frontend)
- `GOOGLE_DRIVE_API_KEY` - API Key for Picker API (optional, can use client ID)

### PDF Signature Embedding

**Libraries:**
- `PyPDF2` or `pypdf` - PDF manipulation
- `reportlab` - PDF generation (already in use)
- `Pillow` - Image processing for signatures

**Simple Mode:**
- Add signature image to last page of PDF
- Position at bottom center
- Maintain PDF structure

**Advanced Mode:**
- Parse signature field definitions
- Embed signatures at specified coordinates
- Support multiple pages
- Handle different field types

### Many-to-Many Relationships

**Pattern:**
- Primary relationship: `folder_id` column (for single-folder items)
- Many-to-many: `*_folder_assignments` tables (for reusable items)
- Query both when fetching folder contents

**Example Query:**
```sql
-- Get all forms in a folder (both direct and assigned)
SELECT DISTINCT f.*
FROM forms f
LEFT JOIN form_folder_assignments ffa ON f.id = ffa.form_id
WHERE f.folder_id = :folder_id 
   OR ffa.folder_id = :folder_id;
```

---

## Migration Strategy

### Existing Data
1. **Quotes**: Can be assigned to folders retroactively
2. **Forms**: Can be assigned to folders retroactively
3. **Clients**: Auto-create folders for existing clients (optional)
4. **No data loss**: All existing functionality preserved

### Gradual Rollout
1. Folders optional initially
2. Auto-create option in quote builder
3. Customer view toggle (defaults to list view)
4. Eventually make folders required (future phase)

---

## Success Metrics

1. **Files**: 
   - Upload success rate > 99%
   - Google Drive file picker working
   - Google Drive file references stored correctly
   - File access controls enforced

2. **E-Signature**:
   - Simple mode: < 2 minutes to sign
   - Advanced mode: Field placement working
   - Signature embedding successful

3. **Folders**:
   - Auto-create working in quote builder
   - Many-to-many assignments working
   - Customer view toggle functional
   - Folder contents loading < 2 seconds

---

## Next Steps

1. **Review this plan** - Confirm all requirements captured
2. **Set up Google Drive** - Get credentials ready
3. **Begin Phase 1** - Database migrations and backend foundation
4. **Iterate** - Build and test each phase

Ready to start implementation!

