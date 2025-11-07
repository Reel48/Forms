# Vercel Deployment Guide

This guide will help you deploy the Quote Builder frontend to Vercel.

## Important Notes

⚠️ **The backend (FastAPI) needs to be deployed separately** - Vercel doesn't support Python backends without serverless functions. You have two options:

### Option 1: Deploy Backend Separately (Recommended)
Deploy your FastAPI backend to:
- **AWS App Runner** - Managed container deployment (current setup)
- **Render** (https://render.com) - Free tier available
- **Fly.io** (https://fly.io) - Good performance
- **DigitalOcean App Platform** - Simple deployment

Then update `VITE_API_URL` in Vercel to point to your deployed backend URL.

### Option 2: Convert Backend to Vercel Serverless Functions
This requires rewriting the backend as serverless functions (more complex).

## Frontend Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "New Project"
4. Import your repository: `Reel48/Forms`

### 2. Configure Vercel Project Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:

- **Framework Preset**: Vite
- **Root Directory**: Leave as root (we handle this in vercel.json)
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`

### 3. Set Environment Variables

In Vercel project settings → Environment Variables, add:

```
VITE_API_URL = https://your-backend-url.com
```

**Important**: Replace `https://your-backend-url.com` with your actual deployed backend URL.

### 4. Deploy

Click "Deploy" and Vercel will:
1. Install dependencies
2. Build your React app
3. Deploy it

## Backend Deployment (AWS App Runner)

Your backend is deployed on AWS App Runner. See `AWS_BACKEND_DEPLOYMENT.md` for complete setup instructions.

**Your backend URL:**
```
https://uvpc5mx3se.us-east-1.awsapprunner.com
```

Use this URL for `VITE_API_URL` in Vercel.

## Troubleshooting

### 404 Errors

If you're getting 404 errors:
1. ✅ Check that `vercel.json` exists in the root
2. ✅ Verify the `rewrites` configuration is correct
3. ✅ Make sure the build output is `frontend/dist`
4. ✅ Check that React Router routes are working (all routes should serve index.html)

### API Connection Errors

If the frontend can't connect to the backend:
1. ✅ Check `VITE_API_URL` environment variable in Vercel
2. ✅ Ensure your backend is deployed and accessible
3. ✅ Verify CORS is configured on your backend to allow your Vercel domain
4. ✅ Check browser console for specific error messages

### Build Errors

If the build fails:
1. ✅ Check that all dependencies are in `package.json`
2. ✅ Verify Node.js version compatibility
3. ✅ Check build logs in Vercel dashboard

## Testing Locally

Before deploying, test the build locally:

```bash
cd frontend
npm install
npm run build
npm run preview
```

This will show you if the build works correctly.

