-- Create AI Assistant User Account "Ocho"
-- This creates a special user account for the AI assistant so messages are clearly identified

-- Step 1: Create the user in auth.users using Supabase Auth Admin API
-- Note: This must be done via the Supabase Admin API, not directly in SQL
-- The user will be created with:
--   Email: ocho@reel48.ai (or similar)
--   Password: (random secure password, never used for login)
--   Email confirmed: true (so it doesn't require verification)

-- Step 2: After the user is created, we'll get their UUID and use it here
-- For now, we'll create a placeholder that will be updated

-- Create user role entry for AI assistant
-- This will be inserted after the user is created via API
-- The role will be 'ai' or 'assistant' to distinguish from regular users

-- Note: The actual user creation must be done via Supabase Admin API
-- This migration assumes the user has been created and we're just setting up the role

-- Check if AI user already exists (by email)
DO $$
DECLARE
    ai_user_id UUID;
    ai_email TEXT := 'ocho@reel48.ai';
BEGIN
    -- Try to find existing AI user by email
    SELECT id INTO ai_user_id
    FROM auth.users
    WHERE email = ai_email
    LIMIT 1;
    
    -- If user exists, create/update role
    IF ai_user_id IS NOT NULL THEN
        -- Insert or update user role
        INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            ai_user_id,
            'ai',
            NOW(),
            NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET role = 'ai',
            updated_at = NOW();
        
        RAISE NOTICE 'AI user role created/updated for user: %', ai_user_id;
    ELSE
        RAISE NOTICE 'AI user not found. Please create the user via Supabase Admin API first.';
        RAISE NOTICE 'Email: %', ai_email;
        RAISE NOTICE 'After creating the user, run this migration again.';
    END IF;
END $$;

-- Create client record for Ocho (optional, for consistency)
DO $$
DECLARE
    ai_user_id UUID;
BEGIN
    -- Find AI user
    SELECT id INTO ai_user_id
    FROM auth.users
    WHERE email = 'ocho@reel48.ai'
    LIMIT 1;
    
    -- If user exists, create client record
    IF ai_user_id IS NOT NULL THEN
        INSERT INTO clients (name, email, user_id, registration_source)
        VALUES (
            'Ocho',
            'ocho@reel48.ai',
            ai_user_id,
            'system'
        )
        ON CONFLICT (user_id) DO UPDATE
        SET name = 'Ocho',
            email = 'ocho@reel48.ai',
            updated_at = NOW();
        
        RAISE NOTICE 'Client record created/updated for Ocho';
    END IF;
END $$;

