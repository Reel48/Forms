# File Access Issues - Root Cause Analysis

## The Problem

You're experiencing 500 errors when trying to:
- View file details (`GET /api/files/{id}`)
- Preview files (`GET /api/files/{id}/preview`)
- Download files (`GET /api/files/{id}/download`)

## Root Cause

### The Core Issue: Row Level Security (RLS) and Supabase Client Configuration

**The Problem:**
1. **RLS is enabled** on the `files` table (and other tables) in Supabase
2. **RLS policies check `auth.uid()`** - they require the user's JWT token to identify who is making the request
3. **The backend uses two Supabase clients:**
   - `supabase` - uses the **anon key** (subject to RLS)
   - `supabase_storage` - uses the **service role key** (bypasses RLS)

4. **The original code used `supabase` (anon key) for database operations**, which means:
   - When the backend tries to query the database, Supabase checks RLS policies
   - RLS policies look for `auth.uid()` (the user ID from the JWT token)
   - **But the Supabase Python client doesn't automatically pass the user's JWT token** from the FastAPI request
   - So `auth.uid()` is NULL, and RLS blocks the query
   - Result: 500 error or "0 rows" error

### Why This Happens

The Supabase Python client (`supabase==2.0.0`) doesn't automatically extract the JWT token from FastAPI's request context. The client is initialized once at startup with either:
- Anon key (subject to RLS)
- Service role key (bypasses RLS)

When you authenticate a user in FastAPI and get their JWT token, that token isn't automatically passed to the Supabase client for subsequent database queries.

### The Solution

**Use the service role client (`supabase_storage`) for database operations** where:
1. The user is already authenticated by the backend (via `get_current_user`)
2. We've verified their identity and permissions
3. We need to bypass RLS to perform the operation

This is safe because:
- The backend has already verified the user is authenticated
- The backend checks permissions before allowing operations
- We're not exposing the service role key to the frontend

## What We've Fixed

### ✅ Fixed Endpoints:
1. **File Upload** (`POST /api/files/upload`)
   - Changed from `supabase` to `supabase_storage` for insert
   - ✅ Now works

2. **Get File** (`GET /api/files/{id}`)
   - Changed from `supabase` to `supabase_storage` for select
   - ✅ Should work after deployment

3. **Download File** (`GET /api/files/{id}/download`)
   - Changed from `supabase` to `supabase_storage` for select
   - Improved signed URL handling
   - ✅ Should work after deployment

4. **Preview File** (`GET /api/files/{id}/preview`)
   - Changed from `supabase` to `supabase_storage` for select
   - Improved signed URL response parsing
   - ✅ Should work after deployment

### 🔧 Additional Improvements:
- Added better error handling for signed URL generation
- Added logging to debug response format issues
- Handle both dict and string responses from `create_signed_url`

## Why We're Having So Much Trouble

1. **Inconsistent Client Usage**: The codebase mixed `supabase` (anon key) and `supabase_storage` (service role) inconsistently
2. **RLS Complexity**: RLS policies work great for direct frontend-to-Supabase calls, but require special handling for backend-to-Supabase calls
3. **Silent Failures**: RLS blocks queries silently, returning empty results or errors that are hard to debug
4. **Multiple Endpoints**: Each file operation endpoint needed the same fix applied

## The Pattern Going Forward

**For any database operation where:**
- The user is authenticated by the backend
- We need to bypass RLS
- We've already verified permissions

**Use `supabase_storage` (service role client)**

**For operations that should respect RLS:**
- Use `supabase` (anon key client)
- But ensure the user's JWT token is passed (requires additional setup)

## Current Status

- ✅ File upload: Fixed and deployed
- ✅ File viewing: Fixed, deploying
- ✅ File preview: Fixed, deploying  
- ✅ File download: Fixed, deploying

All fixes are committed and will be live once the current AWS deployment completes (3-5 minutes).

