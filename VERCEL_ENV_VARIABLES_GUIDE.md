# Vercel Environment Variables Setup Guide

## Required Environment Variables

You need **BOTH** the anon key and service role key, but they serve different purposes:

### 1. `VITE_SUPABASE_URL` (Required)
- **Purpose:** Your Supabase project URL
- **Where to find:** Supabase Dashboard → Settings → API → Project URL
- **Example:** `https://boisewltuwcjfrdjnfwd.supabase.co`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

### 2. `VITE_SUPABASE_ANON_KEY` (Required)
- **Purpose:** Used for ALL regular Supabase operations:
  - User authentication (sign in, sign up, sign out)
  - Session management
  - Auth state changes
  - Client-side database queries (if any)
- **Where to find:** Supabase Dashboard → Settings → API → anon/public key
- **Security:** Safe to expose in frontend (protected by RLS policies)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- **⚠️ CRITICAL:** This must be set in ALL environments or the app will break!

### 3. `VITE_SUPABASE_SERVICE_ROLE_KEY` (Required for Realtime)
- **Purpose:** Used ONLY for Realtime WebSocket subscriptions
- **Where to find:** Supabase Dashboard → Settings → API → service_role key
- **Security:** ⚠️ **WARNING** - This bypasses RLS! Only used for Realtime subscriptions.
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- **Note:** If not set, Realtime will fall back to anon key (may fail with RLS)

## Current Setup Status

Based on your changes:
- ✅ Service role key: Added
- ❌ Anon key: Deleted from non-production environments (THIS WILL BREAK THE APP)

## Action Required

### Step 1: Re-add the Anon Key to All Environments

1. Go to Vercel Dashboard: https://vercel.com/dashboard
2. Select your project: `Forms`
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add:
   - **Key:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** (your anon key from Supabase)
   - **Environments:** Select ALL:
     - ✅ Production
     - ✅ Preview
     - ✅ Development
6. Click **Save**

### Step 2: Verify All Variables Are Set

You should have these 3 variables set for ALL environments:

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| `VITE_SUPABASE_URL` | ✅ | ✅ | ✅ |
| `VITE_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ |

### Step 3: Redeploy

After adding the anon key back:
1. Go to **Deployments** tab
2. Click **⋯** on the latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

## Why Both Keys Are Needed

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend App                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Regular Operations (Auth, Queries)                     │
│  └─ Uses: VITE_SUPABASE_ANON_KEY                        │
│     └─ Protected by RLS policies                        │
│                                                          │
│  Realtime Subscriptions (Chat)                          │
│  └─ Uses: VITE_SUPABASE_SERVICE_ROLE_KEY               │
│     └─ Bypasses RLS (filtered by conversation_id)       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Security Considerations

### Anon Key
- ✅ Safe to expose in frontend
- ✅ Protected by Row Level Security (RLS)
- ✅ Users can only access data they're allowed to see

### Service Role Key
- ⚠️ **WARNING:** Exposed in frontend JavaScript bundle
- ⚠️ Bypasses RLS policies
- ✅ **Mitigation:** Only used for Realtime subscriptions
- ✅ **Protection:** Subscriptions are filtered by `conversation_id`
- ✅ **Additional:** Frontend still validates user permissions before displaying data

## Testing After Setup

1. **Check Console Logs:**
   ```
   Realtime client check: { hasServiceRoleKey: true, ... }
   ⚠️ Using service role key for Realtime - RLS is bypassed!
   ```

2. **Verify WebSocket URL:**
   - Should show service role key (not anon key)
   - Should connect successfully

3. **Test Authentication:**
   - Sign in/out should work
   - Session should persist

4. **Test Realtime:**
   - Open chat widget
   - Send a message
   - Should appear instantly without polling

## Troubleshooting

### App breaks after removing anon key
- **Symptom:** Login doesn't work, auth errors
- **Fix:** Re-add `VITE_SUPABASE_ANON_KEY` to all environments

### Realtime still not working
- **Check:** Console logs show `hasServiceRoleKey: false`
- **Fix:** Verify `VITE_SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
- **Check:** WebSocket URL should show service role key

### Build fails
- **Check:** All 3 environment variables are set
- **Fix:** Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present

