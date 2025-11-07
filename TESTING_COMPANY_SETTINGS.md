# Testing Company Settings Locally

## Quick Local Test

### 1. Run Database Migration
Execute `database/company_settings_migration.sql` in Supabase SQL Editor.

### 2. Start Backend Locally
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

### 3. Start Frontend Locally
```bash
cd frontend
npm install  # If you haven't already
npm run dev
```

### 4. Test the Feature
1. Visit `http://localhost:5173`
2. Click "Settings" in navigation
3. Fill in your company information
4. Save
5. Create or view a quote
6. Verify company info appears in "From" section

## What to Test

✅ Settings page loads and saves company info
✅ Company info appears on quotes (web view)
✅ Company info appears in PDF exports
✅ Logo displays if URL is provided
✅ Two-column layout (From / Bill To) looks good

