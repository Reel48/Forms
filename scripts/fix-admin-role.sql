-- Fix Admin Role for admin@reel48.com
-- Run this in Supabase SQL Editor

-- First, check current state
SELECT 
  u.id,
  u.email,
  COALESCE(ur.role, 'customer') as current_role,
  ur.id as role_id
FROM auth.users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'admin@reel48.com';

-- Then, set admin role (this will create or update)
INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  u.id,
  'admin',
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'admin@reel48.com'
ON CONFLICT (user_id) DO UPDATE
SET 
  role = 'admin',
  updated_at = NOW();

-- Verify it worked
SELECT 
  u.id,
  u.email,
  ur.role,
  ur.updated_at
FROM auth.users u
JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'admin@reel48.com';

