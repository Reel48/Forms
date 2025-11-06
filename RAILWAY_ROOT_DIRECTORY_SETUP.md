# Railway Root Directory Setup - Manual Steps Required

## ⚠️ Root Directory Must Be Set Manually

Railway MCP doesn't support setting the root directory programmatically. You need to set it in the Railway dashboard.

## Quick Setup Steps

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Sign in if needed

2. **Navigate to Your Service**
   - Click on your project: **"forms"**
   - Click on the service: **"Forms"**

3. **Open Service Settings**
   - Click **"Settings"** tab (top right)
   - Scroll down to **"Service"** section

4. **Set Root Directory**
   - Find **"Root Directory"** field
   - Enter: `backend`
   - Click **"Update"** or **"Save"**

5. **Redeploy**
   - Railway will automatically trigger a new deployment
   - Or click **"Deploy"** button to manually trigger

## What This Fixes

Currently, Railway is trying to build from the root directory, which causes:
- ❌ Railpack can't detect Python (it's in `backend/` not root)
- ❌ Build fails because no `requirements.txt` in root
- ❌ All deployments fail

After setting root directory to `backend`:
- ✅ Railway will look in `backend/` for `requirements.txt`
- ✅ Railway will detect Python from `backend/runtime.txt`
- ✅ Build will succeed
- ✅ Deployment will work

## Current Status

- ✅ Supabase URL: Added to Railway variables
- ✅ Configuration files: All set up correctly
- ❌ Root Directory: Needs to be set to `backend` (manual step)
- ❌ Build: Currently failing (will work after root directory is set)

## After Setting Root Directory

Once you set the root directory and Railway redeploys, I can:
- Check the deployment logs
- Verify the build succeeded
- Test the deployment
- Add remaining environment variables (SUPABASE_KEY, ALLOWED_ORIGINS, etc.)

Let me know once you've set it, and I'll check the deployment!

