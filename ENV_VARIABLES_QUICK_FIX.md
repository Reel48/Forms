# Quick Fix: Environment Variables Setup

## ⚠️ URGENT: Re-add the Anon Key

You deleted `VITE_SUPABASE_ANON_KEY` from non-production environments, but **this key is required** for:
- User authentication (login, signup, logout)
- Session management
- All regular Supabase operations

**The app will break without it!**

## Required Environment Variables in Vercel

You need **ALL 3** of these variables set for **ALL environments** (Production, Preview, Development):

### 1. `VITE_SUPABASE_URL`
- Your Supabase project URL
- Example: `https://boisewltuwcjfrdjnfwd.supabase.co`

### 2. `VITE_SUPABASE_ANON_KEY` ⚠️ RE-ADD THIS
- Used for authentication and regular operations
- Get from: Supabase Dashboard → Settings → API → anon/public key
- **Must be set in ALL environments**

### 3. `VITE_SUPABASE_SERVICE_ROLE_KEY` ✅ You added this
- Used ONLY for Realtime subscriptions
- Get from: Supabase Dashboard → Settings → API → service_role key
- **Must be set in ALL environments**

## Quick Steps to Fix

1. **Go to Vercel:** https://vercel.com/dashboard → Your Project → Settings → Environment Variables

2. **Add `VITE_SUPABASE_ANON_KEY`:**
   - Click "Add New"
   - Key: `VITE_SUPABASE_ANON_KEY`
   - Value: (your anon key from Supabase)
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Save

3. **Verify `VITE_SUPABASE_SERVICE_ROLE_KEY` is set:**
   - Should be set for all environments
   - If not, add it the same way

4. **Redeploy:**
   - Go to Deployments tab
   - Click ⋯ on latest deployment
   - Click Redeploy

## Why Both Keys?

```
┌─────────────────────────────────────────┐
│  Anon Key (VITE_SUPABASE_ANON_KEY)      │
│  ├─ Authentication (login/signup)      │
│  ├─ Session management                  │
│  └─ Regular database queries            │
│     └─ Protected by RLS                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Service Role Key                       │
│  (VITE_SUPABASE_SERVICE_ROLE_KEY)       │
│  └─ Realtime WebSocket subscriptions   │
│     └─ Bypasses RLS (filtered)         │
└─────────────────────────────────────────┘
```

## After Fixing

Check browser console - you should see:
- ✅ `Realtime client check: { hasServiceRoleKey: true, ... }`
- ✅ `⚠️ Using service role key for Realtime - RLS is bypassed!`
- ✅ WebSocket connects successfully
- ✅ Authentication works (can login/logout)

