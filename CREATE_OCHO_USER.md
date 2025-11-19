# Create Ocho AI User Account

## Option 1: Manual Creation via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/boisewltuwcjfrdjnfwd
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** or **"Create new user"**
4. Fill in:
   - **Email**: `ocho@reel48.ai`
   - **Password**: (generate a secure random password - it won't be used for login)
   - **Auto Confirm User**: ✅ Check this box
   - **User Metadata**:
     ```json
     {
       "name": "Ocho",
       "is_ai": true
     }
     ```
5. Click **"Create user"**
6. Copy the **User ID** (UUID) that is created
7. Run the SQL migration below to set up the role and client record

## Option 2: Run the Python Script (If you have service role key)

If you have `SUPABASE_SERVICE_ROLE_KEY` set in your environment:

```bash
cd backend
python3 create_ocho_user.py
```

## SQL Migration

After creating the user, run this SQL in Supabase SQL Editor (replace `USER_ID_HERE` with the actual UUID):

```sql
-- Replace USER_ID_HERE with the actual user ID from Supabase Auth
DO $$
DECLARE
    ocho_user_id UUID := 'USER_ID_HERE';  -- Replace with actual UUID
BEGIN
    -- Create user role entry
    INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        ocho_user_id,
        'ai',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'ai',
        updated_at = NOW();
    
    -- Create client record
    INSERT INTO clients (name, email, user_id, registration_source)
    VALUES (
        'Ocho',
        'ocho@reel48.ai',
        ocho_user_id,
        'system'
    )
    ON CONFLICT (user_id) DO UPDATE
    SET name = 'Ocho',
        email = 'ocho@reel48.ai',
        updated_at = NOW();
    
    RAISE NOTICE 'Ocho user account setup complete!';
END $$;
```

## After Setup

1. Add the user ID to your `.env` file:
   ```
   OCHO_USER_ID=<the-user-id-uuid>
   ```

2. The code will automatically use this user ID for AI messages

