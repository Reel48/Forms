# Realtime Setup Instructions - Service Role Key

## Current Issue

The WebSocket connection is still using the anon key because `VITE_SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel environment variables.

## Required Setup

### Step 1: Get Your Service Role Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `boisewltuwcjfrdjnfwd`
3. Navigate to **Settings** → **API**
4. Find the **service_role** key (NOT the anon key)
5. Copy the entire key (it's a long JWT token)

### Step 2: Add to Vercel Environment Variables

1. Go to Vercel Dashboard: https://vercel.com/dashboard
2. Select your project: `Forms`
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add the following:
   - **Key:** `VITE_SUPABASE_SERVICE_ROLE_KEY`
   - **Value:** (paste your service role key from Supabase)
   - **Environments:** Select ALL:
     - ✅ Production
     - ✅ Preview
     - ✅ Development
6. Click **Save**

### Step 3: Redeploy

After adding the environment variable, you need to redeploy:

**Option A: Manual Redeploy**
1. Go to **Deployments** tab in Vercel
2. Click the **⋯** menu on the latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

**Option B: Trigger via Git**
```bash
# Make a small change and push
git commit --allow-empty -m "Trigger redeploy for service role key"
git push origin main
```

### Step 4: Verify

After redeploy, check the browser console. You should see:
```
Realtime client check: { hasServiceRoleKey: true, ... }
⚠️ Using service role key for Realtime - RLS is bypassed!
```

And the WebSocket URL should show the service role key instead of the anon key.

## Security Warning

⚠️ **IMPORTANT**: The service role key will be visible in the frontend JavaScript bundle. Anyone can extract it from the browser. This bypasses all Row Level Security (RLS) policies.

**Current Protections:**
- Realtime subscriptions are filtered by `conversation_id` in the channel filter
- Frontend still validates user permissions before displaying data
- REST API calls still use proper authentication

## Alternative: If Service Role Key Doesn't Work

If the WebSocket connection still fails even with the service role key, the issue might be:
1. Network/firewall blocking WebSocket connections
2. Supabase Realtime service issue
3. Browser/extension blocking WebSocket connections

In that case, we should continue using polling (every 3 seconds) which is reliable and secure.

