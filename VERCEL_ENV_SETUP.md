# Vercel Environment Variables Setup

## Required Environment Variables

Add these to your Vercel project:

### 1. Go to Vercel Dashboard
1. Go to: https://vercel.com/dashboard
2. Select your project (Forms)
3. Go to **Settings** → **Environment Variables**

### 2. Add These Variables

#### VITE_SUPABASE_URL
- **Key:** `VITE_SUPABASE_URL`
- **Value:** `https://boisewltuwcjfrdjnfwd.supabase.co`
- **Environment:** Production, Preview, Development (all)

#### VITE_SUPABASE_ANON_KEY
- **Key:** `VITE_SUPABASE_ANON_KEY`
- **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4`
- **Environment:** Production, Preview, Development (all)

#### VITE_API_URL (Update if needed)
- **Key:** `VITE_API_URL`
- **Value:** `https://uvpc5mx3se.us-east-1.awsapprunner.com` (your App Runner URL)
- **Environment:** Production, Preview, Development (all)

## Quick Steps

1. **Open Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Click on your project

2. **Navigate to Environment Variables:**
   - Settings → Environment Variables

3. **Add each variable:**
   - Click "Add New"
   - Enter the Key
   - Enter the Value
   - Select environments (Production, Preview, Development)
   - Click "Save"

4. **Redeploy:**
   - After adding variables, go to Deployments
   - Click the three dots on the latest deployment
   - Click "Redeploy"
   - Or push a new commit to trigger auto-deploy

## Verification

After redeploying, check the browser console - the error should be gone.

## Alternative: Using Vercel CLI

If you prefer CLI:

```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Login
vercel login

# Link project (if not already linked)
vercel link

# Add environment variables
vercel env add VITE_SUPABASE_URL production
# Paste: https://boisewltuwcjfrdjnfwd.supabase.co

vercel env add VITE_SUPABASE_ANON_KEY production
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4

vercel env add VITE_API_URL production
# Paste: https://uvpc5mx3se.us-east-1.awsapprunner.com
```

