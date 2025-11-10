# Authentication Setup - Next Steps

## ✅ Completed Automatically

1. ✅ **Database Migration Applied**
   - Created `user_roles` table
   - Created `quote_assignments` table
   - Created `form_assignments` table
   - Added `created_by` columns to quotes and forms
   - Added user tracking to form_submissions
   - Created all indexes and RLS policies

## 📝 Manual Setup Required

### 1. Backend Environment Variables

Add to `backend/.env`:

```env
SUPABASE_JWT_SECRET=+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw==
```

(Your existing SUPABASE_URL and SUPABASE_KEY should already be there)

### 2. Frontend Environment Variables

Add to `frontend/.env`:

```env
VITE_SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
VITE_API_URL=http://localhost:8000
```

### 3. Create Admin User

**Option A: Using the Setup Script (Recommended)**

1. First, create the user in Supabase Dashboard:
   - Go to: https://supabase.com/dashboard/project/boisewltuwcjfrdjnfwd/auth/users
   - Click "Add User" > "Create New User"
   - Email: `admin@reel48.com`
   - Password: (choose a strong password - save this!)
   - Auto Confirm User: ✅ (checked)
   - Click "Create User"
   - Copy the User ID (UUID)

2. Run the setup script:
   ```bash
   cd /Users/brayden/Forms/Forms
   python3 scripts/setup-admin-user.py <USER_ID>
   ```

**Option B: Manual SQL**

1. Create user in Supabase Dashboard (same as above)
2. Copy the User ID
3. Run this SQL in Supabase SQL Editor:
   ```sql
   INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
   VALUES (
     gen_random_uuid(),
     'YOUR_USER_ID_HERE',
     'admin',
     NOW(),
     NOW()
   )
   ON CONFLICT (user_id) DO UPDATE
   SET role = 'admin', updated_at = NOW();
   ```

## 🧪 Testing

1. **Start Backend:**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. **Start Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test Login:**
   - Go to http://localhost:5173/login
   - Login with `admin@reel48.com` and your password
   - You should see admin features in the navigation

4. **Test Customer Registration:**
   - Go to http://localhost:5173/register
   - Create a test customer account
   - Login and verify you only see assigned items (empty initially)

## 📋 What's Next

After setup is complete, we'll build:
1. Assignment UI components (assign quotes/forms to customers)
2. Customer dashboard improvements
3. Assignment management features

## 🔧 Troubleshooting

### "JWT secret not configured"
- Make sure `SUPABASE_JWT_SECRET` is in `backend/.env`
- Restart the backend server

### "User not found" or "Invalid token"
- Verify user exists in Supabase Auth
- Check that `user_roles` table has an entry
- Make sure you're using the correct email/password

### Frontend can't connect to Supabase
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are in `frontend/.env`
- Restart the frontend dev server after adding env vars

### RLS Policy Errors
- The migration created RLS policies
- If you get permission errors, you may need to temporarily disable RLS for development
- Check the migration file for commented-out permissive policies

## ✅ Setup Checklist

- [ ] Added `SUPABASE_JWT_SECRET` to `backend/.env`
- [ ] Added Supabase env vars to `frontend/.env`
- [ ] Created admin user in Supabase Dashboard
- [ ] Added admin role using script or SQL
- [ ] Tested admin login
- [ ] Tested customer registration

Once all items are checked, you're ready to use the authentication system!

