# Assignment Copy Status

## Summary

This document outlines the current status of how forms and e-signatures are handled when assigned to folders.

## Forms ✅ **CORRECT - No Changes Needed**

**Current Implementation:**
- Forms are assigned to folders via `form_folder_assignments` (many-to-many relationship)
- The **same form instance** is shared across folders
- Form submissions are stored separately in `form_submissions` table
- Each submission is independent and doesn't affect the form template

**Why This Works:**
- Forms are designed to handle multiple submissions
- Submissions are stored separately with their own data
- The form template (structure, fields, settings) remains unchanged
- Multiple users can submit the same form without conflicts

**Status:** ✅ **No changes needed** - Forms work correctly as-is

## E-Signatures ✅ **FIXED - Now Creates Copies**

**Previous Implementation (Before Fix):**
- E-signatures were assigned to folders via `esignature_document_folder_assignments` (many-to-many)
- The **same document instance** was shared across folders
- When signed, the document's `status` was updated to "signed"
- This would mark the template as "signed", affecting all folder assignments

**New Implementation (After Fix):**
- When assigning an e-signature template to a folder, a **copy (instance)** is created
- The copy has `is_template=False` and `folder_id` set to the folder
- The original template remains unchanged (`is_template=True`)
- The copy can be signed independently without affecting the template
- If a copy already exists for the same template in the folder, it returns the existing copy instead of creating a new one

**How It Works:**
1. Admin assigns template to folder → System creates a copy
2. Copy is stored as a new document with `is_template=False`
3. Template remains in template library unchanged
4. Copy can be signed, declined, etc. without affecting template
5. Removing from folder deletes the copy, not the template

**Status:** ✅ **Fixed** - E-signatures now create copies when assigned to folders

## Files

**Current Implementation:**
- Files are assigned to folders via `file_folder_assignments` (many-to-many)
- The **same file instance** is shared across folders
- Files are read-only content, so sharing is appropriate

**Status:** ✅ **Correct** - Files are meant to be shared (like PDFs, images)

## Quotes

**Current Implementation:**
- Quotes have a direct `folder_id` relationship (one-to-one)
- Each quote belongs to one folder
- Quotes can also be assigned to multiple folders via `quote_folder_assignments` (many-to-many)

**Status:** ✅ **Correct** - Quotes are project-specific, not templates

