# Fix: "Google maps can't load this address correctly"

## Problem
You're seeing the error: "Google maps can't load this address correctly" and being asked "Do you own this website?"

This happens when your Google API key has HTTP referrer restrictions that don't include your Vercel domain.

## Quick Fix (5 minutes)

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/apis/credentials
2. Find your API key (starts with `AIzaSyB0q...`)
3. Click on it to edit

### Step 2: Update Application Restrictions

**Option A: Remove Restrictions (For Testing)**
1. Under "Application restrictions"
2. Select **"None"**
3. Click **"Save"**
4. Wait 1-2 minutes
5. Refresh your application
6. ✅ Should work now!

**Option B: Add Your Domain (For Production)**
1. Under "Application restrictions"
2. Select **"HTTP referrers (web sites)"**
3. Click **"Add an item"**
4. Add these referrers (one per line):
   ```
   *.vercel.app/*
   localhost:*
   *://localhost:*
   ```
5. If you have a custom domain, also add:
   ```
   yourdomain.com/*
   https://yourdomain.com/*
   ```
6. Click **"Save"**
7. Wait 1-2 minutes
8. Refresh your application

### Step 3: Verify It Works
1. Go to your application
2. Try using the address autocomplete
3. Should work without errors!

## Why This Happens

Google Maps API keys can be restricted to specific domains for security. If your Vercel domain isn't in the allowed list, Google blocks the requests and shows that error message.

## Your Vercel Domain

Your Vercel domain is likely something like:
- `https://your-app-name.vercel.app`
- `https://your-app-name-git-main.vercel.app` (preview)
- `https://your-app-name-*.vercel.app` (all previews)

The pattern `*.vercel.app/*` covers all of these.

## Still Not Working?

1. **Check API restrictions:**
   - Make sure "Maps JavaScript API" and "Places API" are both allowed
   - Go to: APIs & Services → Credentials → Your API Key
   - Check "API restrictions" section

2. **Wait longer:**
   - Changes can take 1-5 minutes to propagate
   - Try clearing browser cache
   - Try incognito/private window

3. **Verify the key:**
   - Make sure you're using the correct API key
   - Check Vercel environment variables match

4. **Check billing:**
   - Make sure billing is enabled in Google Cloud Console
   - Even with free tier, billing must be enabled

## Security Note

For production, you should:
- ✅ Use HTTP referrer restrictions (Option B)
- ✅ Only allow your actual domains
- ✅ Regularly review and update restrictions
- ❌ Don't leave it as "None" in production

For development/testing:
- ✅ "None" is fine temporarily
- ✅ Or use `localhost:*` restriction

