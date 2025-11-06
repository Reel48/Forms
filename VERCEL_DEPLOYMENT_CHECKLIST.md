# Vercel Deployment Checklist

## ✅ Pre-Deployment Checklist

### Frontend (Vercel)
- [x] `vercel.json` configured correctly
- [x] Frontend uses `VITE_API_URL` environment variable
- [x] No hardcoded localhost URLs (only fallback)
- [x] Build output directory configured (`frontend/dist`)

### Backend (Railway/Render/etc)
- [x] CORS configured via `ALLOWED_ORIGINS` environment variable
- [x] Environment variables ready for production
- [ ] Backend deployed and accessible
- [ ] Backend URL obtained

## 🚀 Deployment Steps

### Step 1: Deploy Backend First

**Option A: Railway (Recommended)**
1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository
4. Set Root Directory: `backend`
5. Add Environment Variables:
   ```
   SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app,http://localhost:5173
   ```
   ⚠️ **Replace `your-app` with your actual Vercel domain**
6. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Copy your Railway URL (e.g., `https://your-app.railway.app`)

**Option B: Render**
1. Go to [render.com](https://render.com)
2. New Web Service → Connect GitHub repo
3. Settings:
   - Build Command: `cd backend && pip install -r requirements.txt`
   - Start Command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add same environment variables as above
5. Copy your Render URL

### Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com)
2. New Project → Import GitHub repository
3. Vercel will auto-detect settings from `vercel.json`
4. **Add Environment Variable**:
   ```
   VITE_API_URL=https://your-backend.railway.app
   ```
   ⚠️ **Use your actual backend URL from Step 1**
5. Click Deploy

### Step 3: Update Backend CORS

After Vercel deployment, update backend `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-actual-vercel-domain.vercel.app,https://your-actual-vercel-domain-git-main.vercel.app,http://localhost:5173
```

Vercel provides multiple URLs:
- Production: `https://your-app.vercel.app`
- Preview: `https://your-app-git-branch.vercel.app`
- Custom domain (if configured)

## 🔧 Environment Variables Summary

### Vercel (Frontend)
```
VITE_API_URL=https://your-backend-url.com
```

### Railway/Render (Backend)
```
SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://your-vercel-app-git-main.vercel.app,http://localhost:5173
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
STRIPE_WEBHOOK_SECRET=whsec_... (get from Stripe Dashboard after setting up webhook)
```

## ✅ Post-Deployment Verification

1. **Test Frontend**: Visit your Vercel URL
2. **Test API Connection**: Open browser console, check for API errors
3. **Test CORS**: Try creating a client or quote
4. **Check Backend Logs**: Verify requests are coming through

## 🐛 Troubleshooting

### CORS Errors
- ✅ Verify `ALLOWED_ORIGINS` includes your exact Vercel URL
- ✅ Check for trailing slashes (shouldn't have any)
- ✅ Include both production and preview URLs

### API Connection Errors
- ✅ Verify `VITE_API_URL` is set in Vercel
- ✅ Check backend is running and accessible
- ✅ Test backend URL directly: `https://your-backend.railway.app/health`

### Build Errors
- ✅ Check Vercel build logs
- ✅ Verify `vercel.json` is in root directory
- ✅ Ensure `frontend/dist` exists after build

## 📝 Notes

- Vercel automatically handles preview deployments for PRs
- Each preview gets its own URL - you may want to allow all `*.vercel.app` domains
- For custom domains, add them to `ALLOWED_ORIGINS`
- Backend environment variables are already configured in your `.env` file

