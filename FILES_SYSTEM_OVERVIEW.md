# Files System Implementation Overview

## Overview

A file management system that allows users to upload, store, and manage files (PDFs, images, documents) using Supabase Storage. Files can be associated with folders, quotes, forms, and e-signature documents.

---

## Core Features

### 1. File Upload
- **Drag & Drop Interface**: Users can drag files directly onto the upload area
- **Click to Upload**: Traditional file picker as fallback
- **File Size Limit**: 10MB per file
- **Supported Types**: PDFs, images, documents, and other common file types
- **Storage**: Files stored in Supabase Storage bucket (`project-files`)

### 2. File Management
- **View Files**: List all files with metadata (name, size, type, upload date)
- **Download Files**: Download files from storage
- **Delete Files**: Remove files from storage
- **File Preview**: Preview images and PDFs in browser
- **File Metadata**: Track uploader, creation date, file size, MIME type

### 3. File Organization
- **Folder Association**: Files can be assigned to folders (many-to-many)
- **Quote Association**: Files can be linked to quotes
- **Form Association**: Files can be linked to forms
- **E-Signature Association**: Files can be linked to e-signature documents
- **Reusable Files**: Files can be used in multiple folders (e.g., Terms of Service)

### 4. Access Control
- **Admin**: Full access to all files
- **Customer**: Access only to files in their assigned folders
- **Row Level Security**: Enforced at database level

---

## User Experience

### Admin View

**Files List Page** (`/files`)
- Table/grid view of all files
- Filters: by folder, by type, by date, by uploader
- Search functionality
- Upload button/area at top
- Actions: View, Download, Delete, Assign to Folder

**Upload Interface**
- Drag & drop zone (large, visible area)
- Click to browse files
- Progress indicator during upload
- Multiple file selection support
- File preview thumbnails (for images)

**File Detail View**
- File preview (if supported)
- File metadata
- Download button
- Delete button
- Folder assignments list
- Assignment history

### Customer View

**Folder Detail View** (Files Tab)
- List of files in the folder
- Download buttons
- File previews (if accessible)
- No upload/delete (read-only)

---

## Database Schema

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
  
  -- Relationships
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  esignature_document_id UUID REFERENCES esignature_documents(id) ON DELETE SET NULL,
  
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

---

## API Endpoints

### Backend (`/api/files`)

**File Management:**
- `GET /api/files` - List files (with filters: folder_id, quote_id, form_id, is_reusable)
- `GET /api/files/{file_id}` - Get file details
- `POST /api/files/upload` - Upload file to Supabase Storage
- `PUT /api/files/{file_id}` - Update file metadata
- `DELETE /api/files/{file_id}` - Delete file from storage
- `GET /api/files/{file_id}/download` - Download file
- `GET /api/files/{file_id}/preview` - Get preview URL

**Folder Assignments:**
- `POST /api/files/{file_id}/assign-to-folder` - Assign file to folder (many-to-many)
- `DELETE /api/files/{file_id}/assign-to-folder/{folder_id}` - Remove folder assignment
- `GET /api/files/{file_id}/folders` - Get all folders this file is assigned to

### Customer Endpoints (`/api/customer/files`)

- `GET /api/customer/files` - List files in customer's folders
- `GET /api/customer/files/{file_id}` - Get file details (if accessible)
- `GET /api/customer/files/{file_id}/download` - Download file (if accessible)
- `GET /api/customer/files/{file_id}/preview` - Get preview URL (if accessible)

---

## Frontend Components

### Admin Components

1. **`FilesList.tsx`**
   - Main files list page
   - Table/grid view
   - Filters and search
   - Upload button
   - File actions (view, download, delete)

2. **`FileUpload.tsx`**
   - Drag & drop zone
   - File picker
   - Upload progress
   - Multiple file support
   - File validation (size, type)

3. **`FileViewer.tsx`**
   - File preview (images, PDFs)
   - Download button
   - File metadata display
   - Folder assignments

4. **`FileCard.tsx`**
   - File card component for grid view
   - Thumbnail/preview
   - File name and metadata
   - Quick actions

### Customer Components

1. **`CustomerFilesList.tsx`**
   - Files list in folder view
   - Read-only access
   - Download buttons
   - File previews

---

## Implementation Steps

### Phase 1: Database & Backend (Day 1)
1. Create database migration for `files` table
2. Create database migration for `file_folder_assignments` table
3. Create Pydantic models in `backend/models.py`
4. Create backend router `/api/files` with basic CRUD
5. Implement file upload to Supabase Storage
6. Implement file download
7. Set up Supabase Storage bucket (`project-files`)

### Phase 2: Frontend - Upload & List (Day 1-2)
1. Create `FileUpload.tsx` component (drag & drop)
2. Create `FilesList.tsx` page
3. Create `FileCard.tsx` component
4. Add file upload API integration
5. Add file list API integration
6. Add route to App.tsx

### Phase 3: Frontend - View & Manage (Day 2)
1. Create `FileViewer.tsx` component
2. Add file preview functionality
3. Add download functionality
4. Add delete functionality
5. Add file metadata display

### Phase 4: Folder Assignments (Day 2-3)
1. Add folder assignment UI
2. Implement many-to-many assignment endpoints
3. Add assignment management in file viewer
4. Update file list to show folder associations

### Phase 5: Customer View (Day 3)
1. Create customer file list component
2. Add files tab to folder detail view
3. Implement customer file access controls
4. Test access restrictions

### Phase 6: Polish & Testing (Day 3-4)
1. Error handling
2. Loading states
3. File type icons
4. File size formatting
5. Date formatting
6. Testing and bug fixes

---

## Technical Details

### Supabase Storage Setup

**Bucket Configuration:**
- Bucket name: `project-files`
- Public: No (private bucket)
- File size limit: 10MB
- Allowed MIME types: All (or specific list)

**Storage Path Structure:**
```
project-files/
  {file_id}/
    {original_filename}
```

**Access Control:**
- Files accessed via signed URLs (temporary)
- RLS policies on `files` table
- Backend generates signed URLs for authorized users

### File Upload Flow

1. User selects/drops file
2. Frontend validates file (size, type)
3. Frontend uploads to `/api/files/upload`
4. Backend validates file
5. Backend generates unique filename
6. Backend uploads to Supabase Storage
7. Backend creates database record
8. Backend returns file metadata
9. Frontend updates file list

### File Download Flow

1. User clicks download
2. Frontend calls `/api/files/{file_id}/download`
3. Backend checks permissions
4. Backend generates signed URL from Supabase Storage
5. Backend returns file content or redirects to signed URL
6. Frontend triggers download

---

## UI/UX Considerations

### Upload Interface
- Large, visible drag & drop zone
- Clear visual feedback (hover state, drop state)
- Progress bar for uploads
- File preview thumbnails
- Error messages for failed uploads

### File List
- Sortable columns (name, size, date, type)
- Filter by type, folder, date range
- Search by filename
- Pagination for large lists
- File type icons
- Human-readable file sizes

### File Preview
- In-browser preview for images and PDFs
- Download button always visible
- File metadata clearly displayed
- Folder assignments visible

---

## Security Considerations

1. **File Validation**: Check file size and type on both frontend and backend
2. **Access Control**: RLS policies ensure users only see authorized files
3. **Signed URLs**: Use temporary signed URLs for file access
4. **File Naming**: Use UUIDs to prevent filename conflicts and path traversal
5. **Storage Permissions**: Private bucket with backend-controlled access

---

## Success Criteria

- ✅ Users can drag & drop files to upload
- ✅ Files are stored in Supabase Storage
- ✅ Files can be viewed, downloaded, and deleted
- ✅ Files can be assigned to folders
- ✅ Access control works (admin vs customer)
- ✅ File preview works for images and PDFs
- ✅ Upload progress is visible
- ✅ Error handling is clear and helpful

---

## Next Steps

Once you approve this overview, we'll start with:
1. Database migration for files table
2. Backend models and router
3. Supabase Storage bucket setup
4. Basic file upload functionality

Ready to proceed?

