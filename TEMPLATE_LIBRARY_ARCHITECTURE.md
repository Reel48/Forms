# Template Library Architecture Proposal

## Goal
Transform E-Signatures, Files, and Forms pages into **template libraries** for reusable content, while storing actual signed/completed documents in folders.

## Current State
- All documents appear in main pages regardless of status
- Templates and instances are mixed together
- No clear distinction between reusable templates and project-specific documents

## Proposed Solutions

### Option 1: Template Flag + Folder Filtering (Recommended)
**Simple and backward-compatible**

#### Implementation:
1. **Add `is_template` field** to:
   - `esignature_documents` table
   - `files` table (already has `is_reusable` - can repurpose or add `is_template`)
   - `forms` table

2. **Default Behavior:**
   - When creating: `is_template = true` by default
   - Main pages (E-Signatures, Files, Forms) show only `is_template = true`
   - Folders show all documents (templates + instances)

3. **Workflow:**
   - Admin creates template in main page → `is_template = true`
   - When assigning to folder, create instance copy → `is_template = false`, `folder_id` set
   - Signed/completed documents automatically set `is_template = false`

#### Pros:
- ✅ Simple to implement
- ✅ Backward compatible (existing docs can be marked as templates)
- ✅ Clear separation
- ✅ Folders show everything (templates + instances)

#### Cons:
- ⚠️ Need to handle copying templates to instances
- ⚠️ Two versions of same document (template + instance)

---

### Option 2: Status-Based Filtering
**Uses existing status field**

#### Implementation:
1. **New Status Values:**
   - E-Signatures: `template`, `pending`, `signed`, `declined`, `expired`
   - Forms: `template`, `draft`, `active`, `archived`
   - Files: Use `is_reusable` flag (already exists)

2. **Filtering:**
   - Main pages: Show only `status = 'template'` (or `is_reusable = true` for files)
   - Folders: Show all non-template statuses

3. **Workflow:**
   - Create template → `status = 'template'`
   - When using template, create new document with `status = 'pending'` in folder
   - Templates never change status (always reusable)

#### Pros:
- ✅ Uses existing status field
- ✅ Clear workflow
- ✅ Templates are immutable

#### Cons:
- ⚠️ Need to add new status values
- ⚠️ Migration needed for existing data

---

### Option 3: Separate Template and Instance Tables
**Most robust but complex**

#### Implementation:
1. **New Tables:**
   - `esignature_templates` (reusable templates)
   - `esignature_instances` (folder-specific documents)
   - Similar for forms and files

2. **Relationship:**
   - `instances.template_id` → references template
   - Templates never have `folder_id`
   - Instances always have `folder_id`

3. **Workflow:**
   - Create template → stored in template table
   - Use template → create instance in folder
   - Templates remain unchanged, instances track signatures/completions

#### Pros:
- ✅ Complete separation
- ✅ Templates truly immutable
- ✅ Better data integrity

#### Cons:
- ⚠️ Most complex to implement
- ⚠️ Requires schema changes
- ⚠️ More complex queries

---

### Option 4: Folder-Based Filtering (Simplest)
**No schema changes needed**

#### Implementation:
1. **Filtering Logic:**
   - Main pages: Show only documents where `folder_id IS NULL`
   - Folders: Show documents where `folder_id = <folder_id>`

2. **Workflow:**
   - Create template → leave `folder_id = NULL`
   - Assign to folder → set `folder_id`
   - Once assigned, disappears from main page

3. **UI Changes:**
   - Main pages: "Template Library" header
   - "Assign to Folder" button creates copy or moves document
   - Folders show all assigned documents

#### Pros:
- ✅ No schema changes
- ✅ Simplest implementation
- ✅ Clear visual separation

#### Cons:
- ⚠️ Can't have same template in multiple folders (without copying)
- ⚠️ Templates can't be "used" without losing template status

---

## Recommended Approach: **Option 1 with Many-to-Many Support**

**Note**: The system already has `esignature_document_folder_assignments` table (many-to-many), which means templates can be assigned to multiple folders without losing template status. This is perfect for our use case!

### Implementation Plan:

#### Phase 1: Add Template Flag
1. Add `is_template` boolean to:
   - `esignature_documents` (default: `true` for new, `false` for existing)
   - `forms` (default: `true` for new, `false` for existing)
   - Use existing `is_reusable` for `files`

2. Migration:
   - Set `is_template = true` for documents that are reusable templates
   - Set `is_template = false` for documents that are project-specific instances
   - **Key Insight**: Templates can be in `esignature_document_folder_assignments` (many-to-many) while still being templates
   - Instances have `folder_id` set directly (one-to-many) and `is_template = false`

#### Phase 2: Update Backend Filtering
1. **Main List Endpoints (Template Library):**
   ```python
   # E-Signatures, Files, Forms list endpoints
   query = query.eq("is_template", True)  # or is_reusable for files
   # Don't filter by folder_id - templates can be assigned to folders via many-to-many
   ```

2. **Folder Content Endpoints:**
   - Show documents via two sources:
     a. Direct assignment: `folder_id = <folder_id>` AND `is_template = false` (instances)
     b. Template assignment: Join with `esignature_document_folder_assignments` where `is_template = true` (templates)
   - Combine both in response

#### Phase 3: Update Frontend
1. **Main Pages:**
   - Change header: "E-Signature Templates" / "File Templates" / "Form Templates"
   - Add badge: "Template" on all items
   - "Use Template" button → creates instance in selected folder
   - Remove "Assign to Folder" (replaced by "Use Template")

2. **Folder View:**
   - Show all documents (templates + instances)
   - Badge: "Template" or "Instance" based on `is_template`
   - Templates in folders are read-only references

#### Phase 4: Template Usage Workflow
1. **"Use Template" Flow (Two Options):**

   **Option A: Reference Template (Recommended)**
   ```
   User clicks "Use Template" → Select folder → 
   Backend creates entry in esignature_document_folder_assignments:
   - document_id = template_id
   - folder_id = selected_folder
   - status = 'pending'
   - Template remains in library, can be used in multiple folders
   ```

   **Option B: Create Instance Copy**
   ```
   User clicks "Use Template" → Select folder → 
   Backend creates copy with:
   - is_template = false
   - folder_id = selected_folder
   - status = 'pending'
   - New unique ID
   - Original template remains unchanged
   ```

2. **Recommendation**: Use Option A (many-to-many) for templates, Option B for instances
   - Templates → Use `esignature_document_folder_assignments` (reusable)
   - Instances → Set `folder_id` directly (project-specific)

---

## Database Schema Changes

### Migration SQL:

```sql
-- Add is_template to esignature_documents
ALTER TABLE esignature_documents 
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT true;

-- Set existing documents based on folder assignment
UPDATE esignature_documents 
SET is_template = false 
WHERE folder_id IS NOT NULL OR status IN ('signed', 'declined');

-- Add is_template to forms
ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT true;

-- Set existing forms based on folder assignment
UPDATE forms 
SET is_template = false 
WHERE folder_id IS NOT NULL;

-- Files already have is_reusable, use that
-- No changes needed for files table
```

---

## UI/UX Changes

### Main Pages (Template Library):
- **Header**: "E-Signature Templates" / "File Templates" / "Form Templates"
- **Subtitle**: "Reusable templates for your projects"
- **Actions**:
  - "Create Template" (instead of "Create Document")
  - "Use Template" → opens folder selector
  - "Edit Template" (only for templates)
  - "Delete Template" (only if not used)

### Folder View:
- **Section**: "E-Signature Documents" (shows templates + instances)
- **Badges**: 
  - "Template" (read-only, reusable)
  - "Instance" (editable, project-specific)
- **Actions**:
  - Templates: "View" only
  - Instances: Full CRUD operations

---

## Benefits

1. **Clean Organization**: Templates separate from project documents
2. **Reusability**: Templates can be used in multiple folders
3. **Forward-Looking**: Main pages focus on future use, not storage
4. **Scalability**: Folders handle project-specific documents
5. **User Experience**: Clear mental model (library vs. project)

---

## Implementation Priority

1. **High Priority**: Add `is_template` field and filtering
2. **Medium Priority**: Update UI labels and workflows
3. **Low Priority**: Template usage analytics, template versioning

---

## Questions to Consider

1. **Template Editing**: Should editing a template affect existing instances?
   - Option A: Templates are immutable (create new version)
   - Option B: Templates can be edited (instances are snapshots)

2. **Template Deletion**: What happens to instances if template is deleted?
   - Option A: Instances remain (orphaned)
   - Option B: Prevent deletion if instances exist

3. **Template Sharing**: Can templates be shared across users?
   - Option A: Templates are user-specific
   - Option B: Public template library

4. **Instance Creation**: Should instances be exact copies or allow customization?
   - Option A: Exact copy (template is master)
   - Option B: Allow customization at instance level

