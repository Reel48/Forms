# Content Creation Overview

## How Content Creation Works in This Application

### 1. **Forms** (`/api/forms`)
- **Endpoint**: `POST /api/forms`
- **Process**:
  1. Validates `FormCreate` model with fields array
  2. Generates unique form ID and URL slug
  3. Inserts form record into `forms` table
  4. Creates associated `form_fields` records in batch
  5. Returns complete form with fields
- **Current Issue**: ❌ **500 Error** - The code tries to insert `created_by` but the `forms` table schema doesn't have this column

### 2. **Quotes** (`/api/quotes`)
- **Endpoint**: `POST /api/quotes`
- **Process**:
  1. Generates quote number (QT-YYYYMMDD-XXXXXX)
  2. Calculates totals from line items
  3. Inserts quote record into `quotes` table
  4. Creates `line_items` records
  5. Optionally creates folder if `create_folder=true`
  6. Returns complete quote with relations
- **Status**: ✅ **Working** (recently fixed)

### 3. **Files** (`/api/files`)
- **Endpoint**: `POST /api/files` (multipart/form-data)
- **Process**:
  1. Uploads file to Supabase Storage
  2. Creates file record in `files` table
  3. Optionally links to folder/quote/form
  4. Returns file metadata
- **Status**: ✅ **Working**

### 4. **E-Signatures** (`/api/esignature/documents`)
- **Endpoint**: `POST /api/esignature/documents`
- **Process**:
  1. Validates file exists
  2. Creates document record in `esignature_documents` table
  3. Sets status to "pending"
  4. Returns document
- **Status**: ✅ **Working**

### 5. **Folders** (`/api/folders`)
- **Endpoint**: `POST /api/folders`
- **Process**:
  1. Creates folder record in `folders` table
  2. Optionally creates folder assignments
  3. Optionally links to quote
  4. Returns folder
- **Status**: ✅ **Working**

## Common Issues and Patterns

### Issue 1: Missing Database Columns
**Problem**: Code tries to insert columns that don't exist in the database schema.

**Examples**:
- Forms: `created_by` column missing from `forms` table
- Quotes: `create_folder` and `assign_folder_to_user_id` (fixed by excluding from insert)

**Solution**: Either:
1. Add missing columns to database schema, OR
2. Exclude non-existent columns from insert operations

### Issue 2: Query Syntax Issues
**Problem**: Using unsupported query syntax (e.g., `.or_()` method).

**Example**: Template endpoints using `.or_()` which doesn't work reliably.

**Solution**: Filter results in Python after fetching from database.

### Issue 3: JSONB Field Handling
**Problem**: JSONB fields (theme, settings, validation_rules, etc.) need proper serialization.

**Solution**: Ensure dict/JSON objects are properly serialized before insert.

## Database Schema Gaps

### Forms Table Missing Columns:
- ❌ `created_by` - Referenced in code but not in schema
- ✅ All other fields match

### Recommended Fix:
Add `created_by` column to `forms` table:
```sql
ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
```

## Current Status Summary

| Content Type | Endpoint | Status | Issue |
|-------------|----------|--------|-------|
| Forms | `POST /api/forms` | ❌ Broken | Missing `created_by` column |
| Quotes | `POST /api/quotes` | ✅ Working | Fixed recently |
| Files | `POST /api/files` | ✅ Working | - |
| E-Signatures | `POST /api/esignature/documents` | ✅ Working | - |
| Folders | `POST /api/folders` | ✅ Working | - |

