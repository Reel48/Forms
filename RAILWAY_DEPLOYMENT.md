# Railway Backend Deployment

This is a guide for deploying the FastAPI backend to Railway.

## Railway Setup

1. **Create Account**: Go to [railway.app](https://railway.app) and sign in with GitHub

2. **New Project**: Click "New Project" → "Deploy from GitHub repo"
   - Select your `Reel48/Forms` repository

3. **Configure Service**:
   - **Root Directory**: Set to `backend` (IMPORTANT!)
   - Railway will auto-detect Python from `requirements.txt` and `runtime.txt`
   - Builder is configured as `railpack` in `railway.json` files
   - Start Command is auto-detected from `Procfile` or `railway.json`
   - No need to manually set build/start commands - they're configured in the files

4. **Environment Variables**:
   Add these in Railway dashboard (Settings → Variables):
   ```
   SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
   SUPABASE_KEY=your-anon-key-here
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
   ```
   Note: `PORT` is automatically set by Railway - don't set it manually

5. **Get Your URL**:
   - Railway will generate a URL like `https://your-app.railway.app`
   - Copy this URL

6. **Update Frontend**:
   - In Vercel, set `VITE_API_URL` to your Railway URL
   - Example: `VITE_API_URL=https://your-app.railway.app`

## Alternative: Render Deployment

1. Go to [render.com](https://render.com)
2. Create a new "Web Service"
3. Connect your GitHub repository
4. Settings:
   - **Build Command**: `cd backend && pip install -r requirements.txt`
   - **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables
6. Deploy and get your URL

## CORS Configuration

The backend now supports CORS configuration via environment variable `ALLOWED_ORIGINS`. 
Set it in your deployment platform to include your Vercel URL.

Example:
```
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app.vercel.app/*
```

