# Authentication Setup Guide

## Overview
This guide will help you set up user authentication for the Forms application with admin and customer roles.

## Prerequisites
- Supabase project with database schema set up
- Backend and frontend environments configured

## Step 1: Enable Supabase Authentication

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** > **Providers**
3. Enable **Email** provider (should be enabled by default)
4. Configure email settings:
   - Go to **Authentication** > **Email Templates**
   - Customize templates if needed (optional)

## Step 2: Get JWT Secret

1. In Supabase Dashboard, go to **Settings** > **API**
2. Find **JWT Secret** (under "JWT Settings")
3. Copy this value - you'll need it for the backend

## Step 3: Update Backend Environment Variables

Add to your `backend/.env` file:

```env
SUPABASE_JWT_SECRET=+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw==
```

This is required for token verification in the backend.

## Step 4: Run Database Migration

Run the authentication migration SQL file:

1. Go to Supabase Dashboard > **SQL Editor**
2. Open `database/authentication_migration.sql`
3. Copy and paste the entire contents
4. Click **Run**

This will create:
- `user_roles` table
- `quote_assignments` table
- `form_assignments` table
- Required indexes and RLS policies

## Step 5: Create Admin User

### Option A: Using Supabase Dashboard

1. Go to **Authentication** > **Users**
2. Click **Add User** > **Create New User**
3. Enter:
   - Email: `admin@reel48.com`
   - Password: (choose a strong password)
   - Auto Confirm User: ✅ (checked)
4. Click **Create User**
5. Copy the User ID (UUID)

### Option B: Using SQL (After creating user in dashboard)

Run this SQL in Supabase SQL Editor (replace `USER_ID_HERE` with the actual user ID):

```sql
-- Create admin role for admin@reel48.com
INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'USER_ID_HERE',  -- Replace with actual user ID from auth.users
  'admin',
  NOW(),
  NOW()
);
```

## Step 6: Install Frontend Dependencies

In the `frontend` directory:

```bash
npm install @supabase/supabase-js
```

## Step 7: Configure Frontend Environment

Add to `frontend/.env`:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Get these from Supabase Dashboard > Settings > API

## Step 8: Test Authentication

1. Start backend: `cd backend && uvicorn main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Try logging in with admin credentials
4. Test customer registration

## Troubleshooting

### "JWT secret not configured"
- Make sure `SUPABASE_JWT_SECRET` is set in backend `.env`

### "User not found" errors
- Verify user exists in Supabase Auth
- Check that `user_roles` table has an entry for the user

### RLS policy errors
- For development, you can temporarily disable RLS or use permissive policies
- Check the migration file for commented-out permissive policies

### Token verification fails
- Verify JWT secret matches Supabase dashboard
- Check token expiration (default is 1 hour)
- Ensure token is sent in `Authorization: Bearer <token>` header

## Next Steps

After setup:
1. Test admin login
2. Create a test customer account
3. Assign a quote/form to the customer
4. Test customer access

## Security Notes

- Never commit `.env` files to git
- Use strong passwords for admin account
- In production, enable email confirmation
- Consider adding rate limiting
- Review RLS policies for production use

