# Setup Ocho AI User Account

## Quick Setup Instructions

To create the Ocho AI user account, follow these steps:

### Step 1: Create User in Supabase Dashboard

1. Go to your Supabase project: https://supabase.com/dashboard/project/boisewltuwcjfrdjnfwd
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
6. **Copy the User ID (UUID)** - you'll need this!

### Step 2: Run SQL Migration

After creating the user, go to **SQL Editor** in Supabase and run this SQL (replace `USER_ID_HERE` with the actual UUID from Step 1):

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
    
    RAISE NOTICE 'Ocho user account setup complete! User ID: %', ocho_user_id;
END $$;
```

### Step 3: Set Environment Variable (Optional but Recommended)

Add the Ocho user ID to your environment variables:

**For AWS App Runner:**
1. Go to AWS App Runner Console → Your Service
2. Configuration → Edit
3. Environment Variables → Add:
   - Key: `OCHO_USER_ID`
   - Value: `<the-user-id-uuid-from-step-1>`
4. Save

**For Local Development:**
Add to your `.env` file:
```
OCHO_USER_ID=<the-user-id-uuid-from-step-1>
```

### Step 4: Verify Setup

After deployment, the system will:
- Automatically detect Ocho's user ID from the database if `OCHO_USER_ID` env var is not set
- Use Ocho's user ID for all AI messages
- Display "Ocho" as the sender name in the chat interface

## What This Does

- Creates a proper user account for the AI assistant named "Ocho"
- Messages from Ocho will show "Ocho" as the sender (not "AI Assistant")
- Ocho appears as a separate user in the chat, distinct from admins
- All AI responses will use Ocho's user ID

## Troubleshooting

If AI messages still don't work:
1. Check that the user was created successfully in Supabase Auth
2. Verify the SQL migration ran successfully
3. Check backend logs for Ocho user ID detection
4. Ensure `OCHO_USER_ID` environment variable is set (or the database lookup works)

