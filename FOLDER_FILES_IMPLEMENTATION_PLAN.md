# Folder-Specific Files Implementation Plan

## Overview
Separate files from the "Tasks" table and allow both admins and customers to upload project-specific files directly to folders. These files should only exist within that folder and not appear elsewhere on the site.

## Current State
- Files are combined with forms and e-signatures in a "Tasks" table
- Files can be reusable (templates) or instances
- Files can be assigned to folders via many-to-many relationship (`file_folder_assignments`)
- Only admins can currently upload files
- Files uploaded with `folder_id` default to `is_reusable=True`

## Desired State
1. **Separate Files Section**: Files should have their own section in the folder view, separate from Tasks
2. **Folder-Specific Uploads**: Files uploaded directly to a folder should:
   - Have `is_reusable=False` (not templates)
   - Have `folder_id` set directly (not via many-to-many)
   - Only appear in that specific folder
   - Not appear in template library or elsewhere
3. **Upload Permissions**: Both admins and customers with folder access can upload files
4. **Storage Isolation**: Folder-uploaded files are scoped to that folder only

## Implementation Plan

### 1. Backend Changes

#### A. Update `upload_file` endpoint (`backend/routers/files.py`)
- **When `folder_id` is provided**: 
  - Set `is_reusable=False` automatically
  - Set `folder_id` directly on the file
  - Do NOT create `file_folder_assignments` entry
  - Verify user has access to the folder (admin or assigned customer)

#### B. Update `list_files` endpoint (`backend/routers/files.py`)
- **For folder-specific files**: When `folder_id` is provided, only show files where:
  - `folder_id` matches directly (not via many-to-many)
  - `is_reusable=False`
- **For template library**: Exclude files with `folder_id` set (only show `is_reusable=True` files)

#### C. Update `get_folder_content` endpoint (`backend/routers/folders.py`)
- **Separate files from tasks**: Return files separately from forms/e-signatures
- **Only show folder-specific files**: Only include files where `folder_id` matches and `is_reusable=False`
- **Exclude template assignments**: Don't show reusable files assigned via `file_folder_assignments` in folder content

#### D. Create folder-specific upload endpoint (optional)
- New endpoint: `POST /api/folders/{folder_id}/files/upload`
- Automatically sets `folder_id` and `is_reusable=False`
- Verifies folder access before allowing upload

### 2. Frontend Changes

#### A. Update `FolderView.tsx`
- **Separate Files Section**: Create a new "Files" section above or below the Tasks section
- **Upload Button**: Show upload button for both admins and customers (if they have folder access)
- **File List**: Display folder-specific files in a table with:
  - File name
  - File type
  - File size
  - Upload date
  - Uploaded by
  - Actions (view, download, delete - based on permissions)

#### B. Create `FolderFileUpload` component (optional)
- Drag-and-drop file upload interface
- Shows upload progress
- Refreshes file list after upload

#### C. Update file upload flow
- When uploading from folder view, automatically set `folder_id`
- Show clear indication that file will only exist in this folder

### 3. Database Schema
- **No schema changes needed**: Current schema supports this with:
  - `files.folder_id` (direct assignment)
  - `files.is_reusable` (distinguishes templates from folder-specific files)
  - `file_folder_assignments` (for reusable templates, not used for folder-specific files)

### 4. Access Control

#### Upload Permissions
- **Admin**: Can upload to any folder
- **Customer**: Can upload to folders they have access to (via `folder_assignments`)
- **Verification**: Check `folder_assignments` table before allowing upload

#### View/Download Permissions
- **Admin**: Can view/download all files
- **Customer**: Can view/download files in folders they have access to
- Files inherit folder access permissions

### 5. File Management

#### Delete Permissions
- **Admin**: Can delete any file
- **Customer**: Can delete files they uploaded in folders they have access to
- When file is deleted, it's removed from storage and database

#### File Isolation
- Files with `folder_id` set and `is_reusable=False`:
  - Only appear in that folder's file list
  - Do NOT appear in template library (`/files` page)
  - Do NOT appear in other folders
  - Do NOT appear in global file searches (unless admin)

## Implementation Steps

1. ✅ Update backend `upload_file` to handle folder-specific uploads
2. ✅ Update backend `list_files` to filter folder-specific files correctly
3. ✅ Update backend `get_folder_content` to separate files from tasks
4. ✅ Update frontend `FolderView.tsx` to show separate Files section
5. ✅ Add upload functionality to folder view (for both admin and customer)
6. ✅ Test upload permissions and access control
7. ✅ Verify files don't appear in template library when folder-specific

## Benefits
- Clear separation between reusable templates and project-specific files
- Better organization: project files stay with their project
- Customer empowerment: customers can upload project files
- Cleaner template library: only reusable templates appear
- Better storage management: folder-specific files are clearly scoped

