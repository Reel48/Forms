# Vercel Deployment Troubleshooting

## Issue: Vercel Not Auto-Deploying on GitHub Push

If Vercel is not automatically deploying when you push to GitHub, check the following:

## Common Causes

### 1. GitHub Integration Not Connected
- Go to [Vercel Dashboard](https://vercel.com/dashboard)
- Click on your project
- Go to **Settings** → **Git**
- Verify that the GitHub repository is connected
- Check that the correct branch (`main`) is selected for production deployments

### 2. Production Branch Not Set
- In Vercel Dashboard → Settings → Git
- Ensure **Production Branch** is set to `main`
- Verify **Auto-deploy** is enabled

### 3. Build Errors Preventing Deployment
- Go to Vercel Dashboard → **Deployments**
- Check if there are any failed deployments
- Review build logs for errors
- Common issues:
  - Missing environment variables
  - Build command failures
  - TypeScript compilation errors

### 4. Vercel Project Not Linked to Repository
- In Vercel Dashboard → Settings → Git
- If repository shows as "Not connected", click **Connect Git Repository**
- Select your repository: `Reel48/Forms`
- Ensure it's connected to the correct branch

## Quick Fixes

### Option 1: Manual Redeploy
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project
3. Go to **Deployments** tab
4. Click the three dots (⋯) on the latest deployment
5. Click **Redeploy**
6. Select "Use existing Build Cache" (optional)
7. Click **Redeploy**

### Option 2: Trigger via Vercel CLI
```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Login to Vercel
vercel login

# Link project (if not already linked)
cd /Users/brayden/Forms/Forms
vercel link

# Deploy to production
vercel --prod
```

### Option 3: Check GitHub Webhook
1. Go to GitHub repository: https://github.com/Reel48/Forms
2. Go to **Settings** → **Webhooks**
3. Look for a Vercel webhook
4. If missing, Vercel needs to be reconnected:
   - Go to Vercel Dashboard → Settings → Git
   - Disconnect and reconnect the repository

### Option 4: Verify vercel.json Configuration
The `vercel.json` file should be in the root directory and contain:
- `buildCommand`: `cd frontend && npm install && npm run build`
- `outputDirectory`: `frontend/dist`
- `rewrites`: Configured for SPA routing

## Verification Steps

1. **Check Recent Commits**
   ```bash
   git log --oneline -5
   ```
   Verify your commits are on the `main` branch

2. **Check Vercel Dashboard**
   - Go to Deployments tab
   - Look for deployments matching your commit hashes
   - Check deployment status (Building, Ready, Error)

3. **Check Build Logs**
   - Click on a deployment in Vercel Dashboard
   - Review the build logs for errors
   - Common errors:
     - Missing dependencies
     - TypeScript errors
     - Environment variable issues

## If Still Not Working

1. **Disconnect and Reconnect Repository**
   - Vercel Dashboard → Settings → Git
   - Click "Disconnect"
   - Click "Connect Git Repository"
   - Select `Reel48/Forms`
   - Configure settings:
     - Framework Preset: Vite
     - Root Directory: `/` (root)
     - Build Command: `cd frontend && npm install && npm run build`
     - Output Directory: `frontend/dist`

2. **Check Vercel Project Settings**
   - Ensure project is not paused
   - Check that auto-deploy is enabled
   - Verify production branch is `main`

3. **Contact Vercel Support**
   - If none of the above works, there may be an account or billing issue
   - Check Vercel Dashboard for any warnings or notifications

## Current Configuration

Your `vercel.json` is configured with:
- ✅ Build command: `cd frontend && npm install && npm run build`
- ✅ Output directory: `frontend/dist`
- ✅ Rewrites for SPA routing
- ✅ Headers for static assets

This configuration should work correctly with Vercel's auto-deployment.

